"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const Class_1 = require("../models/Class");
const Enrollment_1 = require("../models/Enrollment");
const Student_1 = require("../models/Student");
const StudentCompetencyStatus_1 = require("../models/StudentCompetencyStatus");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TemplateSignature_1 = require("../models/TemplateSignature");
const SavedGradebook_1 = require("../models/SavedGradebook");
const auditLogger_1 = require("../utils/auditLogger");
exports.classesRouter = (0, express_1.Router)();
exports.classesRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { schoolYearId } = req.query;
    const list = await Class_1.ClassModel.find(schoolYearId ? { schoolYearId } : {}).lean();
    res.json(list);
});
exports.classesRouter.post('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { name, level, schoolYearId } = req.body;
    if (!name || !schoolYearId)
        return res.status(400).json({ error: 'missing_payload' });
    const c = await Class_1.ClassModel.create({ name, level, schoolYearId });
    res.json(c);
});
exports.classesRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    const c = await Class_1.ClassModel.findByIdAndUpdate(id, req.body, { new: true });
    res.json(c);
});
// Simple delete - just removes the class (kept for backwards compatibility)
exports.classesRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    await Class_1.ClassModel.findByIdAndDelete(id);
    res.json({ ok: true });
});
// Delete class with all enrolled students and their data
exports.classesRouter.delete('/:id/with-students', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    const adminId = req.user.userId;
    try {
        const cls = await Class_1.ClassModel.findById(id).lean();
        if (!cls)
            return res.status(404).json({ error: 'class_not_found' });
        // Find all enrollments for this class
        const enrollments = await Enrollment_1.Enrollment.find({ classId: id }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        const results = {
            studentsDeleted: 0,
            enrollmentsDeleted: 0,
            errors: []
        };
        // Delete all student data for students in this class
        for (const studentId of studentIds) {
            try {
                // Delete competency statuses
                await StudentCompetencyStatus_1.StudentCompetencyStatus.deleteMany({ studentId });
                // Get template assignments to delete related signatures
                const assignments = await TemplateAssignment_1.TemplateAssignment.find({ studentId }).lean();
                const assignmentIds = assignments.map(a => String(a._id));
                await TemplateSignature_1.TemplateSignature.deleteMany({ templateAssignmentId: { $in: assignmentIds } });
                await TemplateAssignment_1.TemplateAssignment.deleteMany({ studentId });
                // Delete saved gradebooks
                await SavedGradebook_1.SavedGradebook.deleteMany({ studentId });
                // Delete the student
                await Student_1.Student.findByIdAndDelete(studentId);
                results.studentsDeleted++;
            }
            catch (e) {
                results.errors.push({ studentId, error: e.message });
            }
        }
        // Delete all enrollments for this class
        const enrollResult = await Enrollment_1.Enrollment.deleteMany({ classId: id });
        results.enrollmentsDeleted = enrollResult.deletedCount || 0;
        // Delete the class itself
        await Class_1.ClassModel.findByIdAndDelete(id);
        await (0, auditLogger_1.logAudit)({
            userId: adminId,
            action: 'DELETE_CLASS',
            details: {
                classId: id,
                className: cls.name,
                level: cls.level,
                studentsDeleted: results.studentsDeleted,
                enrollmentsDeleted: results.enrollmentsDeleted,
                errors: results.errors.length
            },
            req
        });
        res.json(results);
    }
    catch (e) {
        console.error('Delete class with students error:', e);
        res.status(500).json({ error: 'delete_failed', message: e.message });
    }
});
