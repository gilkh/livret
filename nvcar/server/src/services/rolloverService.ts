import { TemplateAssignment } from '../models/TemplateAssignment'
import { SavedGradebook } from '../models/SavedGradebook'
import { buildSavedGradebookMeta, computeSignaturePeriodId } from '../utils/readinessUtils'

/**
 * Returns the update object for rolling over an assignment to a new school year.
 * This resets all workflow/progress fields but preserves the actual carnet data.
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
 * Snapshot reasons supported by the system
 */
export type SnapshotReason = 'promotion' | 'year_end' | 'sem1' | 'transfer' | 'manual'

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
        classId: options.classId,
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
