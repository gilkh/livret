import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateSignature } from '../models/TemplateSignature'
import { Student } from '../models/Student'
import { SchoolYear } from '../models/SchoolYear'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { logAudit } from '../utils/auditLogger'
import { User } from '../models/User'
import { TemplateChangeLog } from '../models/TemplateChangeLog'
import { generateChangeId } from '../utils/changeId'
import {
    computeSignaturePeriodId,
    resolveCurrentSignaturePeriod,
    resolveEndOfYearSignaturePeriod,
    validateSignatureReadiness,
    SignaturePeriodType
} from '../utils/readinessUtils'

/**
 * Check if an error is a MongoDB duplicate key error (code 11000).
 * This happens when the unique compound index prevents duplicate signatures.
 */
function isDuplicateKeyError(err: any): boolean {
    if (!err) return false
    // MongoDB duplicate key error code
    if (err.code === 11000) return true
    // Check for WriteError with duplicate key
    if (err.writeErrors && err.writeErrors.some((e: any) => e.code === 11000)) return true
    // Check message for E11000 (MongoDB error format)
    if (typeof err.message === 'string' && err.message.includes('E11000')) return true
    return false
}

/**
 * Handle duplicate key error by reading the existing signature (read-on-conflict).
 * Returns the existing signature if found, throws otherwise.
 */
async function handleDuplicateKeyConflict(
    templateAssignmentId: string,
    type: string,
    signaturePeriodId: string,
    level?: string
): Promise<any> {
    // Read the existing signature that caused the conflict
    const query: any = { templateAssignmentId, type, signaturePeriodId }
    if (level) query.level = level

    const existingSignature = await TemplateSignature.findOne(query).lean()
    if (existingSignature) {
        // Signature already exists - throw friendly error
        throw new Error('already_signed')
    }
    // Edge case: signature was deleted between insert and read
    throw new Error('signature_conflict')
}

interface SignTemplateOptions {
    templateAssignmentId: string
    signerId: string
    type?: 'standard' | 'end_of_year'
    signatureUrl?: string
    req?: any
    level?: string
}

import { Level } from '../models/Level'
import mongoose from 'mongoose'

const computeYearNameFromRange = (name: string, offset: number) => {
    const match = String(name || '').match(/(\d{4})([-/.])(\d{4})/)
    if (!match) return ''
    const startYear = parseInt(match[1], 10)
    const sep = match[2]
    const endYear = parseInt(match[3], 10)
    if (Number.isNaN(startYear) || Number.isNaN(endYear)) return ''
    return `${startYear + offset}${sep}${endYear + offset}`
}

/**
 * Resolve signature school year and signaturePeriodId
 * Uses centralized readiness utils for consistency
 */
const resolveSignatureSchoolYearWithPeriod = async (
    activeYear: any | null,
    type: 'standard' | 'end_of_year',
    now: Date
): Promise<{ schoolYearId: string | undefined; schoolYearName: string; signaturePeriodId: string }> => {
    // If no active year, we cannot reliably determine signaturePeriodId
    if (!activeYear) {
        const currentYear = now.getFullYear()
        const month = now.getMonth()
        const startYear = month >= 8 ? currentYear : currentYear - 1
        // Generate a fallback period ID using date-based approach
        const fallbackYearName = type === 'end_of_year'
            ? `${startYear + 1}/${startYear + 2}`
            : `${startYear}/${startYear + 1}`
        const periodType: SignaturePeriodType = type === 'end_of_year' ? 'end_of_year' : 'sem1'
        // Use the fallback year name as part of the period ID since we don't have a real school year ID
        const signaturePeriodId = `fallback_${startYear}_${periodType}`
        return { schoolYearId: undefined, schoolYearName: fallbackYearName, signaturePeriodId }
    }

    const activeYearId = String(activeYear._id)

    if (type !== 'end_of_year') {
        // For standard signatures, use the current semester
        const activeSemester = (activeYear as any).activeSemester || 1
        const periodType: SignaturePeriodType = activeSemester === 1 ? 'sem1' : 'sem2'
        const signaturePeriodId = computeSignaturePeriodId(activeYearId, periodType)
        return {
            schoolYearId: activeYearId,
            schoolYearName: String(activeYear.name || ''),
            signaturePeriodId
        }
    }

    // For end_of_year, determine the target year and compute period ID
    let nextYear: any | null = null

    if (activeYear.sequence && Number(activeYear.sequence) > 0) {
        nextYear = await SchoolYear.findOne({ sequence: Number(activeYear.sequence) + 1 }).lean()
    }

    if (!nextYear) {
        const allYears = await SchoolYear.find({}).sort({ startDate: 1 }).lean()
        const idx = allYears.findIndex(y => String(y._id) === String(activeYear._id))
        if (idx >= 0 && idx < allYears.length - 1) nextYear = allYears[idx + 1]
    }

    // End-of-year signature period is tied to the current active year
    const signaturePeriodId = computeSignaturePeriodId(activeYearId, 'end_of_year')

    if (nextYear) {
        return {
            schoolYearId: String(nextYear._id),
            schoolYearName: String(nextYear.name || ''),
            signaturePeriodId
        }
    }

    const computedName = computeYearNameFromRange(String(activeYear.name || ''), 1)
    if (computedName) {
        const found = await SchoolYear.findOne({ name: computedName }).lean()
        if (found) {
            return {
                schoolYearId: String(found._id),
                schoolYearName: String(found.name || computedName),
                signaturePeriodId
            }
        }
        return { schoolYearId: undefined, schoolYearName: computedName, signaturePeriodId }
    }

    return {
        schoolYearId: activeYearId,
        schoolYearName: String(activeYear.name || ''),
        signaturePeriodId
    }
}

const getNextLevel = async (current: string) => {
    if (!current) return null

    // Try to find by DB order
    try {
        const currentDoc = await Level.findOne({ name: current }).lean()
        if (currentDoc) {
            const nextDoc = await Level.findOne({ order: currentDoc.order + 1 }).lean()
            if (nextDoc) return nextDoc.name
        }
    } catch (e) {
        console.error('Error calculating next level:', e)
    }

    // Fallback legacy logic
    const c = current.toUpperCase()
    if (c === 'TPS') return 'PS'
    if (c === 'PS') return 'MS'
    if (c === 'MS') return 'GS'
    if (c === 'GS') return 'EB1'
    if (c === 'KG1') return 'KG2'
    if (c === 'KG2') return 'KG3'
    if (c === 'KG3') return 'EB1'
    return null
}

export const signTemplateAssignment = async ({
    templateAssignmentId,
    signerId,
    type = 'standard',
    signatureUrl,
    req,
    level
}: SignTemplateOptions) => {
    // Get the template assignment
    const assignment = await TemplateAssignment.findById(templateAssignmentId)
    if (!assignment) {
        throw new Error('not_found')
    }

    // Check if already signed in the active school year
    const activeYear = await SchoolYear.findOne({ active: true }).lean()
    const baseQuery: any = { templateAssignmentId, type }

    if (activeYear) {
        let thresholdDate = activeYear.startDate

        // Try to find previous school year to determine the "gap"
        const previousYear = await SchoolYear.findOne({ endDate: { $lt: activeYear.startDate } })
            .sort({ endDate: -1 })
            .lean()

        if (previousYear) {
            thresholdDate = previousYear.endDate
        }

        // Use the later of endDate or current date as the upper bound
        const now = new Date()
        const endDate = new Date(activeYear.endDate)
        const upperBound = now > endDate ? now : endDate

        // CRITICAL FIX: If current date is before the threshold (future school year),
        // use one year ago as the threshold
        const oneYearAgo = new Date(now)
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
        const effectiveThreshold = new Date(thresholdDate) > now ? oneYearAgo : new Date(thresholdDate)

        baseQuery.signedAt = { $gt: effectiveThreshold, $lte: upperBound }
    }

    const existingQuery: any = (() => {
        if (!level) return baseQuery
        return {
            ...baseQuery,
            $or: [
                { level },
                { level: { $exists: false } },
                { level: null },
                { level: '' },
            ]
        }
    })()

    const existing = await TemplateSignature.findOne(existingQuery).lean()
    if (existing) {
        throw new Error('already_signed')
    }

    // Check completion status for the requested semester
    // standard -> Sem 1
    // end_of_year -> Sem 2
    if (type === 'standard') {
        if (!(assignment as any).isCompletedSem1) {
            // For backward compatibility, check isCompleted if isCompletedSem1 is undefined?
            // But we just added it.
            // If data is old, isCompletedSem1 might be missing.
            // We can fallback to assignment.isCompleted
            if (!(assignment as any).isCompletedSem1 && !assignment.isCompleted) {
                throw new Error('not_completed_sem1')
            }
        }
    } else if (type === 'end_of_year') {
        if (!(assignment as any).isCompletedSem2) {
            throw new Error('not_completed_sem2')
        }
    }

    // Create signature and persist metadata atomically using a transaction when possible
    const now = new Date()
    const { schoolYearId, schoolYearName, signaturePeriodId } = await resolveSignatureSchoolYearWithPeriod(activeYear, type, now)

    // Validate that we have a proper signaturePeriodId (required for DB-level uniqueness)
    if (!signaturePeriodId) {
        throw new Error('cannot_resolve_signature_period')
    }

    const pushObj = {
        type,
        signedAt: now,
        subAdminId: signerId,
        schoolYearId,
        schoolYearName,
        signaturePeriodId,
        level
    }

    // Start a session and try to use a transaction; if the server does not support transactions (e.g., standalone mongodb memory server),
    // fall back to best-effort and try to clean up on failure.
    let signature: any = null
    const session = await mongoose.startSession()
    let usedTransaction = true
    try {
        try {
            session.startTransaction()
        } catch (e) {
            // Transactions not supported in this environment
            usedTransaction = false
        }

        // Create the signature inside session if possible
        // The unique compound index (templateAssignmentId + type + signaturePeriodId + level) will enforce uniqueness at DB level
        let createdSignature: any = null
        if (usedTransaction) {
            try {
                createdSignature = await new TemplateSignature({
                    templateAssignmentId,
                    subAdminId: signerId,
                    signedAt: now,
                    status: 'signed',
                    type,
                    signatureUrl,
                    level,
                    signaturePeriodId,
                    schoolYearId
                }).save({ session })

                // Expose created signature to return value
                signature = createdSignature

                const updatedAssignment = await TemplateAssignment.findByIdAndUpdate(
                    templateAssignmentId,
                    {
                        $push: { 'data.signatures': pushObj },
                        $inc: { dataVersion: 1 },
                        $set: { status: 'signed' }
                    },
                    { new: true, session }
                )

                await TemplateChangeLog.create([
                    {
                        templateAssignmentId,
                        teacherId: signerId,
                        changeType: 'signature',
                        pageIndex: -1,
                        blockIndex: -1,
                        before: assignment.data && (assignment.data.signatures || []),
                        after: updatedAssignment ? updatedAssignment.data.signatures : undefined,
                        changeId: generateChangeId(),
                        dataVersion: updatedAssignment ? (updatedAssignment as any).dataVersion : -1,
                        userId: signerId,
                        timestamp: now,
                    }
                ], { session })

                await session.commitTransaction()

                // Ensure in-memory assignment data reflects DB
                try {
                    const fresh = updatedAssignment
                    if (fresh) (assignment as any).data = (fresh as any).data
                } catch (e) {
                    console.error('Error applying updated assignment data to in-memory object', e)
                }
            } catch (e: any) {
                const msg = String(e?.message || '')
                // Check for duplicate key error first (signature already exists)
                if (isDuplicateKeyError(e)) {
                    try { await session.abortTransaction() } catch (err) { }
                    await handleDuplicateKeyConflict(templateAssignmentId, type, signaturePeriodId, level)
                }
                if (msg.includes('Transaction numbers are only allowed')) {
                    try { await session.abortTransaction() } catch (err) { }

                    // Fallback: no transactions (replay non-transactional logic)
                    let created = null
                    try {
                        created = await new TemplateSignature({
                            templateAssignmentId,
                            subAdminId: signerId,
                            signedAt: now,
                            status: 'signed',
                            type,
                            signatureUrl,
                            level,
                            signaturePeriodId,
                            schoolYearId
                        }).save()

                        // Expose created signature
                        signature = created

                        const updatedAssignment = await TemplateAssignment.findByIdAndUpdate(
                            templateAssignmentId,
                            {
                                $push: { 'data.signatures': pushObj },
                                $inc: { dataVersion: 1 },
                                $set: { status: 'signed' }
                            },
                            { new: true }
                        )

                        try {
                            await TemplateChangeLog.create({
                                templateAssignmentId,
                                teacherId: signerId,
                                changeType: 'signature',
                                pageIndex: -1,
                                blockIndex: -1,
                                before: assignment.data && (assignment.data.signatures || []),
                                after: updatedAssignment ? updatedAssignment.data.signatures : undefined,
                                changeId: generateChangeId(),
                                dataVersion: updatedAssignment ? (updatedAssignment as any).dataVersion : -1,
                                userId: signerId,
                                timestamp: now,
                            })
                        } catch (e) {
                            console.error('Failed to log signature change:', e)
                        }

                        // Ensure in-memory assignment data reflects DB
                        try {
                            const fresh = await TemplateAssignment.findById(templateAssignmentId).lean()
                            if (fresh) (assignment as any).data = fresh.data
                        } catch (e) {
                            console.error('Error applying updated assignment data to in-memory object', e)
                        }
                    } catch (err: any) {
                        // Check for duplicate key error (signature already exists)
                        if (isDuplicateKeyError(err)) {
                            await handleDuplicateKeyConflict(templateAssignmentId, type, signaturePeriodId, level)
                        }
                        if (created) {
                            try { await TemplateSignature.deleteOne({ _id: (created as any)._id }) } catch (err2) { console.error('Failed to cleanup signature after error:', err2) }
                        }
                        throw err
                    }
                } else {
                    try { if (usedTransaction) await session.abortTransaction() } catch (err) { }
                    throw e
                }
            }
        } else {
            // Fallback: no transactions
            let created = null
            try {
                created = await new TemplateSignature({
                    templateAssignmentId,
                    subAdminId: signerId,
                    signedAt: now,
                    status: 'signed',
                    type,
                    signatureUrl,
                    level,
                    signaturePeriodId,
                    schoolYearId
                }).save()

                // Expose created signature to return value
                signature = created

                const updatedAssignment = await TemplateAssignment.findByIdAndUpdate(
                    templateAssignmentId,
                    {
                        $push: { 'data.signatures': pushObj },
                        $inc: { dataVersion: 1 },
                        $set: { status: 'signed' }
                    },
                    { new: true }
                )

                try {
                    await TemplateChangeLog.create({
                        templateAssignmentId,
                        teacherId: signerId,
                        changeType: 'signature',
                        pageIndex: -1,
                        blockIndex: -1,
                        before: assignment.data && (assignment.data.signatures || []),
                        after: updatedAssignment ? updatedAssignment.data.signatures : undefined,
                        changeId: generateChangeId(),
                        dataVersion: updatedAssignment ? (updatedAssignment as any).dataVersion : -1,
                        userId: signerId,
                        timestamp: now,
                    })
                } catch (e) {
                    console.error('Failed to log signature change:', e)
                }

                // Ensure in-memory assignment data reflects DB
                try {
                    const fresh = await TemplateAssignment.findById(templateAssignmentId).lean()
                    if (fresh) (assignment as any).data = fresh.data
                } catch (e) {
                    console.error('Error applying updated assignment data to in-memory object', e)
                }
            } catch (e: any) {
                // Check for duplicate key error (signature already exists)
                if (isDuplicateKeyError(e)) {
                    await handleDuplicateKeyConflict(templateAssignmentId, type, signaturePeriodId, level)
                }
                // If create or update failed, attempt to cleanup created signature if any
                if (created) {
                    try {
                        await TemplateSignature.deleteOne({ _id: (created as any)._id })
                    } catch (err) {
                        console.error('Failed to cleanup signature after error:', err)
                    }
                }
                throw e
            }
        }
    } catch (e) {
        try {
            if (usedTransaction) await session.abortTransaction()
        } catch (err) {
            // ignore
        }
        throw e
    } finally {
        session.endSession()
    }

    // Log audit
    const template = await GradebookTemplate.findById(assignment.templateId).lean()
    const student = await Student.findById(assignment.studentId).lean()

    await logAudit({
        userId: signerId,
        action: 'SIGN_TEMPLATE',
        details: {
            templateId: assignment.templateId,
            templateName: template?.name,
            studentId: assignment.studentId,
            studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            type
        },
        req,
    })

    return signature
}

export const unsignTemplateAssignment = async ({
    templateAssignmentId,
    signerId,
    type,
    req,
    level
}: {
    templateAssignmentId: string
    signerId: string
    type?: string
    req?: any
    level?: string
}) => {
    // Get assignment
    const assignment = await TemplateAssignment.findById(templateAssignmentId)
    if (!assignment) {
        throw new Error('not_found')
    }

    const baseQuery: any = { templateAssignmentId }
    if (type) baseQuery.type = type

    const deleteQuery: any = (() => {
        if (!level) return baseQuery
        return {
            ...baseQuery,
            $or: [
                { level },
                { level: { $exists: false } },
                { level: null },
                { level: '' },
            ]
        }
    })()

    // Remove signatures & update assignment in a transaction if possible
    const session = await mongoose.startSession()
    let usedTransaction = true
    try {
        try {
            session.startTransaction()
        } catch (e) {
            usedTransaction = false
        }

        if (usedTransaction) {
            try {
                await TemplateSignature.deleteMany(deleteQuery).session(session)

                if (type === 'end_of_year') {
                    if (assignment.data && assignment.data.promotions) {
                        const updatedPromotions = assignment.data.promotions.filter((p: any) => p.by !== signerId)
                        if (updatedPromotions.length !== assignment.data.promotions.length) {
                            assignment.data.promotions = updatedPromotions
                            assignment.markModified('data')
                            await assignment.save({ session })
                        }
                    }
                }

                const updatedAssignment = await TemplateAssignment.findByIdAndUpdate(
                    templateAssignmentId,
                    {
                        $pull: { 'data.signatures': deleteQuery },
                        $inc: { dataVersion: 1 }
                    },
                    { new: true, session }
                )

                const remaining = await TemplateSignature.countDocuments({ templateAssignmentId }).session(session)
                if (remaining === 0) {
                    await TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'completed', $inc: { dataVersion: 1 } }, { session })
                }

                try {
                    await TemplateChangeLog.create([{
                        templateAssignmentId,
                        teacherId: signerId,
                        changeType: 'unsign',
                        pageIndex: -1,
                        blockIndex: -1,
                        before: assignment.data && (assignment.data.signatures || []),
                        after: updatedAssignment ? updatedAssignment.data.signatures : undefined,
                        changeId: generateChangeId(),
                        dataVersion: updatedAssignment ? (updatedAssignment as any).dataVersion : -1,
                        userId: signerId,
                        timestamp: new Date(),
                    }], { session })
                } catch (e) {
                    console.error('Failed to log unsign change:', e)
                }

                await session.commitTransaction()
            } catch (e: any) {
                const msg = String(e?.message || '')
                if (msg.includes('Transaction numbers are only allowed')) {
                    try { await session.abortTransaction() } catch (err) { }
                    // Fall back to non-transactional flow: reuse the existing fallback below by setting usedTransaction = false
                    usedTransaction = false

                    // Execute fallback logic here
                    // Save current persisted signatures in case we need to restore on failure
                    const savedSignatures = assignment.data && assignment.data.signatures ? [...assignment.data.signatures] : []

                    try {
                        await TemplateSignature.deleteMany(deleteQuery)

                        if (type === 'end_of_year') {
                            if (assignment.data && assignment.data.promotions) {
                                const updatedPromotions = assignment.data.promotions.filter((p: any) => p.by !== signerId)
                                if (updatedPromotions.length !== assignment.data.promotions.length) {
                                    assignment.data.promotions = updatedPromotions
                                    assignment.markModified('data')
                                    await assignment.save()
                                }
                            }
                        }

                        const updatedAssignment = await TemplateAssignment.findByIdAndUpdate(
                            templateAssignmentId,
                            {
                                $pull: { 'data.signatures': deleteQuery },
                                $inc: { dataVersion: 1 }
                            },
                            { new: true }
                        )

                        const remaining = await TemplateSignature.countDocuments({ templateAssignmentId })
                        if (remaining === 0) {
                            await TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'completed', $inc: { dataVersion: 1 } })
                        }

                        try {
                            await TemplateChangeLog.create({
                                templateAssignmentId,
                                teacherId: signerId,
                                changeType: 'unsign',
                                pageIndex: -1,
                                blockIndex: -1,
                                before: assignment.data && (assignment.data.signatures || []),
                                after: updatedAssignment ? updatedAssignment.data.signatures : undefined,
                                changeId: generateChangeId(),
                                dataVersion: updatedAssignment ? (updatedAssignment as any).dataVersion : -1,
                                userId: signerId,
                                timestamp: new Date(),
                            })
                        } catch (e) {
                            console.error('Failed to log unsign change:', e)
                        }
                    } catch (err) {
                        // Attempt to restore any removed signatures if update failed
                        if (savedSignatures.length > 0) {
                            try {
                                // Recreate signature documents from the saved metadata
                                const toInsert = savedSignatures.map((s: any) => ({ templateAssignmentId, ...s }))
                                await TemplateSignature.insertMany(toInsert)
                                // Restore assignment data.signatures
                                try {
                                    await TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { $set: { 'data.signatures': savedSignatures } })
                                } catch (err) {
                                    console.error('Failed to restore signatures into assignment data after failure:', err)
                                }
                            } catch (err) {
                                console.error('Failed to restore signatures after failed unsign:', err)
                            }
                        }
                        throw err
                    }
                } else {
                    try { if (usedTransaction) await session.abortTransaction() } catch (err) { }
                    throw e
                }
            }
        } else {
            // Fallback: no transactions
            // Save current persisted signatures in case we need to restore on failure
            const savedSignatures = assignment.data && assignment.data.signatures ? [...assignment.data.signatures] : []

            try {
                await TemplateSignature.deleteMany(deleteQuery)

                if (type === 'end_of_year') {
                    if (assignment.data && assignment.data.promotions) {
                        const updatedPromotions = assignment.data.promotions.filter((p: any) => p.by !== signerId)
                        if (updatedPromotions.length !== assignment.data.promotions.length) {
                            assignment.data.promotions = updatedPromotions
                            assignment.markModified('data')
                            await assignment.save()
                        }
                    }
                }

                const updatedAssignment = await TemplateAssignment.findByIdAndUpdate(
                    templateAssignmentId,
                    {
                        $pull: { 'data.signatures': deleteQuery },
                        $inc: { dataVersion: 1 }
                    },
                    { new: true }
                )

                const remaining = await TemplateSignature.countDocuments({ templateAssignmentId })
                if (remaining === 0) {
                    await TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'completed', $inc: { dataVersion: 1 } })
                }

                try {
                    await TemplateChangeLog.create({
                        templateAssignmentId,
                        teacherId: signerId,
                        changeType: 'unsign',
                        pageIndex: -1,
                        blockIndex: -1,
                        before: assignment.data && (assignment.data.signatures || []),
                        after: updatedAssignment ? updatedAssignment.data.signatures : undefined,
                        changeId: generateChangeId(),
                        dataVersion: updatedAssignment ? (updatedAssignment as any).dataVersion : -1,
                        userId: signerId,
                        timestamp: new Date(),
                    })
                } catch (e) {
                    console.error('Failed to log unsign change:', e)
                }
            } catch (e) {
                // Attempt to restore any removed signatures if update failed
                if (savedSignatures.length > 0) {
                    try {
                        // Recreate signature documents from the saved metadata
                        const toInsert = savedSignatures.map((s: any) => ({ templateAssignmentId, ...s }))
                        await TemplateSignature.insertMany(toInsert)
                        // Restore assignment data.signatures
                        try {
                            await TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { $set: { 'data.signatures': savedSignatures } })
                        } catch (err) {
                            console.error('Failed to restore signatures into assignment data after failure:', err)
                        }
                    } catch (err) {
                        console.error('Failed to restore signatures after failed unsign:', err)
                    }
                }
                throw e
            }
        }
    } catch (e) {
        try { if (usedTransaction) await session.abortTransaction() } catch (err) { }
        throw e
    } finally {
        session.endSession()
    }

    // Log audit
    const template = await GradebookTemplate.findById(assignment.templateId).lean()
    const student = await Student.findById(assignment.studentId).lean()

    await logAudit({
        userId: signerId,
        action: 'UNSIGN_TEMPLATE',
        details: {
            templateId: assignment.templateId,
            templateName: template?.name,
            studentId: assignment.studentId,
            studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            type
        },
        req,
    })

    return { success: true }
}
