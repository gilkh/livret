"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRolloverUpdate = getRolloverUpdate;
exports.createAssignmentSnapshot = createAssignmentSnapshot;
const SavedGradebook_1 = require("../models/SavedGradebook");
const readinessUtils_1 = require("../utils/readinessUtils");
/**
 * Returns the update object for rolling over an assignment to a new school year.
 * This resets all workflow/progress fields but preserves the actual carnet data.
 */
function getRolloverUpdate(targetYearId, assignedBy) {
    const now = new Date();
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
    };
}
/**
 * Creates a snapshot of the current state of a TemplateAssignment.
 * This is crucial for audit trails before mutating the assignment (e.g. rollover)
 * or at critical milestones (e.g. end of semester).
 */
async function createAssignmentSnapshot(assignment, reason, options) {
    if (!assignment)
        throw new Error('Assignment is required for snapshot');
    if (!options.schoolYearId)
        throw new Error('SchoolYearId is required for snapshot');
    // Determine appropriate signature period ID for the meta
    let signaturePeriodId = '';
    try {
        if (reason === 'sem1') {
            signaturePeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(options.schoolYearId, 'sem1');
        }
        else if (reason === 'year_end' || reason === 'promotion') {
            signaturePeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(options.schoolYearId, 'end_of_year');
        }
        else {
            signaturePeriodId = `${options.schoolYearId}_${reason}`;
        }
    }
    catch (e) {
        // Fallback
        signaturePeriodId = `${options.schoolYearId}_${reason}`;
    }
    const meta = (0, readinessUtils_1.buildSavedGradebookMeta)({
        templateVersion: assignment.templateVersion || 1,
        dataVersion: assignment.dataVersion || 1,
        signaturePeriodId,
        schoolYearId: options.schoolYearId,
        level: options.level,
        snapshotReason: reason
    });
    const payload = {
        studentId: assignment.studentId,
        schoolYearId: options.schoolYearId,
        level: options.level,
        classId: options.classId,
        templateId: assignment.templateId,
        data: options.data || assignment.data || {},
        meta,
        createdAt: new Date()
    };
    const snapshot = options.session
        ? await SavedGradebook_1.SavedGradebook.create([payload], { session: options.session })
        : await SavedGradebook_1.SavedGradebook.create(payload);
    return Array.isArray(snapshot) ? snapshot[0] : snapshot;
}
