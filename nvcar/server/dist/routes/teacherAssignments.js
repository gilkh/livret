"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherAssignmentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const Class_1 = require("../models/Class");
const User_1 = require("../models/User");
exports.teacherAssignmentsRouter = (0, express_1.Router)();
// Admin: Assign teacher to class
exports.teacherAssignmentsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { teacherId, classId } = req.body;
        if (!teacherId || !classId)
            return res.status(400).json({ error: 'missing_payload' });
        // Verify teacher exists and has TEACHER role
        const teacher = await User_1.User.findById(teacherId).lean();
        if (!teacher || teacher.role !== 'TEACHER') {
            return res.status(400).json({ error: 'invalid_teacher' });
        }
        // Verify class exists and get school year
        const classDoc = await Class_1.ClassModel.findById(classId).lean();
        if (!classDoc)
            return res.status(404).json({ error: 'class_not_found' });
        // Create or update assignment
        const assignment = await TeacherClassAssignment_1.TeacherClassAssignment.findOneAndUpdate({ teacherId, classId }, {
            teacherId,
            classId,
            schoolYearId: classDoc.schoolYearId,
            assignedBy: req.user.userId,
            assignedAt: new Date(),
        }, { upsert: true, new: true });
        res.json(assignment);
    }
    catch (e) {
        res.status(500).json({ error: 'create_failed', message: e.message });
    }
});
// Admin/SubAdmin: Get classes for a teacher
exports.teacherAssignmentsRouter.get('/teacher/:teacherId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const { teacherId } = req.params;
        const assignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ teacherId }).lean();
        const classIds = assignments.map(a => a.classId);
        const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
        res.json(classes);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Admin: Delete assignment
exports.teacherAssignmentsRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        await TeacherClassAssignment_1.TeacherClassAssignment.findByIdAndDelete(id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'delete_failed', message: e.message });
    }
});
// Admin: Get all assignments
exports.teacherAssignmentsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const assignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({}).lean();
        res.json(assignments);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
