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
}

const getNextLevel = (current: string) => {
    if (!current) return null
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
    req
}: SignTemplateOptions) => {
    // Get the template assignment
    const assignment = await TemplateAssignment.findById(templateAssignmentId)
    if (!assignment) {
        throw new Error('not_found')
    }

    // Check if already signed
    const existing = await TemplateSignature.findOne({ templateAssignmentId, type }).lean()
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
        signatureUrl
    })

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
            const nextLevel = getNextLevel(student.level)
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
    req
}: {
    templateAssignmentId: string
    signerId: string
    type?: string
    req?: any
}) => {
    // Get assignment
    const assignment = await TemplateAssignment.findById(templateAssignmentId)
    if (!assignment) {
        throw new Error('not_found')
    }

    const query: any = { templateAssignmentId }
    if (type) query.type = type

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
