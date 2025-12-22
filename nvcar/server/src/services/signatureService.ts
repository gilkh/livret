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
import { Level } from '../models/Level'
import mongoose, { ClientSession } from 'mongoose'

// Auth imports
import { SubAdminAssignment } from '../models/SubAdminAssignment'
import { Enrollment } from '../models/Enrollment'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { ClassModel } from '../models/Class'
import { RoleScope } from '../models/RoleScope'

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
    // Allow the caller to supply an explicit signature period to avoid ambiguous date heuristics
    signaturePeriodId?: string
    // Optional explicit school year id that corresponds to the signaturePeriodId
    signatureSchoolYearId?: string
}

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

/**
 * Populate signatures into assignment.data.signatures from TemplateSignature collection.
 * This is the read-side fix for the Data Consistency Crisis.
 */
export async function populateSignatures(assignments: any[] | any) {
    if (!assignments) return assignments
    const isArray = Array.isArray(assignments)
    const list = isArray ? assignments : [assignments]
    if (list.length === 0) return assignments

    const ids = list.map((a: any) => String(a._id))
    const signatures = await TemplateSignature.find({ templateAssignmentId: { $in: ids } }).lean()
    
    const sigMap = new Map<string, any[]>()
    signatures.forEach(s => {
        const key = String(s.templateAssignmentId)
        if (!sigMap.has(key)) sigMap.set(key, [])
        sigMap.get(key)?.push(s)
    })

    list.forEach((a: any) => {
        if (!a.data) a.data = {}
        // Overwrite or set data.signatures from the single source of truth
        a.data.signatures = sigMap.get(String(a._id)) || []
    })

    return assignments
}

/**
 * Centralized authorization logic for SubAdmins.
 * Fixes Authorization Logic Vulnerabilities.
 */
export async function validateSignatureAuthorization(
    subAdminId: string,
    assignment: any
): Promise<boolean> {
    // 1. Direct assignment check
    if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
        const direct = await SubAdminAssignment.exists({
            subAdminId,
            teacherId: { $in: assignment.assignedTeachers }
        })
        if (direct) return true
    }

    // 2. Enrollment/Class based check
    const enrollments = await Enrollment.find({ studentId: assignment.studentId }).lean()
    const classIds = enrollments.map(e => e.classId).filter(Boolean)
    
    if (classIds.length > 0) {
        // Check if subadmin manages any teacher of these classes
        const teacherClassAssignments = await TeacherClassAssignment.find({ classId: { $in: classIds } }).select('teacherId').lean()
        const teacherIds = teacherClassAssignments.map(t => t.teacherId)
        
        if (teacherIds.length > 0) {
             const classMatch = await SubAdminAssignment.exists({
                subAdminId,
                teacherId: { $in: teacherIds }
            })
            if (classMatch) return true
        }

        // Check RoleScope (Level based)
        const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
        if (roleScope?.levels?.length) {
            const classes = await ClassModel.find({ _id: { $in: classIds } }).select('level').lean()
            if (classes.some(c => c.level && roleScope.levels.includes(c.level))) {
                return true
            }
        }
    }

    // 3. Promotion check (Fallback)
    // If user promoted the student recently, they might have access
    const student = await Student.findById(assignment.studentId).select('promotions').lean()
    if (student && Array.isArray((student as any).promotions) && (student as any).promotions.length > 0) {
         const lastPromotion = (student as any).promotions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
         if (lastPromotion && String(lastPromotion.promotedBy) === String(subAdminId)) {
             return true
         }
    }

    return false
}

export const signTemplateAssignment = async ({
    templateAssignmentId,
    signerId,
    type = 'standard',
    signatureUrl,
    req,
    level,
    signaturePeriodId: explicitSignaturePeriodId,
    signatureSchoolYearId: explicitSchoolYearId
}: SignTemplateOptions) => {
    // Get the template assignment
    const assignment = await TemplateAssignment.findById(templateAssignmentId)
    if (!assignment) {
        throw new Error('not_found')
    }

    // Prefer an explicit signaturePeriodId if provided; otherwise resolve from current school year and type
    const activeYear = await SchoolYear.findOne({ active: true }).lean()

    if (!explicitSignaturePeriodId) {
        const resolved = await resolveSignatureSchoolYearWithPeriod(activeYear, type, new Date())
        explicitSignaturePeriodId = resolved.signaturePeriodId
        if (!explicitSchoolYearId) explicitSchoolYearId = resolved.schoolYearId
    }

    // Final guard
    if (!explicitSignaturePeriodId) throw new Error('cannot_resolve_signature_period')

    const existingQuery: any = (() => {
        const base = { templateAssignmentId, type, signaturePeriodId: explicitSignaturePeriodId }
        if (!level) return base
        return {
            ...base,
            $or: [
                { level },
                { level: { $exists: false } },
                { level: null },
                { level: '' },
            ]
        }
    })()

    const existing = await TemplateSignature.findOne(existingQuery).lean()
    if (existing) throw new Error('already_signed')

    // Check completion status for the requested semester
    // Unifies completion status logic (Task 4)
    const isCompletedSem1 = (assignment as any).isCompletedSem1 || assignment.isCompleted || false
    const isCompletedSem2 = (assignment as any).isCompletedSem2 || false

    if (type === 'standard') {
        if (!isCompletedSem1) {
            throw new Error('not_completed_sem1')
        }
    } else if (type === 'end_of_year') {
        if (!isCompletedSem2) {
            throw new Error('not_completed_sem2')
        }
    }

    // Create signature and persist metadata atomically using a transaction when possible
    const now = new Date()
    let signaturePeriodId = explicitSignaturePeriodId
    let schoolYearId = explicitSchoolYearId
    
    // Ensure we have a valid period id
    if (!signaturePeriodId) {
        throw new Error('cannot_resolve_signature_period')
    }

    let signature: any = null
    const session = await mongoose.startSession()
    let usedTransaction = true
    try {
        session.startTransaction()
    } catch (e) {
        // Transactions not supported in this environment
        usedTransaction = false
    }

    try {
        // Standardized transaction handling (Task 3)
        // Fixes Data Consistency (Task 1) by NOT pushing to assignment.data.signatures
        if (usedTransaction) {
            try {
                // Double check existence inside transaction
                const doubleCheck = await TemplateSignature.findOne(existingQuery).session(session)
                if (doubleCheck) throw new Error('already_signed')

                const createdSignature = await new TemplateSignature({
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

                signature = createdSignature

                const updatedAssignment = await TemplateAssignment.findByIdAndUpdate(
                    templateAssignmentId,
                    {
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
                        after: undefined, // We don't store signatures in data anymore
                        changeId: generateChangeId(),
                        dataVersion: updatedAssignment ? (updatedAssignment as any).dataVersion : -1,
                        userId: signerId,
                        timestamp: now,
                    }
                ], { session })

                await session.commitTransaction()
            } catch (e: any) {
                const msg = String(e?.message || '')
                if (msg.includes('Transaction numbers are only allowed')) {
                     try { await session.abortTransaction() } catch (err) { }
                     usedTransaction = false
                } else {
                    if (isDuplicateKeyError(e) || msg.includes('already_signed')) {
                        try { await session.abortTransaction() } catch (err) { }
                        await handleDuplicateKeyConflict(templateAssignmentId, type, signaturePeriodId, level)
                    }
                    
                    // If transaction failed but it wasn't a duplicate key, abort and rethrow
                    try { await session.abortTransaction() } catch (err) { }
                    throw e
                }
            }
        }
        
        if (!usedTransaction) {
            // Fallback: no transactions (for tests/local)
            // Still respecting single source of truth
            try {
                const createdSignature = await new TemplateSignature({
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

                signature = createdSignature

                const updatedAssignment = await TemplateAssignment.findByIdAndUpdate(
                    templateAssignmentId,
                    {
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
                        after: undefined,
                        changeId: generateChangeId(),
                        dataVersion: updatedAssignment ? (updatedAssignment as any).dataVersion : -1,
                        userId: signerId,
                        timestamp: now,
                    })
                } catch (e) {
                    console.error('Failed to log signature change:', e)
                }
            } catch (e: any) {
                if (isDuplicateKeyError(e)) {
                    await handleDuplicateKeyConflict(templateAssignmentId, type, signaturePeriodId, level)
                }
                // Cleanup if created but subsequent steps failed (unlikely here since we only create one doc now)
                if (signature) {
                     try { await TemplateSignature.deleteOne({ _id: signature._id }) } catch (err) {}
                }
                throw e
            }
        }
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
                        // No need to pull from data.signatures as we don't store it there anymore
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
                        after: undefined,
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
                if (e.message && e.message.includes('Transaction numbers are only allowed')) {
                    try { await session.abortTransaction() } catch (err) { }
                    usedTransaction = false
                } else {
                    try { await session.abortTransaction() } catch (err) { }
                    throw e
                }
            }
        }
        
        if (!usedTransaction) {
            // Fallback: no transactions
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
                        after: undefined,
                        changeId: generateChangeId(),
                        dataVersion: updatedAssignment ? (updatedAssignment as any).dataVersion : -1,
                        userId: signerId,
                        timestamp: new Date(),
                    })
                } catch (e) {
                    console.error('Failed to log unsign change:', e)
                }
            } catch (e) {
                throw e
            }
        }
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
