"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.templateAssignmentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const Student_1 = require("../models/Student");
const User_1 = require("../models/User");
exports.templateAssignmentsRouter = (0, express_1.Router)();
// Admin: Assign template to student with teachers
exports.templateAssignmentsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { templateId, studentId, assignedTeachers } = req.body;
        if (!templateId || !studentId)
            return res.status(400).json({ error: 'missing_payload' });
        // Verify template exists
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template)
            return res.status(404).json({ error: 'template_not_found' });
        // Verify student exists
        const student = await Student_1.Student.findById(studentId).lean();
        if (!student)
            return res.status(404).json({ error: 'student_not_found' });
        // Verify all assigned teachers exist and have TEACHER role
        if (assignedTeachers && Array.isArray(assignedTeachers)) {
            for (const teacherId of assignedTeachers) {
                const teacher = await User_1.User.findById(teacherId).lean();
                if (!teacher || teacher.role !== 'TEACHER') {
                    return res.status(400).json({ error: 'invalid_teacher', teacherId });
                }
            }
        }
        // Create or update assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findOneAndUpdate({ templateId, studentId }, {
            templateId,
            templateVersion: template.currentVersion || 1,
            studentId,
            assignedTeachers: assignedTeachers || [],
            assignedBy: req.user.userId,
            assignedAt: new Date(),
            status: 'draft',
        }, { upsert: true, new: true });
        res.json(assignment);
    }
    catch (e) {
        res.status(500).json({ error: 'create_failed', message: e.message });
    }
});
// Get templates for a student
exports.templateAssignmentsRouter.get('/student/:studentId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { studentId } = req.params;
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ studentId }).lean();
        // Fetch template details
        const templateIds = assignments.map(a => a.templateId);
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).lean();
        // Combine assignment data with template data
        const result = assignments.map(assignment => {
            const template = templates.find(t => String(t._id) === assignment.templateId);
            return {
                ...assignment,
                template,
            };
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Get all template assignments for a teacher
exports.templateAssignmentsRouter.get('/teacher/:teacherId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { teacherId } = req.params;
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ assignedTeachers: teacherId }).lean();
        // Fetch template and student details
        const templateIds = assignments.map(a => a.templateId);
        const studentIds = assignments.map(a => a.studentId);
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).lean();
        const students = await Student_1.Student.find({ _id: { $in: studentIds } }).lean();
        // Combine data
        const result = assignments.map(assignment => {
            const template = templates.find(t => String(t._id) === assignment.templateId);
            const student = students.find(s => String(s._id) === assignment.studentId);
            return {
                ...assignment,
                template,
                student,
            };
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Update assignment status
exports.templateAssignmentsRouter.patch('/:id/status', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['draft', 'in_progress', 'completed', 'signed'].includes(status)) {
            return res.status(400).json({ error: 'invalid_status' });
        }
        const assignment = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(id, { status }, { new: true });
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        res.json(assignment);
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
// Admin: Delete assignment
exports.templateAssignmentsRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        await TemplateAssignment_1.TemplateAssignment.findByIdAndDelete(id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'delete_failed', message: e.message });
    }
});
// Admin: Get all assignments
exports.templateAssignmentsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({}).lean();
        res.json(assignments);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
