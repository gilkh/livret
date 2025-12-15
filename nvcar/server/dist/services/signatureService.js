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
const signTemplateAssignment = async ({ templateAssignmentId, signerId, type = 'standard', signatureUrl, req }) => {
    // Get the template assignment
    const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId);
    if (!assignment) {
        throw new Error('not_found');
    }
    // Check if already signed in the active school year
    const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
    const query = { templateAssignmentId, type };
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
        query.signedAt = { $gt: effectiveThreshold, $lte: upperBound };
    }
    const existing = await TemplateSignature_1.TemplateSignature.findOne(query).lean();
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
        signatureUrl
    });
    // Persist signature metadata in assignment data
    {
        const now = new Date();
        let yearName = '';
        if (activeYear?.name) {
            yearName = String(activeYear.name);
        }
        else {
            const currentYear = now.getFullYear();
            const month = now.getMonth();
            const startYear = month >= 8 ? currentYear : currentYear - 1;
            yearName = `${startYear}/${startYear + 1}`;
        }
        await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, {
            $push: {
                'data.signatures': {
                    type,
                    signedAt: now,
                    subAdminId: signerId,
                    schoolYearId: activeYear ? String(activeYear._id) : undefined,
                    schoolYearName: yearName
                }
            }
        });
    }
    // Update assignment status
    // If any signature is added, we consider it signed.
    if (assignment.status !== 'signed') {
        assignment.status = 'signed';
        await assignment.save();
    }
    // If this is a final signature, promote the student if not already promoted
    if (type === 'end_of_year') {
        const student = await Student_1.Student.findById(assignment.studentId);
        if (student && student.level) {
            const nextLevel = await getNextLevel(student.level);
            const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
            if (nextLevel && activeSchoolYear) {
                // Check if already promoted this year
                const alreadyPromoted = student.promotions?.some((p) => p.schoolYearId === String(activeSchoolYear._id));
                if (!alreadyPromoted) {
                    // Create promotion data
                    const promotionData = {
                        fromLevel: student.level,
                        toLevel: nextLevel,
                        date: new Date(),
                        schoolYearId: String(activeSchoolYear._id),
                        promotedBy: signerId
                    };
                    // Update student
                    await Student_1.Student.findByIdAndUpdate(student._id, {
                        $push: { promotions: promotionData }
                    });
                    // Also save promotion info in the assignment data so it persists
                    // We need to fetch assignment again or update the doc we have
                    // But we already have assignment doc loaded
                    const yearName = activeSchoolYear.name || new Date().getFullYear().toString();
                    await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, {
                        $push: {
                            'data.promotions': {
                                from: student.level,
                                to: nextLevel,
                                year: yearName,
                                date: new Date(),
                                by: signerId
                            }
                        }
                    });
                }
            }
        }
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
const unsignTemplateAssignment = async ({ templateAssignmentId, signerId, type, req }) => {
    // Get assignment
    const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId);
    if (!assignment) {
        throw new Error('not_found');
    }
    const query = { templateAssignmentId };
    if (type)
        query.type = type;
    await TemplateSignature_1.TemplateSignature.deleteMany(query);
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
            if (type) {
                return !(String(s.subAdminId) === String(signerId) && String(s.type) === String(type));
            }
            return String(s.subAdminId) !== String(signerId);
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
