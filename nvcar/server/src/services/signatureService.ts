import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateSignature } from '../models/TemplateSignature'
import { Student } from '../models/Student'
import { SchoolYear } from '../models/SchoolYear'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { logAudit } from '../utils/auditLogger'
import { User } from '../models/User'

interface SignTemplateOptions {
    templateAssignmentId: string
    signerId: string
    type?: 'standard' | 'end_of_year'
    signatureUrl?: string
    req?: any
    level?: string
}

import { Level } from '../models/Level'

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
    const query: any = { templateAssignmentId, type }
    
    // Scope uniqueness check by level if provided
    if (level) {
        query.level = level
    }
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

        query.signedAt = { $gt: effectiveThreshold, $lte: upperBound }
    }

    const existing = await TemplateSignature.findOne(query).lean()
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

    // Create signature
    // Note: We allow passing signatureUrl (used by Admin)
    // If not passed, it relies on signerId link (used by SubAdmin)
    const signature = await TemplateSignature.create({
        templateAssignmentId,
        subAdminId: signerId,
        signedAt: new Date(),
        status: 'signed',
        type,
        signatureUrl,
        level
    })

    // Persist signature metadata in assignment data
    {
        const now = new Date()
        let yearName = ''
        if (activeYear?.name) {
            yearName = String(activeYear.name)
        } else {
            const currentYear = now.getFullYear()
            const month = now.getMonth()
            const startYear = month >= 8 ? currentYear : currentYear - 1
            yearName = `${startYear}/${startYear + 1}`
        }
        await TemplateAssignment.findByIdAndUpdate(templateAssignmentId, {
            $push: {
                'data.signatures': {
                    type,
                    signedAt: now,
                    subAdminId: signerId,
                    schoolYearId: activeYear ? String(activeYear._id) : undefined,
                    schoolYearName: yearName,
                    level
                }
            }
        })
    }

    // Update assignment status
    // If any signature is added, we consider it signed.
    if (assignment.status !== 'signed') {
        assignment.status = 'signed'
        await assignment.save()
    }

    // If this is a final signature, promote the student if not already promoted
    if (type === 'end_of_year') {
        const student = await Student.findById(assignment.studentId)
        if (student && student.level) {
            const nextLevel = await getNextLevel(student.level)
            const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
            
            if (nextLevel && activeSchoolYear) {
                // Check if already promoted this year
                const alreadyPromoted = student.promotions?.some((p: any) => p.schoolYearId === String(activeSchoolYear._id))
                
                if (!alreadyPromoted) {
                    // Create promotion data
                    const promotionData = {
                        fromLevel: student.level,
                        toLevel: nextLevel,
                        date: new Date(),
                        schoolYearId: String(activeSchoolYear._id),
                        promotedBy: signerId
                    }
                    
                    // Update student
                    await Student.findByIdAndUpdate(student._id, {
                        $push: { promotions: promotionData }
                    })
                    
                    // Also save promotion info in the assignment data so it persists
                    // We need to fetch assignment again or update the doc we have
                    // But we already have assignment doc loaded
                    const yearName = activeSchoolYear.name || new Date().getFullYear().toString()
                    
                    await TemplateAssignment.findByIdAndUpdate(templateAssignmentId, {
                        $push: { 
                            'data.promotions': {
                                from: student.level,
                                to: nextLevel,
                                year: yearName,
                                date: new Date(),
                                by: signerId
                            }
                        }
                    })
                }
            }
        }
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

    const query: any = { templateAssignmentId }
    if (type) query.type = type
    if (level) query.level = level

    await TemplateSignature.deleteMany(query)

    // If removing end_of_year signature, remove promotion data
    if (type === 'end_of_year') {
         if (assignment.data && assignment.data.promotions) {
             const updatedPromotions = assignment.data.promotions.filter((p: any) => p.by !== signerId)
             
             // Only update if changed
             if (updatedPromotions.length !== assignment.data.promotions.length) {
                 assignment.data.promotions = updatedPromotions
                 assignment.markModified('data')
                 await assignment.save()
             }
         }
    }

    // Remove persisted signature metadata from assignment data
    if (assignment.data && Array.isArray((assignment as any).data.signatures)) {
        const before = (assignment as any).data.signatures
        const after = before.filter((s: any) => {
            let match = String(s.subAdminId) === String(signerId)
            if (match && type) {
                match = String(s.type) === String(type)
            }
            if (match && level) {
                match = s.level === level
            }
            return !match
        })
        if (after.length !== before.length) {
            ;(assignment as any).data.signatures = after
            assignment.markModified('data')
            await assignment.save()
        }
    }

    // Check if any signatures remain
    const remaining = await TemplateSignature.countDocuments({ templateAssignmentId })
    if (remaining === 0) {
        // Revert status to completed
        // Or should we check if it was completed? 
        // Usually it was completed before signing.
        await TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'completed' })
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
