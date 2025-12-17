"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unsignTemplateAssignment = exports.signTemplateAssignment = void 0;
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TemplateSignature_1 = require("../models/TemplateSignature");
const Student_1 = require("../models/Student");
const SchoolYear_1 = require("../models/SchoolYear");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const auditLogger_1 = require("../utils/auditLogger");
const Level_1 = require("../models/Level");
const computeYearNameFromRange = (name, offset) => {
    const match = String(name || '').match(/(\d{4})([-/.])(\d{4})/);
    if (!match)
        return '';
    const startYear = parseInt(match[1], 10);
    const sep = match[2];
    const endYear = parseInt(match[3], 10);
    if (Number.isNaN(startYear) || Number.isNaN(endYear))
        return '';
    return `${startYear + offset}${sep}${endYear + offset}`;
};
const resolveSignatureSchoolYear = async (activeYear, type, now) => {
    if (!activeYear) {
        const currentYear = now.getFullYear();
        const month = now.getMonth();
        const startYear = month >= 8 ? currentYear : currentYear - 1;
        if (type === 'end_of_year') {
            return { schoolYearId: undefined, schoolYearName: `${startYear + 1}/${startYear + 2}` };
        }
        return { schoolYearId: undefined, schoolYearName: `${startYear}/${startYear + 1}` };
    }
    if (type !== 'end_of_year') {
        return { schoolYearId: String(activeYear._id), schoolYearName: String(activeYear.name || '') };
    }
    let nextYear = null;
    if (activeYear.sequence && Number(activeYear.sequence) > 0) {
        nextYear = await SchoolYear_1.SchoolYear.findOne({ sequence: Number(activeYear.sequence) + 1 }).lean();
    }
    if (!nextYear) {
        const allYears = await SchoolYear_1.SchoolYear.find({}).sort({ startDate: 1 }).lean();
        const idx = allYears.findIndex(y => String(y._id) === String(activeYear._id));
        if (idx >= 0 && idx < allYears.length - 1)
            nextYear = allYears[idx + 1];
    }
    if (nextYear) {
        return { schoolYearId: String(nextYear._id), schoolYearName: String(nextYear.name || '') };
    }
    const computedName = computeYearNameFromRange(String(activeYear.name || ''), 1);
    if (computedName) {
        const found = await SchoolYear_1.SchoolYear.findOne({ name: computedName }).lean();
        if (found)
            return { schoolYearId: String(found._id), schoolYearName: String(found.name || computedName) };
        return { schoolYearId: undefined, schoolYearName: computedName };
    }
    return { schoolYearId: String(activeYear._id), schoolYearName: String(activeYear.name || '') };
};
const getNextLevel = async (current) => {
    if (!current)
        return null;
    // Try to find by DB order
    try {
        const currentDoc = await Level_1.Level.findOne({ name: current }).lean();
        if (currentDoc) {
            const nextDoc = await Level_1.Level.findOne({ order: currentDoc.order + 1 }).lean();
            if (nextDoc)
                return nextDoc.name;
        }
    }
    catch (e) {
        console.error('Error calculating next level:', e);
    }
    // Fallback legacy logic
    const c = current.toUpperCase();
    if (c === 'TPS')
        return 'PS';
    if (c === 'PS')
        return 'MS';
    if (c === 'MS')
        return 'GS';
    if (c === 'GS')
        return 'EB1';
    if (c === 'KG1')
        return 'KG2';
    if (c === 'KG2')
        return 'KG3';
    if (c === 'KG3')
        return 'EB1';
    return null;
};
const signTemplateAssignment = async ({ templateAssignmentId, signerId, type = 'standard', signatureUrl, req, level }) => {
    // Get the template assignment
    const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId);
    if (!assignment) {
        throw new Error('not_found');
    }
    // Check if already signed in the active school year
    const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
    const baseQuery = { templateAssignmentId, type };
    if (activeYear) {
        let thresholdDate = activeYear.startDate;
        // Try to find previous school year to determine the "gap"
        const previousYear = await SchoolYear_1.SchoolYear.findOne({ endDate: { $lt: activeYear.startDate } })
            .sort({ endDate: -1 })
            .lean();
        if (previousYear) {
            thresholdDate = previousYear.endDate;
        }
        // Use the later of endDate or current date as the upper bound
        const now = new Date();
        const endDate = new Date(activeYear.endDate);
        const upperBound = now > endDate ? now : endDate;
        // CRITICAL FIX: If current date is before the threshold (future school year),
        // use one year ago as the threshold
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const effectiveThreshold = new Date(thresholdDate) > now ? oneYearAgo : new Date(thresholdDate);
        baseQuery.signedAt = { $gt: effectiveThreshold, $lte: upperBound };
    }
    const existingQuery = (() => {
        if (!level)
            return baseQuery;
        return {
            ...baseQuery,
            $or: [
                { level },
                { level: { $exists: false } },
                { level: null },
                { level: '' },
            ]
        };
    })();
    const existing = await TemplateSignature_1.TemplateSignature.findOne(existingQuery).lean();
    if (existing) {
        throw new Error('already_signed');
    }
    // Check completion status for the requested semester
    // standard -> Sem 1
    // end_of_year -> Sem 2
    if (type === 'standard') {
        if (!assignment.isCompletedSem1) {
            // For backward compatibility, check isCompleted if isCompletedSem1 is undefined?
            // But we just added it.
            // If data is old, isCompletedSem1 might be missing.
            // We can fallback to assignment.isCompleted
            if (!assignment.isCompletedSem1 && !assignment.isCompleted) {
                throw new Error('not_completed_sem1');
            }
        }
    }
    else if (type === 'end_of_year') {
        if (!assignment.isCompletedSem2) {
            throw new Error('not_completed_sem2');
        }
    }
    // Create signature
    // Note: We allow passing signatureUrl (used by Admin)
    // If not passed, it relies on signerId link (used by SubAdmin)
    const signature = await TemplateSignature_1.TemplateSignature.create({
        templateAssignmentId,
        subAdminId: signerId,
        signedAt: new Date(),
        status: 'signed',
        type,
        signatureUrl,
        level
    });
    // Persist signature metadata in assignment data
    {
        const now = new Date();
        const { schoolYearId, schoolYearName } = await resolveSignatureSchoolYear(activeYear, type, now);
        await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, {
            $push: {
                'data.signatures': {
                    type,
                    signedAt: now,
                    subAdminId: signerId,
                    schoolYearId,
                    schoolYearName,
                    level
                }
            }
        });
    }
    if (assignment.status !== 'signed') {
        assignment.status = 'signed';
        await assignment.save();
    }
    // Log audit
    const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
    const student = await Student_1.Student.findById(assignment.studentId).lean();
    await (0, auditLogger_1.logAudit)({
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
    });
    return signature;
};
exports.signTemplateAssignment = signTemplateAssignment;
const unsignTemplateAssignment = async ({ templateAssignmentId, signerId, type, req, level }) => {
    // Get assignment
    const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId);
    if (!assignment) {
        throw new Error('not_found');
    }
    const baseQuery = { templateAssignmentId };
    if (type)
        baseQuery.type = type;
    const deleteQuery = (() => {
        if (!level)
            return baseQuery;
        return {
            ...baseQuery,
            $or: [
                { level },
                { level: { $exists: false } },
                { level: null },
                { level: '' },
            ]
        };
    })();
    await TemplateSignature_1.TemplateSignature.deleteMany(deleteQuery);
    // If removing end_of_year signature, remove promotion data
    if (type === 'end_of_year') {
        if (assignment.data && assignment.data.promotions) {
            const updatedPromotions = assignment.data.promotions.filter((p) => p.by !== signerId);
            // Only update if changed
            if (updatedPromotions.length !== assignment.data.promotions.length) {
                assignment.data.promotions = updatedPromotions;
                assignment.markModified('data');
                await assignment.save();
            }
        }
    }
    // Remove persisted signature metadata from assignment data
    if (assignment.data && Array.isArray(assignment.data.signatures)) {
        const before = assignment.data.signatures;
        const after = before.filter((s) => {
            let match = String(s.subAdminId) === String(signerId);
            if (match && type) {
                match = String(s.type) === String(type);
            }
            if (match && level) {
                match = s.level === level || s.level === undefined || s.level === null || s.level === '';
            }
            return !match;
        });
        if (after.length !== before.length) {
            ;
            assignment.data.signatures = after;
            assignment.markModified('data');
            await assignment.save();
        }
    }
    // Check if any signatures remain
    const remaining = await TemplateSignature_1.TemplateSignature.countDocuments({ templateAssignmentId });
    if (remaining === 0) {
        // Revert status to completed
        // Or should we check if it was completed? 
        // Usually it was completed before signing.
        await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'completed' });
    }
    // Log audit
    const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
    const student = await Student_1.Student.findById(assignment.studentId).lean();
    await (0, auditLogger_1.logAudit)({
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
    });
    return { success: true };
};
exports.unsignTemplateAssignment = unsignTemplateAssignment;
