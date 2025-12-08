"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unsignTemplateAssignment = exports.signTemplateAssignment = void 0;
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TemplateSignature_1 = require("../models/TemplateSignature");
const Student_1 = require("../models/Student");
const SchoolYear_1 = require("../models/SchoolYear");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const auditLogger_1 = require("../utils/auditLogger");
const getNextLevel = (current) => {
    if (!current)
        return null;
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
    // Check if already signed
    const existing = await TemplateSignature_1.TemplateSignature.findOne({ templateAssignmentId, type }).lean();
    if (existing) {
        throw new Error('already_signed');
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
            const nextLevel = getNextLevel(student.level);
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
