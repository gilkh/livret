"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subAdminTemplatesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const SubAdminAssignment_1 = require("../models/SubAdminAssignment");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TemplateChangeLog_1 = require("../models/TemplateChangeLog");
const TemplateSignature_1 = require("../models/TemplateSignature");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const Student_1 = require("../models/Student");
const User_1 = require("../models/User");
const auditLogger_1 = require("../utils/auditLogger");
exports.subAdminTemplatesRouter = (0, express_1.Router)();
// Sub-admin: Get assigned teachers
exports.subAdminTemplatesRouter.get('/teachers', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        const teachers = await User_1.User.find({ _id: { $in: teacherIds } }).lean();
        res.json(teachers);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Get template changes by a teacher
exports.subAdminTemplatesRouter.get('/teachers/:teacherId/changes', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { teacherId } = req.params;
        // Verify this teacher is assigned to this sub-admin
        const assignment = await SubAdminAssignment_1.SubAdminAssignment.findOne({ subAdminId, teacherId }).lean();
        if (!assignment)
            return res.status(403).json({ error: 'not_assigned_to_teacher' });
        // Get all template assignments for this teacher
        const templateAssignments = await TemplateAssignment_1.TemplateAssignment.find({ assignedTeachers: teacherId }).lean();
        const assignmentIds = templateAssignments.map(a => String(a._id));
        // Get all changes for these assignments
        const changes = await TemplateChangeLog_1.TemplateChangeLog.find({
            templateAssignmentId: { $in: assignmentIds },
            teacherId,
        }).sort({ timestamp: -1 }).lean();
        // Enrich with template and student data
        const enrichedChanges = await Promise.all(changes.map(async (change) => {
            const templateAssignment = templateAssignments.find(a => String(a._id) === change.templateAssignmentId);
            if (!templateAssignment)
                return change;
            const template = await GradebookTemplate_1.GradebookTemplate.findById(templateAssignment.templateId).lean();
            const student = await Student_1.Student.findById(templateAssignment.studentId).lean();
            return {
                ...change,
                templateName: template?.name,
                studentName: student ? `${student.firstName} ${student.lastName}` : undefined,
            };
        }));
        res.json(enrichedChanges);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Get pending signatures (templates awaiting signature)
exports.subAdminTemplatesRouter.get('/pending-signatures', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        // Get teachers assigned to this sub-admin
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        // Get template assignments for these teachers that are completed but not signed
        const templateAssignments = await TemplateAssignment_1.TemplateAssignment.find({
            assignedTeachers: { $in: teacherIds },
            status: { $in: ['in_progress', 'completed'] },
        }).lean();
        // Filter out those already signed
        const assignmentIds = templateAssignments.map(a => String(a._id));
        const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } }).lean();
        const signedIds = new Set(signatures.map(s => s.templateAssignmentId));
        const pending = templateAssignments.filter(a => !signedIds.has(String(a._id)));
        // Enrich with template and student data
        const enrichedPending = await Promise.all(pending.map(async (assignment) => {
            const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
            const student = await Student_1.Student.findById(assignment.studentId).lean();
            return {
                ...assignment,
                template,
                student,
            };
        }));
        res.json(enrichedPending);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Sign a template
exports.subAdminTemplatesRouter.post('/templates/:templateAssignmentId/sign', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        // Get the template assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify the assigned teachers are supervised by this sub-admin
        const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: assignment.assignedTeachers },
        }).lean();
        if (subAdminAssignments.length === 0) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Check if already signed
        const existing = await TemplateSignature_1.TemplateSignature.findOne({ templateAssignmentId }).lean();
        if (existing) {
            return res.status(400).json({ error: 'already_signed' });
        }
        // Create signature
        const signature = await TemplateSignature_1.TemplateSignature.create({
            templateAssignmentId,
            subAdminId,
            signedAt: new Date(),
            status: 'signed',
        });
        // Update assignment status
        await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'signed' });
        // Log audit
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        await (0, auditLogger_1.logAudit)({
            userId: subAdminId,
            action: 'SIGN_TEMPLATE',
            details: {
                templateId: assignment.templateId,
                templateName: template?.name,
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            },
            req,
        });
        res.json(signature);
    }
    catch (e) {
        res.status(500).json({ error: 'sign_failed', message: e.message });
    }
});
// Sub-admin: Get template assignment for review
exports.subAdminTemplatesRouter.get('/templates/:templateAssignmentId/review', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        // Get the template assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify the assigned teachers are supervised by this sub-admin
        const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: assignment.assignedTeachers },
        }).lean();
        if (subAdminAssignments.length === 0) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Get template, student, and change history
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        const changes = await TemplateChangeLog_1.TemplateChangeLog.find({ templateAssignmentId }).sort({ timestamp: -1 }).lean();
        const signature = await TemplateSignature_1.TemplateSignature.findOne({ templateAssignmentId }).lean();
        res.json({
            assignment,
            template,
            student,
            changes,
            signature,
        });
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Sub-admin: Mark assignment as done
exports.subAdminTemplatesRouter.post('/templates/:assignmentId/mark-done', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { assignmentId } = req.params;
        // Get assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify the assigned teachers are supervised by this sub-admin
        const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: assignment.assignedTeachers },
        }).lean();
        if (subAdminAssignments.length === 0) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Update assignment
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, {
            isCompleted: true,
            completedAt: new Date(),
            completedBy: subAdminId,
        }, { new: true });
        // Log audit
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        await (0, auditLogger_1.logAudit)({
            userId: subAdminId,
            action: 'MARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
                templateId: assignment.templateId,
                templateName: template?.name,
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            },
            req,
        });
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
// Sub-admin: Unmark assignment as done
exports.subAdminTemplatesRouter.post('/templates/:assignmentId/unmark-done', (0, auth_1.requireAuth)(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        const { assignmentId } = req.params;
        // Get assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        // Verify the assigned teachers are supervised by this sub-admin
        const subAdminAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: assignment.assignedTeachers },
        }).lean();
        if (subAdminAssignments.length === 0) {
            return res.status(403).json({ error: 'not_authorized' });
        }
        // Update assignment
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignmentId, {
            isCompleted: false,
            completedAt: null,
            completedBy: null,
        }, { new: true });
        // Log audit
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        await (0, auditLogger_1.logAudit)({
            userId: subAdminId,
            action: 'UNMARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
                templateId: assignment.templateId,
                templateName: template?.name,
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            },
            req,
        });
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
