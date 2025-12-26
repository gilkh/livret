"use strict";
/**
 * Centralized Readiness/Completion Logic
 *
 * This utility provides a single source of truth for computing readiness and completion
 * status for template assignments. It is used by:
 * - Signing endpoints (to verify readiness before signing)
 * - Promotion endpoints (to verify eligibility)
 * - UI state (to display completion status)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_FIELDS_BLOCKLIST = exports.SAFE_DATA_FIELDS_ALLOWLIST = void 0;
exports.computeSignaturePeriodId = computeSignaturePeriodId;
exports.parseSignaturePeriodId = parseSignaturePeriodId;
exports.resolveCurrentSignaturePeriod = resolveCurrentSignaturePeriod;
exports.resolveEndOfYearSignaturePeriod = resolveEndOfYearSignaturePeriod;
exports.computeCompletionStatus = computeCompletionStatus;
exports.validateSignatureReadiness = validateSignatureReadiness;
exports.validatePromotionReadiness = validatePromotionReadiness;
exports.sanitizeDataForNewAssignment = sanitizeDataForNewAssignment;
exports.buildSavedGradebookMeta = buildSavedGradebookMeta;
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TemplateSignature_1 = require("../models/TemplateSignature");
const Enrollment_1 = require("../models/Enrollment");
const Class_1 = require("../models/Class");
const SchoolYear_1 = require("../models/SchoolYear");
const cache_1 = require("./cache");
/**
 * Compute a deterministic signaturePeriodId based on schoolYearId and period type.
 * Format: {schoolYearId}_{periodType}
 */
function computeSignaturePeriodId(schoolYearId, periodType) {
    if (!schoolYearId) {
        throw new Error('schoolYearId is required to compute signaturePeriodId');
    }
    return `${schoolYearId}_${periodType}`;
}
/**
 * Parse a signaturePeriodId back into its components
 */
function parseSignaturePeriodId(signaturePeriodId) {
    if (!signaturePeriodId)
        return null;
    // Check for known period type suffixes (order matters - check longer ones first)
    const periodTypes = ['end_of_year', 'sem1', 'sem2'];
    for (const periodType of periodTypes) {
        const suffix = `_${periodType}`;
        if (signaturePeriodId.endsWith(suffix)) {
            const schoolYearId = signaturePeriodId.slice(0, -suffix.length);
            if (schoolYearId) {
                return { schoolYearId, periodType };
            }
        }
    }
    return null;
}
/**
 * Resolve the current signature period based on the active school year and semester
 */
async function resolveCurrentSignaturePeriod() {
    const activeYear = await (0, cache_1.withCache)('school-years-active', () => SchoolYear_1.SchoolYear.findOne({ active: true }).lean());
    if (!activeYear) {
        throw new Error('no_active_school_year');
    }
    const activeSemester = activeYear.activeSemester || 1;
    const periodType = activeSemester === 1 ? 'sem1' : 'sem2';
    const schoolYearId = String(activeYear._id);
    const signaturePeriodId = computeSignaturePeriodId(schoolYearId, periodType);
    return {
        schoolYearId,
        schoolYearName: String(activeYear.name || ''),
        periodType,
        signaturePeriodId
    };
}
/**
 * Resolve the signature period for end-of-year signatures (promotion)
 */
async function resolveEndOfYearSignaturePeriod() {
    const activeYear = await (0, cache_1.withCache)('school-years-active', () => SchoolYear_1.SchoolYear.findOne({ active: true }).lean());
    if (!activeYear) {
        throw new Error('no_active_school_year');
    }
    const schoolYearId = String(activeYear._id);
    const signaturePeriodId = computeSignaturePeriodId(schoolYearId, 'end_of_year');
    // Find next school year
    let nextSchoolYear = null;
    if (activeYear.sequence && Number(activeYear.sequence) > 0) {
        nextSchoolYear = await SchoolYear_1.SchoolYear.findOne({ sequence: Number(activeYear.sequence) + 1 }).lean();
    }
    if (!nextSchoolYear) {
        const allYears = await SchoolYear_1.SchoolYear.find({}).sort({ startDate: 1 }).lean();
        const idx = allYears.findIndex(y => String(y._id) === schoolYearId);
        if (idx >= 0 && idx < allYears.length - 1) {
            nextSchoolYear = allYears[idx + 1];
        }
    }
    if (!nextSchoolYear && activeYear.name) {
        const match = String(activeYear.name).match(/(\d{4})([-/.])(\d{4})/);
        if (match) {
            const startYear = parseInt(match[1], 10);
            const sep = match[2];
            const endYear = parseInt(match[3], 10);
            const nextName = `${startYear + 1}${sep}${endYear + 1}`;
            nextSchoolYear = await SchoolYear_1.SchoolYear.findOne({ name: nextName }).lean();
        }
    }
    return {
        schoolYearId,
        schoolYearName: String(activeYear.name || ''),
        signaturePeriodId,
        nextSchoolYearId: nextSchoolYear ? String(nextSchoolYear._id) : null
    };
}
/**
 * Compute the full completion/readiness status for a template assignment.
 * This is the single source of truth used by sign, promote, and UI state.
 */
async function computeCompletionStatus(options) {
    const { templateAssignmentId, checkSignatures = true, level: providedLevel } = options;
    const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
    if (!assignment) {
        throw new Error('assignment_not_found');
    }
    const result = {
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
    };
    // Get completion status from assignment
    result.isCompletedSem1 = !!assignment.isCompletedSem1;
    result.isCompletedSem2 = !!assignment.isCompletedSem2;
    result.isFullyCompleted = assignment.isCompleted === true;
    // If isCompleted but not sem flags, treat as both complete (backwards compatibility)
    if (result.isFullyCompleted && !result.isCompletedSem1 && !result.isCompletedSem2) {
        result.isCompletedSem1 = true;
        result.isCompletedSem2 = true;
    }
    // Check signatures if requested
    if (checkSignatures) {
        const signaturePeriodInfo = await resolveCurrentSignaturePeriod().catch(() => null);
        const activeSchoolYearId = signaturePeriodInfo?.schoolYearId;
        const sem1PeriodId = activeSchoolYearId ? computeSignaturePeriodId(activeSchoolYearId, 'sem1') : null;
        const sem2PeriodId = activeSchoolYearId ? computeSignaturePeriodId(activeSchoolYearId, 'sem2') : null;
        const endOfYearPeriodId = activeSchoolYearId ? computeSignaturePeriodId(activeSchoolYearId, 'end_of_year') : null;
        // Get all signatures for this assignment
        const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId }).lean();
        // Determine level for filtering
        let level = providedLevel;
        if (!level) {
            const enrollment = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId, status: { $in: ['active', 'promoted'] } }).lean();
            if (enrollment?.classId) {
                const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
                if (cls && cls.level)
                    level = cls.level;
            }
        }
        for (const sig of signatures) {
            // Skip if level doesn't match (when level-specific)
            if (level && sig.level && sig.level !== level)
                continue;
            const sigType = sig.type || 'standard';
            const sigPeriodId = sig.signaturePeriodId;
            const isLegacy = !sigPeriodId;
            if (sigType === 'standard') {
                if (isLegacy || (sem1PeriodId && sigPeriodId === sem1PeriodId) || (sem2PeriodId && sigPeriodId === sem2PeriodId)) {
                    result.isSignedSem1 = true;
                }
            }
            else if (sigType === 'end_of_year') {
                if (isLegacy || (endOfYearPeriodId && sigPeriodId === endOfYearPeriodId)) {
                    result.isSignedEndOfYear = true;
                }
            }
        }
        result.isSigned = result.isSignedSem1 || result.isSignedEndOfYear;
        result.isSignedSem2 = result.isSignedEndOfYear; // For clarity
    }
    // Determine what can be signed
    result.canSignSem1 = result.isCompletedSem1 && !result.isSignedSem1;
    result.canSignSem2 = result.isCompletedSem2 && !result.isSignedSem2;
    result.canSignEndOfYear = result.isCompletedSem2 && !result.isSignedEndOfYear;
    // Can promote if signed end of year
    result.canPromote = result.isSignedEndOfYear;
    result.isReady = result.isCompletedSem1 || result.isCompletedSem2;
    return result;
}
/**
 * Validate that a signature can be created for the given assignment and period.
 * Throws an error if validation fails.
 */
async function validateSignatureReadiness(templateAssignmentId, signatureType, level) {
    const status = await computeCompletionStatus({
        templateAssignmentId,
        checkSignatures: true,
        level
    });
    if (signatureType === 'standard') {
        if (!status.isCompletedSem1) {
            throw new Error('not_completed_sem1');
        }
        if (status.isSignedSem1) {
            throw new Error('already_signed');
        }
    }
    else if (signatureType === 'end_of_year') {
        if (!status.isCompletedSem2) {
            throw new Error('not_completed_sem2');
        }
        if (status.isSignedEndOfYear) {
            throw new Error('already_signed');
        }
    }
    // Get signature period
    const periodInfo = signatureType === 'end_of_year'
        ? await resolveEndOfYearSignaturePeriod()
        : await resolveCurrentSignaturePeriod();
    return {
        signaturePeriodId: periodInfo.signaturePeriodId,
        schoolYearId: periodInfo.schoolYearId
    };
}
/**
 * Validate that a promotion can be performed for the given assignment.
 * Throws an error if validation fails.
 */
async function validatePromotionReadiness(templateAssignmentId, subAdminId) {
    const periodInfo = await resolveEndOfYearSignaturePeriod();
    // Check for end-of-year signature by this sub-admin for the CURRENT end-of-year period
    const signature = await TemplateSignature_1.TemplateSignature.findOne({
        templateAssignmentId,
        subAdminId,
        type: 'end_of_year',
        signaturePeriodId: periodInfo.signaturePeriodId,
    }).lean();
    if (!signature) {
        throw new Error('not_signed_by_you');
    }
    if (!periodInfo.nextSchoolYearId) {
        throw new Error('no_next_school_year');
    }
    return {
        signaturePeriodId: periodInfo.signaturePeriodId,
        schoolYearId: periodInfo.schoolYearId,
        nextSchoolYearId: periodInfo.nextSchoolYearId
    };
}
/**
 * Fields that are safe to copy forward when creating a new assignment from a previous one.
 * This replaces the blacklist-based sanitization with an explicit allowlist.
 */
exports.SAFE_DATA_FIELDS_ALLOWLIST = [
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
];
/**
 * System fields that should NEVER be copied forward
 */
exports.SYSTEM_FIELDS_BLOCKLIST = [
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
];
/**
 * Sanitize assignment data for copying to a new year/assignment.
 * Uses an explicit allowlist approach instead of blacklist.
 *
 * @param data - The source data to sanitize
 * @param sourceAssignmentId - ID of the source assignment (for metadata)
 * @returns Sanitized data with copiedFrom metadata
 */
function sanitizeDataForNewAssignment(data, sourceAssignmentId) {
    if (!data || typeof data !== 'object') {
        return { _copiedFrom: { assignmentId: sourceAssignmentId, copiedAt: new Date() } };
    }
    const sanitized = {
        _copiedFrom: {
            assignmentId: sourceAssignmentId,
            copiedAt: new Date()
        }
    };
    for (const [key, value] of Object.entries(data)) {
        // Skip system fields
        if (exports.SYSTEM_FIELDS_BLOCKLIST.includes(key))
            continue;
        // Skip internal metadata fields
        if (key.startsWith('_'))
            continue;
        // Check if key matches any allowlist prefix
        const isAllowed = exports.SAFE_DATA_FIELDS_ALLOWLIST.some(prefix => key.startsWith(prefix));
        if (isAllowed) {
            // Deep copy the value
            sanitized[key] = JSON.parse(JSON.stringify(value));
        }
    }
    return sanitized;
}
/**
 * Build the meta object for a SavedGradebook snapshot
 */
function buildSavedGradebookMeta(params) {
    return {
        templateVersion: params.templateVersion,
        dataVersion: params.dataVersion,
        signaturePeriodId: params.signaturePeriodId,
        schoolYearId: params.schoolYearId,
        level: params.level,
        snapshotReason: params.snapshotReason,
        archivedAt: new Date()
    };
}
