"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeVisibleBlockKeys = computeVisibleBlockKeys;
exports.archiveYearCompletions = archiveYearCompletions;
exports.getRolloverUpdate = getRolloverUpdate;
exports.getCompleteRolloverUpdate = getCompleteRolloverUpdate;
exports.createAssignmentSnapshot = createAssignmentSnapshot;
exports.getTeacherCompletionsForYear = getTeacherCompletionsForYear;
exports.getCompletionFlagsForYear = getCompletionFlagsForYear;
exports.getAssignedTeachersForYear = getAssignedTeachersForYear;
const SavedGradebook_1 = require("../models/SavedGradebook");
const Setting_1 = require("../models/Setting");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const readinessUtils_1 = require("../utils/readinessUtils");
// Level order for comparing block levels
const levelOrder = { PS: 0, MS: 1, GS: 2, CP: 3, CE1: 4, CE2: 5, CM1: 6, CM2: 7, EB1: 8 };
/**
 * Build the visibility key for a block (same as client-side)
 */
function buildVisibilityKey(templateId, pageIndex, blockIndex, blockId) {
    if (blockId)
        return `block:${blockId}`;
    return `tpl:${templateId || ''}:p:${pageIndex}:b:${blockIndex}`;
}
/**
 * Get the level from a block's props
 */
function getBlockLevel(b) {
    if (!b?.props)
        return null;
    const lvl = b.props.level || b.props.levels;
    if (typeof lvl === 'string' && lvl.trim())
        return lvl.trim();
    if (Array.isArray(lvl) && lvl.length === 1)
        return String(lvl[0]).trim();
    return null;
}
/**
 * Check if block's level is higher than student's level
 */
function isBlockLevelHigherThanStudent(blockLevel, studentLevel) {
    if (!blockLevel)
        return false;
    const blockOrd = levelOrder[blockLevel.toUpperCase()] ?? 99;
    const studentOrd = levelOrder[studentLevel.toUpperCase()] ?? 99;
    return blockOrd > studentOrd;
}
/**
 * Compute visible block keys for a snapshot based on template, visibility settings, and signature status.
 * This captures exactly which blocks should be shown, matching the PDF export logic.
 */
async function computeVisibleBlockKeys(templateId, studentLevel, blockVisibilitySettings, signatureStatus) {
    const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
    if (!template?.pages)
        return [];
    const visibleKeys = [];
    const { hasSem1, hasSem2 } = signatureStatus;
    for (let pageIndex = 0; pageIndex < template.pages.length; pageIndex++) {
        const page = template.pages[pageIndex];
        if (!page?.blocks)
            continue;
        for (let blockIndex = 0; blockIndex < page.blocks.length; blockIndex++) {
            const b = page.blocks[blockIndex];
            if (!b || !b.props)
                continue;
            const blockLevel = getBlockLevel(b);
            // Hide blocks whose level is higher than student's current level
            if (isBlockLevelHigherThanStudent(blockLevel, studentLevel))
                continue;
            const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null;
            const key = buildVisibilityKey(templateId, pageIndex, blockIndex, blockId);
            let shouldShow = true;
            if (blockLevel) {
                // Block has a level - use that level's settings
                const visibilitySetting = blockVisibilitySettings?.[blockLevel.toUpperCase()]?.pdf?.[key];
                if (visibilitySetting) {
                    if (visibilitySetting === 'never')
                        shouldShow = false;
                    else if (visibilitySetting === 'after_sem1' && !hasSem1 && !hasSem2)
                        shouldShow = false;
                    else if (visibilitySetting === 'after_sem2' && !hasSem2)
                        shouldShow = false;
                }
            }
            else {
                // Block has NO level - check all levels at or below student's current level
                const studentLvl = studentLevel.toUpperCase();
                const studentOrder = levelOrder[studentLvl] ?? 99;
                const levelsToCheck = Object.keys(levelOrder).filter(lvl => levelOrder[lvl] <= studentOrder);
                let foundSetting = false;
                let anyLevelWouldShow = false;
                for (const lvl of levelsToCheck) {
                    const visibilitySetting = blockVisibilitySettings?.[lvl]?.pdf?.[key];
                    if (visibilitySetting) {
                        foundSetting = true;
                        if (visibilitySetting === 'always') {
                            anyLevelWouldShow = true;
                            break;
                        }
                        else if (visibilitySetting === 'after_sem1' && (hasSem1 || hasSem2)) {
                            anyLevelWouldShow = true;
                            break;
                        }
                        else if (visibilitySetting === 'after_sem2' && hasSem2) {
                            anyLevelWouldShow = true;
                            break;
                        }
                        // 'never' doesn't set anyLevelWouldShow
                    }
                }
                // If no settings found, default to visible; if found, use the result
                shouldShow = !foundSetting || anyLevelWouldShow;
            }
            if (shouldShow) {
                visibleKeys.push(key);
            }
        }
    }
    return visibleKeys;
}
/**
 * Archives the current year's teacher completions, completion flags, and assigned teachers before rollover.
 * This ensures historical progress is NEVER lost.
 *
 * @param assignment - The current assignment document
 * @param fromYearId - The school year ID being archived (current year)
 * @returns Update operations to archive the data
 */
function archiveYearCompletions(assignment, fromYearId) {
    if (!fromYearId)
        return {};
    const updates = {};
    // Archive teacher completions for this year
    const currentTeacherCompletions = assignment?.teacherCompletions || [];
    if (currentTeacherCompletions.length > 0) {
        updates[`teacherCompletionsByYear.${fromYearId}`] = JSON.parse(JSON.stringify(currentTeacherCompletions));
    }
    // Archive completion flags for this year
    const completionHistory = {
        isCompleted: assignment?.isCompleted || false,
        completedAt: assignment?.completedAt || null,
        completedBy: assignment?.completedBy || null,
        isCompletedSem1: assignment?.isCompletedSem1 || false,
        completedAtSem1: assignment?.completedAtSem1 || null,
        isCompletedSem2: assignment?.isCompletedSem2 || false,
        completedAtSem2: assignment?.completedAtSem2 || null,
        status: assignment?.status || 'draft',
        archivedAt: new Date()
    };
    updates[`completionHistoryByYear.${fromYearId}`] = completionHistory;
    // Archive assigned teachers for this year
    const currentAssignedTeachers = assignment?.assignedTeachers || [];
    if (currentAssignedTeachers.length > 0) {
        updates[`assignedTeachersByYear.${fromYearId}`] = JSON.parse(JSON.stringify(currentAssignedTeachers));
    }
    return updates;
}
/**
 * Returns the update object for rolling over an assignment to a new school year.
 * This resets all workflow/progress fields but preserves the actual carnet data.
 *
 * IMPORTANT: Before calling this, you should call archiveYearCompletions to preserve
 * the current year's progress in teacherCompletionsByYear and completionHistoryByYear.
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
 * Performs a complete rollover with archival of the current year's completions.
 * This is the preferred method for transitioning to a new school year.
 *
 * @param assignment - The current assignment document
 * @param fromYearId - The school year being archived (can be null if unknown)
 * @param targetYearId - The new school year ID
 * @param assignedBy - The user performing the rollover
 * @returns Combined update object with archival and reset operations
 */
function getCompleteRolloverUpdate(assignment, fromYearId, targetYearId, assignedBy) {
    const archiveUpdates = fromYearId ? archiveYearCompletions(assignment, fromYearId) : {};
    const rolloverUpdates = getRolloverUpdate(targetYearId, assignedBy);
    return {
        ...rolloverUpdates,
        ...archiveUpdates
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
    let blockVisibilitySettings = {};
    try {
        const setting = await Setting_1.Setting.findOne({ key: 'block_visibility_settings' }).lean();
        if (setting?.value)
            blockVisibilitySettings = setting.value;
    }
    catch {
        // non-blocking
    }
    // Compute signature status for visibility calculation
    // For sem1 snapshot: hasSem1=true, hasSem2=false
    // For year_end/promotion: hasSem1=true, hasSem2=true
    const signatureStatus = {
        hasSem1: reason === 'sem1' || reason === 'year_end' || reason === 'promotion' || reason === 'exit',
        hasSem2: reason === 'year_end' || reason === 'promotion' || reason === 'exit'
    };
    // Compute which blocks are visible at this snapshot moment
    let visibleBlockKeys = [];
    try {
        visibleBlockKeys = await computeVisibleBlockKeys(assignment.templateId, options.level, blockVisibilitySettings, signatureStatus);
    }
    catch (e) {
        console.error('Failed to compute visible block keys:', e);
        // Continue without - fallback to old behavior
    }
    const baseData = options.data || assignment.data || {};
    const dataWithVisibility = (baseData && typeof baseData === 'object' && !Array.isArray(baseData))
        ? {
            ...baseData,
            blockVisibilitySettings: baseData.blockVisibilitySettings || blockVisibilitySettings,
            visibleBlockKeys // Store the computed visible keys
        }
        : baseData;
    const payload = {
        studentId: assignment.studentId,
        schoolYearId: options.schoolYearId,
        level: options.level,
        classId: options.classId,
        templateId: assignment.templateId,
        data: dataWithVisibility,
        meta,
        createdAt: new Date()
    };
    const snapshot = options.session
        ? await SavedGradebook_1.SavedGradebook.create([payload], { session: options.session })
        : await SavedGradebook_1.SavedGradebook.create(payload);
    return Array.isArray(snapshot) ? snapshot[0] : snapshot;
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
function getTeacherCompletionsForYear(assignment, forYearId) {
    if (!assignment || !forYearId)
        return [];
    const currentYearId = String(assignment.completionSchoolYearId || '');
    // If asking for the current year, return current completions
    if (currentYearId === forYearId) {
        return assignment.teacherCompletions || [];
    }
    // Otherwise, look up in historical data
    const history = assignment.teacherCompletionsByYear || {};
    return history[forYearId] || [];
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
function getCompletionFlagsForYear(assignment, forYearId) {
    const defaults = {
        isCompleted: false,
        completedAt: null,
        completedBy: null,
        isCompletedSem1: false,
        completedAtSem1: null,
        isCompletedSem2: false,
        completedAtSem2: null,
        status: 'draft'
    };
    if (!assignment || !forYearId)
        return defaults;
    const currentYearId = String(assignment.completionSchoolYearId || '');
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
        };
    }
    // Otherwise, look up in historical data
    const history = assignment.completionHistoryByYear || {};
    const yearHistory = history[forYearId];
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
        };
    }
    return defaults;
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
function getAssignedTeachersForYear(assignment, forYearId) {
    if (!assignment || !forYearId)
        return [];
    const currentYearId = String(assignment.completionSchoolYearId || '');
    // If asking for the current year, return current assigned teachers
    if (currentYearId === forYearId) {
        return assignment.assignedTeachers || [];
    }
    // Otherwise, look up in historical data
    const history = assignment.assignedTeachersByYear || {};
    return history[forYearId] || [];
}
