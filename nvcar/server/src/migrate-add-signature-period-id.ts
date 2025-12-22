/**
 * Migration: Add signaturePeriodId to existing TemplateSignature records
 * 
 * This migration adds the signaturePeriodId field to all existing signature records
 * that don't have one. The signaturePeriodId is computed from the signature's signedAt
 * date and type to determine which school year and period it belongs to.
 * 
 * Run with: npx ts-node src/migrate-add-signature-period-id.ts
 */

import mongoose from 'mongoose'
import { TemplateSignature } from './models/TemplateSignature'
import { SchoolYear } from './models/SchoolYear'
import { computeSignaturePeriodId, SignaturePeriodType } from './utils/readinessUtils'

async function migrate() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/livret'

    console.log('Connecting to MongoDB...')
    await mongoose.connect(mongoUri)
    console.log('Connected.')

    // Fetch all school years for date range mapping
    const schoolYears = await SchoolYear.find({}).sort({ startDate: 1 }).lean()
    console.log(`Found ${schoolYears.length} school years`)

    // Find all signatures without signaturePeriodId
    const signaturesWithoutPeriodId = await TemplateSignature.find({
        $or: [
            { signaturePeriodId: { $exists: false } },
            { signaturePeriodId: null },
            { signaturePeriodId: '' }
        ]
    }).lean()

    console.log(`Found ${signaturesWithoutPeriodId.length} signatures without signaturePeriodId`)

    let updatedCount = 0
    let errorCount = 0

    for (const sig of signaturesWithoutPeriodId) {
        try {
            const signedAt = sig.signedAt ? new Date(sig.signedAt) : new Date()
            const type = (sig as any).type || 'standard'

            // Find the school year this signature belongs to
            let matchingYear: any = null
            for (const year of schoolYears) {
                const startDate = new Date(year.startDate)
                const endDate = new Date(year.endDate)

                if (signedAt >= startDate && signedAt <= endDate) {
                    matchingYear = year
                    break
                }
            }

            // If no exact match, try to find the closest school year before the signature date
            if (!matchingYear) {
                for (let i = schoolYears.length - 1; i >= 0; i--) {
                    const year = schoolYears[i]
                    const startDate = new Date(year.startDate)
                    if (signedAt >= startDate) {
                        matchingYear = year
                        break
                    }
                }
            }

            // If still no match, use the first school year or create a fallback
            if (!matchingYear && schoolYears.length > 0) {
                matchingYear = schoolYears[0]
            }

            let signaturePeriodId: string
            let schoolYearId: string | undefined

            if (matchingYear) {
                schoolYearId = String(matchingYear._id)

                // Determine period type based on signature type
                let periodType: SignaturePeriodType
                if (type === 'end_of_year') {
                    periodType = 'end_of_year'
                } else {
                    // For standard signatures, check if it's in the first or second half of the school year
                    const startDate = new Date(matchingYear.startDate)
                    const endDate = new Date(matchingYear.endDate)
                    const midPoint = new Date((startDate.getTime() + endDate.getTime()) / 2)

                    periodType = signedAt < midPoint ? 'sem1' : 'sem2'
                }

                signaturePeriodId = computeSignaturePeriodId(schoolYearId, periodType)
            } else {
                // Fallback for signatures without a matching school year
                const year = signedAt.getFullYear()
                const month = signedAt.getMonth()
                const startYear = month >= 8 ? year : year - 1
                const periodType: SignaturePeriodType = type === 'end_of_year' ? 'end_of_year' : 'sem1'
                signaturePeriodId = `fallback_${startYear}_${periodType}`
            }

            // Update the signature
            await TemplateSignature.updateOne(
                { _id: sig._id },
                {
                    $set: {
                        signaturePeriodId,
                        ...(schoolYearId ? { schoolYearId } : {})
                    }
                }
            )

            updatedCount++
            if (updatedCount % 100 === 0) {
                console.log(`Updated ${updatedCount} signatures...`)
            }
        } catch (err) {
            console.error(`Error updating signature ${sig._id}:`, err)
            errorCount++
        }
    }

    console.log(`\nMigration complete:`)
    console.log(`  - Updated: ${updatedCount}`)
    console.log(`  - Errors: ${errorCount}`)
    console.log(`  - Already had signaturePeriodId: ${signaturesWithoutPeriodId.length - updatedCount - errorCount}`)

    // Verify the unique index can be created
    try {
        console.log('\nVerifying unique index...')
        await TemplateSignature.collection.createIndex(
            { templateAssignmentId: 1, type: 1, signaturePeriodId: 1, level: 1 },
            {
                unique: true,
                partialFilterExpression: { signaturePeriodId: { $exists: true } },
                name: 'unique_signature_per_period'
            }
        )
        console.log('Unique index created successfully!')
    } catch (err: any) {
        if (err.code === 11000) {
            console.error('ERROR: Duplicate signatures detected! Please review the following query:')
            console.error('db.templatesignatures.aggregate([{$group:{_id:{templateAssignmentId:"$templateAssignmentId",type:"$type",signaturePeriodId:"$signaturePeriodId",level:"$level"},count:{$sum:1}}},{$match:{count:{$gt:1}}}])')
        } else if (err.code === 85 || err.code === 86) {
            console.log('Index already exists (this is fine).')
        } else {
            console.error('Error creating index:', err)
        }
    }

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB.')
}

migrate().catch(err => {
    console.error('Migration failed:', err)
    process.exit(1)
})
