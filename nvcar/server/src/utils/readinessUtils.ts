/**
 * Centralized Readiness/Completion Logic
 * 
 * This utility provides a single source of truth for computing readiness and completion
 * status for template assignments. It is used by:
 * - Signing endpoints (to verify readiness before signing)
 * - Promotion endpoints (to verify eligibility)
 * - UI state (to display completion status)
 */

import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateSignature } from '../models/TemplateSignature'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { Enrollment } from '../models/Enrollment'
import { ClassModel } from '../models/Class'
import { SchoolYear } from '../models/SchoolYear'
import { withCache } from './cache'

// Signature period types
export type SignaturePeriodType = 'sem1' | 'sem2' | 'end_of_year'

/**
 * Compute a deterministic signaturePeriodId based on schoolYearId and period type.
 * Format: {schoolYearId}_{periodType}
 */
export function computeSignaturePeriodId(schoolYearId: string, periodType: SignaturePeriodType): string {
    if (!schoolYearId) {
        throw new Error('schoolYearId is required to compute signaturePeriodId')
    }
    return `${schoolYearId}_${periodType}`
}

/**
 * Parse a signaturePeriodId back into its components
 */
export function parseSignaturePeriodId(signaturePeriodId: string): { schoolYearId: string; periodType: SignaturePeriodType } | null {
    if (!signaturePeriodId) return null

    // Check for known period type suffixes (order matters - check longer ones first)
    const periodTypes: SignaturePeriodType[] = ['end_of_year', 'sem1', 'sem2']

    for (const periodType of periodTypes) {
        const suffix = `_${periodType}`
        if (signaturePeriodId.endsWith(suffix)) {
            const schoolYearId = signaturePeriodId.slice(0, -suffix.length)
            if (schoolYearId) {
                return { schoolYearId, periodType }
            }
        }
    }

    return null
}

/**
 * Resolve the current signature period based on the active school year and semester
 */
export async function resolveCurrentSignaturePeriod(): Promise<{
    schoolYearId: string
    schoolYearName: string
    periodType: SignaturePeriodType
    signaturePeriodId: string
}> {
    const activeYear = await withCache('school-years-active', () =>
        SchoolYear.findOne({ active: true }).lean()
    )

    if (!activeYear) {
        throw new Error('no_active_school_year')
    }

    const activeSemester = (activeYear as any).activeSemester || 1
    const periodType: SignaturePeriodType = activeSemester === 1 ? 'sem1' : 'sem2'
    const schoolYearId = String(activeYear._id)
    const signaturePeriodId = computeSignaturePeriodId(schoolYearId, periodType)

    return {
        schoolYearId,
        schoolYearName: String(activeYear.name || ''),
        periodType,
        signaturePeriodId
    }
}

/**
 * Resolve the signature period for end-of-year signatures (promotion)
 */
export async function resolveEndOfYearSignaturePeriod(): Promise<{
    schoolYearId: string
    schoolYearName: string
    signaturePeriodId: string
    nextSchoolYearId: string | null
}> {
    const activeYear = await withCache('school-years-active', () =>
        SchoolYear.findOne({ active: true }).lean()
    )

    if (!activeYear) {
        throw new Error('no_active_school_year')
    }

    const schoolYearId = String(activeYear._id)
    const signaturePeriodId = computeSignaturePeriodId(schoolYearId, 'end_of_year')

    // Find next school year
    let nextSchoolYear: any = null

    if ((activeYear as any).sequence && Number((activeYear as any).sequence) > 0) {
        nextSchoolYear = await SchoolYear.findOne({ sequence: Number((activeYear as any).sequence) + 1 }).lean()
    }

    if (!nextSchoolYear) {
        const allYears = await SchoolYear.find({}).sort({ startDate: 1 }).lean()
        const idx = allYears.findIndex(y => String(y._id) === schoolYearId)
        if (idx >= 0 && idx < allYears.length - 1) {
            nextSchoolYear = allYears[idx + 1]
        }
    }

    if (!nextSchoolYear && activeYear.name) {
        const match = String(activeYear.name).match(/(\d{4})([-/.])(\d{4})/)
        if (match) {
            const startYear = parseInt(match[1], 10)
            const sep = match[2]
            const endYear = parseInt(match[3], 10)
            const nextName = `${startYear + 1}${sep}${endYear + 1}`
            nextSchoolYear = await SchoolYear.findOne({ name: nextName }).lean()
        }
    }

    return {
        schoolYearId,
        schoolYearName: String(activeYear.name || ''),
        signaturePeriodId,
        nextSchoolYearId: nextSchoolYear ? String(nextSchoolYear._id) : null
    }
}

export interface CompletionStatus {
    isReady: boolean
    isCompletedSem1: boolean
    isCompletedSem2: boolean
    isFullyCompleted: boolean
    isSigned: boolean
    isSignedSem1: boolean
    isSignedSem2: boolean
    isSignedEndOfYear: boolean
    canSignSem1: boolean
    canSignSem2: boolean
    canSignEndOfYear: boolean
    canPromote: boolean
    missingCategories: string[]
    incompleteTeachers: string[]
    reason?: string
}

export interface CompletionCheckOptions {
    templateAssignmentId: string
    checkSignatures?: boolean
    level?: string
}

/**
 * Compute the full completion/readiness status for a template assignment.
 * This is the single source of truth used by sign, promote, and UI state.
 */
export async function computeCompletionStatus(options: CompletionCheckOptions): Promise<CompletionStatus> {
    const { templateAssignmentId, checkSignatures = true, level: providedLevel } = options

    const assignment = await TemplateAssignment.findById(templateAssignmentId).lean()
    if (!assignment) {
        throw new Error('assignment_not_found')
    }

    const result: CompletionStatus = {
        isReady: false,
        isCompletedSem1: false,
        isCompletedSem2: false,
        isFullyCompleted: false,
        isSigned: false,
        isSignedSem1: false,
        isSignedSem2: false,
        isSignedEndOfYear: false,
        canSignSem1: false,
        canSignSem2: false,
        canSignEndOfYear: false,
        canPromote: false,
        missingCategories: [],
        incompleteTeachers: []
    }

    // Get completion status from assignment
    result.isCompletedSem1 = !!(assignment as any).isCompletedSem1
    result.isCompletedSem2 = !!(assignment as any).isCompletedSem2
    result.isFullyCompleted = assignment.isCompleted === true

    // If isCompleted but not sem flags, treat as both complete (backwards compatibility)
    if (result.isFullyCompleted && !result.isCompletedSem1 && !result.isCompletedSem2) {
        result.isCompletedSem1 = true
        result.isCompletedSem2 = true
    }

    // Check signatures if requested
    if (checkSignatures) {
        const signaturePeriodInfo = await resolveCurrentSignaturePeriod().catch(() => null)
        const activeSchoolYearId = signaturePeriodInfo?.schoolYearId

        const sem1PeriodId = activeSchoolYearId ? computeSignaturePeriodId(activeSchoolYearId, 'sem1') : null
        const sem2PeriodId = activeSchoolYearId ? computeSignaturePeriodId(activeSchoolYearId, 'sem2') : null
        const endOfYearPeriodId = activeSchoolYearId ? computeSignaturePeriodId(activeSchoolYearId, 'end_of_year') : null

        // Get all signatures for this assignment
        const signatures = await TemplateSignature.find({ templateAssignmentId }).lean()

        // Determine level for filtering
        let level = providedLevel
        if (!level) {
            const enrollment = await Enrollment.findOne({ studentId: assignment.studentId, status: { $in: ['active', 'promoted'] } }).lean()
            if (enrollment?.classId) {
                const cls = await ClassModel.findById(enrollment.classId).lean()
                if (cls && cls.level) level = cls.level
            }
        }


        for (const sig of signatures) {
            // Skip if level doesn't match (when level-specific)
            if (level && (sig as any).level && (sig as any).level !== level) continue

            const sigType = (sig as any).type || 'standard'
            const sigPeriodId = (sig as any).signaturePeriodId

            const isLegacy = !sigPeriodId

            if (sigType === 'standard') {
                if (isLegacy || (sem1PeriodId && sigPeriodId === sem1PeriodId) || (sem2PeriodId && sigPeriodId === sem2PeriodId)) {
                    result.isSignedSem1 = true
                }
            } else if (sigType === 'end_of_year') {
                if (isLegacy || (endOfYearPeriodId && sigPeriodId === endOfYearPeriodId)) {
                    result.isSignedEndOfYear = true
                }
            }
        }

        result.isSigned = result.isSignedSem1 || result.isSignedEndOfYear
        result.isSignedSem2 = result.isSignedEndOfYear // For clarity
    }

    // Determine what can be signed
    result.canSignSem1 = result.isCompletedSem1 && !result.isSignedSem1
    result.canSignSem2 = result.isCompletedSem2 && !result.isSignedSem2
    result.canSignEndOfYear = result.isCompletedSem2 && !result.isSignedEndOfYear

    // Can promote if signed end of year
    result.canPromote = result.isSignedEndOfYear

    result.isReady = result.isCompletedSem1 || result.isCompletedSem2

    return result
}

/**
 * Validate that a signature can be created for the given assignment and period.
 * Throws an error if validation fails.
 */
export async function validateSignatureReadiness(
    templateAssignmentId: string,
    signatureType: 'standard' | 'end_of_year',
    level?: string
): Promise<{ signaturePeriodId: string; schoolYearId: string }> {
    const status = await computeCompletionStatus({
        templateAssignmentId,
        checkSignatures: true,
        level
    })

    if (signatureType === 'standard') {
        if (!status.isCompletedSem1) {
            throw new Error('not_completed_sem1')
        }
        if (status.isSignedSem1) {
            throw new Error('already_signed')
        }
    } else if (signatureType === 'end_of_year') {
        if (!status.isCompletedSem2) {
            throw new Error('not_completed_sem2')
        }
        if (status.isSignedEndOfYear) {
            throw new Error('already_signed')
        }
    }

    // Get signature period
    const periodInfo = signatureType === 'end_of_year'
        ? await resolveEndOfYearSignaturePeriod()
        : await resolveCurrentSignaturePeriod()

    return {
        signaturePeriodId: periodInfo.signaturePeriodId,
        schoolYearId: periodInfo.schoolYearId
    }
}

/**
 * Validate that a promotion can be performed for the given assignment.
 * Throws an error if validation fails.
 */
export async function validatePromotionReadiness(
    templateAssignmentId: string,
    subAdminId: string
): Promise<{
    signaturePeriodId: string
    schoolYearId: string
    nextSchoolYearId: string
}> {
    const periodInfo = await resolveEndOfYearSignaturePeriod()

    // Check for end-of-year signature by this sub-admin for the CURRENT end-of-year period
    const signature = await TemplateSignature.findOne({
        templateAssignmentId,
        subAdminId,
        type: 'end_of_year',
        signaturePeriodId: periodInfo.signaturePeriodId,
    }).lean()

    if (!signature) {
        throw new Error('not_signed_by_you')
    }

    if (!periodInfo.nextSchoolYearId) {
        throw new Error('no_next_school_year')
    }

    return {
        signaturePeriodId: periodInfo.signaturePeriodId,
        schoolYearId: periodInfo.schoolYearId,
        nextSchoolYearId: periodInfo.nextSchoolYearId
    }
}

/**
 * Fields that are safe to copy forward when creating a new assignment from a previous one.
 * This replaces the blacklist-based sanitization with an explicit allowlist.
 */
export const SAFE_DATA_FIELDS_ALLOWLIST: string[] = [
    // Language toggle data
    'language_toggle_',

    // Table row language data
    'table_',

    // Dropdown values
    'dropdown_',

    // Text field values
    'text_',

    // Custom variable values (not starting with system prefixes)
    // These are caught by checking they don't match system fields
]

/**
 * System fields that should NEVER be copied forward
 */
export const SYSTEM_FIELDS_BLOCKLIST: string[] = [
    'signatures',
    'promotions',
    'active',
    'completed',
    'completedAt',
    'completedBy',
    'completedSem1',
    'completedAtSem1',
    'completedSem2',
    'completedAtSem2',
    'signedAt',
    'signedBy',
    'isCompleted',
    'isCompletedSem1',
    'isCompletedSem2',
    'status'
]

/**
 * Sanitize assignment data for copying to a new year/assignment.
 * Uses an explicit allowlist approach instead of blacklist.
 * 
 * @param data - The source data to sanitize
 * @param sourceAssignmentId - ID of the source assignment (for metadata)
 * @returns Sanitized data with copiedFrom metadata
 */
export function sanitizeDataForNewAssignment(
    data: Record<string, any>,
    sourceAssignmentId: string
): Record<string, any> {
    if (!data || typeof data !== 'object') {
        return { _copiedFrom: { assignmentId: sourceAssignmentId, copiedAt: new Date() } }
    }

    const sanitized: Record<string, any> = {
        _copiedFrom: {
            assignmentId: sourceAssignmentId,
            copiedAt: new Date()
        }
    }

    for (const [key, value] of Object.entries(data)) {
        // Skip system fields
        if (SYSTEM_FIELDS_BLOCKLIST.includes(key)) continue

        // Skip internal metadata fields
        if (key.startsWith('_')) continue

        // Check if key matches any allowlist prefix
        const isAllowed = SAFE_DATA_FIELDS_ALLOWLIST.some(prefix => key.startsWith(prefix))

        if (isAllowed) {
            // Deep copy the value
            sanitized[key] = JSON.parse(JSON.stringify(value))
        }
    }

    return sanitized
}

/**
 * Build the meta object for a SavedGradebook snapshot
 */
export function buildSavedGradebookMeta(params: {
    templateVersion: number
    dataVersion: number
    signaturePeriodId: string
    schoolYearId: string
    level: string
    snapshotReason: 'promotion' | 'year_end' | 'manual' | 'sem1' | 'transfer' | 'exit'
}): {
    templateVersion: number
    dataVersion: number
    signaturePeriodId: string
    schoolYearId: string
    level: string
    snapshotReason: string
    archivedAt: Date
} {
    return {
        templateVersion: params.templateVersion,
        dataVersion: params.dataVersion,
        signaturePeriodId: params.signaturePeriodId,
        schoolYearId: params.schoolYearId,
        level: params.level,
        snapshotReason: params.snapshotReason,
        archivedAt: new Date()
    }
}
