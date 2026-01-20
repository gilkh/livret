import { TemplateAssignment } from '../models/TemplateAssignment'
import { SavedGradebook } from '../models/SavedGradebook'
import { buildSavedGradebookMeta, computeSignaturePeriodId } from '../utils/readinessUtils'

/**
 * Archives the current year's teacher completions, completion flags, and assigned teachers before rollover.
 * This ensures historical progress is NEVER lost.
 * 
 * @param assignment - The current assignment document
 * @param fromYearId - The school year ID being archived (current year)
 * @returns Update operations to archive the data
 */
export function archiveYearCompletions(assignment: any, fromYearId: string) {
    if (!fromYearId) return {}

    const updates: any = {}

    // Archive teacher completions for this year
    const currentTeacherCompletions = assignment?.teacherCompletions || []
    if (currentTeacherCompletions.length > 0) {
        updates[`teacherCompletionsByYear.${fromYearId}`] = JSON.parse(JSON.stringify(currentTeacherCompletions))
    }

    // Archive completion flags for this year
    const completionHistory: any = {
        isCompleted: assignment?.isCompleted || false,
        completedAt: assignment?.completedAt || null,
        completedBy: assignment?.completedBy || null,
        isCompletedSem1: assignment?.isCompletedSem1 || false,
        completedAtSem1: assignment?.completedAtSem1 || null,
        isCompletedSem2: assignment?.isCompletedSem2 || false,
        completedAtSem2: assignment?.completedAtSem2 || null,
        status: assignment?.status || 'draft',
        archivedAt: new Date()
    }
    updates[`completionHistoryByYear.${fromYearId}`] = completionHistory

    // Archive assigned teachers for this year
    const currentAssignedTeachers = assignment?.assignedTeachers || []
    if (currentAssignedTeachers.length > 0) {
        updates[`assignedTeachersByYear.${fromYearId}`] = JSON.parse(JSON.stringify(currentAssignedTeachers))
    }

    return updates
}

/**
 * Returns the update object for rolling over an assignment to a new school year.
 * This resets all workflow/progress fields but preserves the actual carnet data.
 * 
 * IMPORTANT: Before calling this, you should call archiveYearCompletions to preserve
 * the current year's progress in teacherCompletionsByYear and completionHistoryByYear.
 */
export function getRolloverUpdate(targetYearId: string, assignedBy: string) {
    const now = new Date()
    return {
        completionSchoolYearId: String(targetYearId),
        status: 'draft',
        assignedBy,
        assignedAt: now,
        isCompleted: false,
        completedAt: null,
        completedBy: null,
        isCompletedSem1: false,
        completedAtSem1: null,
        isCompletedSem2: false,
        completedAtSem2: null,
        teacherCompletions: [],
    }
}

/**
 * Performs a complete rollover with archival of the current year's completions.
 * This is the preferred method for transitioning to a new school year.
 * 
 * @param assignment - The current assignment document
 * @param fromYearId - The school year being archived (can be null if unknown)
 * @param targetYearId - The new school year ID
 * @param assignedBy - The user performing the rollover
 * @returns Combined update object with archival and reset operations
 */
export function getCompleteRolloverUpdate(
    assignment: any,
    fromYearId: string | null,
    targetYearId: string,
    assignedBy: string
) {
    const archiveUpdates = fromYearId ? archiveYearCompletions(assignment, fromYearId) : {}
    const rolloverUpdates = getRolloverUpdate(targetYearId, assignedBy)

    return {
        ...rolloverUpdates,
        ...archiveUpdates
    }
}

/**
 * Snapshot reasons supported by the system
 */
export type SnapshotReason = 'promotion' | 'year_end' | 'sem1' | 'transfer' | 'manual' | 'exit' | 'class_complete'

/**
 * Creates a snapshot of the current state of a TemplateAssignment.
 * This is crucial for audit trails before mutating the assignment (e.g. rollover)
 * or at critical milestones (e.g. end of semester).
 */
export async function createAssignmentSnapshot(
    assignment: any,
    reason: SnapshotReason,
    options: {
        schoolYearId: string
        level: string
        classId?: string
        // Optional override for the data to be stored. 
        // If not provided, assignment.data is used.
        data?: any
        session?: any
    }
) {
    if (!assignment) throw new Error('Assignment is required for snapshot')
    if (!options.schoolYearId) throw new Error('SchoolYearId is required for snapshot')

    // Determine appropriate signature period ID for the meta
    let signaturePeriodId = ''
    try {
        if (reason === 'sem1') {
            signaturePeriodId = computeSignaturePeriodId(options.schoolYearId, 'sem1')
        } else if (reason === 'year_end' || reason === 'promotion') {
            signaturePeriodId = computeSignaturePeriodId(options.schoolYearId, 'end_of_year')
        } else {
            signaturePeriodId = `${options.schoolYearId}_${reason}`
        }
    } catch (e) {
        // Fallback
        signaturePeriodId = `${options.schoolYearId}_${reason}`
    }

    const meta = buildSavedGradebookMeta({
        templateVersion: assignment.templateVersion || 1,
        dataVersion: assignment.dataVersion || 1,
        signaturePeriodId,
        schoolYearId: options.schoolYearId,
        level: options.level,
        snapshotReason: reason
    })

    const payload = {
        studentId: assignment.studentId,
        schoolYearId: options.schoolYearId,
        level: options.level,
        classId: options.classId || '',
        templateId: assignment.templateId,
        data: options.data || assignment.data || {},
        meta,
        createdAt: new Date()
    }

    const snapshot = options.session
        ? await SavedGradebook.create([payload], { session: options.session })
        : await SavedGradebook.create(payload)

    return Array.isArray(snapshot) ? snapshot[0] : snapshot
}

/**
 * Gets teacher completions for a specific school year.
 * If the year matches the current completionSchoolYearId, returns the current teacherCompletions.
 * Otherwise, looks up in teacherCompletionsByYear history.
 * 
 * @param assignment - The template assignment document
 * @param forYearId - The school year ID to get completions for
 * @returns Array of teacher completions for that year, or empty array if not found
 */
export function getTeacherCompletionsForYear(assignment: any, forYearId: string): any[] {
    if (!assignment || !forYearId) return []

    const currentYearId = String(assignment.completionSchoolYearId || '')

    // If asking for the current year, return current completions
    if (currentYearId === forYearId) {
        return assignment.teacherCompletions || []
    }

    // Otherwise, look up in historical data
    const history = assignment.teacherCompletionsByYear || {}
    return history[forYearId] || []
}

/**
 * Gets completion flags for a specific school year.
 * If the year matches the current completionSchoolYearId, returns the current flags.
 * Otherwise, looks up in completionHistoryByYear.
 * 
 * @param assignment - The template assignment document
 * @param forYearId - The school year ID to get completion flags for
 * @returns Object with completion flags for that year
 */
export function getCompletionFlagsForYear(assignment: any, forYearId: string): {
    isCompleted: boolean
    completedAt: Date | null
    completedBy: string | null
    isCompletedSem1: boolean
    completedAtSem1: Date | null
    isCompletedSem2: boolean
    completedAtSem2: Date | null
    status: string
} {
    const defaults = {
        isCompleted: false,
        completedAt: null,
        completedBy: null,
        isCompletedSem1: false,
        completedAtSem1: null,
        isCompletedSem2: false,
        completedAtSem2: null,
        status: 'draft'
    }

    if (!assignment || !forYearId) return defaults

    const currentYearId = String(assignment.completionSchoolYearId || '')

    // If asking for the current year, return current flags
    if (currentYearId === forYearId) {
        return {
            isCompleted: assignment.isCompleted || false,
            completedAt: assignment.completedAt || null,
            completedBy: assignment.completedBy || null,
            isCompletedSem1: assignment.isCompletedSem1 || false,
            completedAtSem1: assignment.completedAtSem1 || null,
            isCompletedSem2: assignment.isCompletedSem2 || false,
            completedAtSem2: assignment.completedAtSem2 || null,
            status: assignment.status || 'draft'
        }
    }

    // Otherwise, look up in historical data
    const history = assignment.completionHistoryByYear || {}
    const yearHistory = history[forYearId]

    if (yearHistory) {
        return {
            isCompleted: yearHistory.isCompleted || false,
            completedAt: yearHistory.completedAt || null,
            completedBy: yearHistory.completedBy || null,
            isCompletedSem1: yearHistory.isCompletedSem1 || false,
            completedAtSem1: yearHistory.completedAtSem1 || null,
            isCompletedSem2: yearHistory.isCompletedSem2 || false,
            completedAtSem2: yearHistory.completedAtSem2 || null,
            status: yearHistory.status || 'draft'
        }
    }

    return defaults
}

/**
 * Gets assigned teachers for a specific school year.
 * If the year matches the current completionSchoolYearId, returns the current assignedTeachers.
 * Otherwise, looks up in assignedTeachersByYear history.
 * 
 * @param assignment - The template assignment document
 * @param forYearId - The school year ID to get assigned teachers for
 * @returns Array of teacher IDs for that year, or empty array if not found
 */
export function getAssignedTeachersForYear(assignment: any, forYearId: string): string[] {
    if (!assignment || !forYearId) return []

    const currentYearId = String(assignment.completionSchoolYearId || '')

    // If asking for the current year, return current assigned teachers
    if (currentYearId === forYearId) {
        return assignment.assignedTeachers || []
    }

    // Otherwise, look up in historical data
    const history = assignment.assignedTeachersByYear || {}
    return history[forYearId] || []
}
