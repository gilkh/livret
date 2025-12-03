"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherAssignmentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const Class_1 = require("../models/Class");
const User_1 = require("../models/User");
const OutlookUser_1 = require("../models/OutlookUser");
exports.teacherAssignmentsRouter = (0, express_1.Router)();
// Admin: Assign teacher to class
exports.teacherAssignmentsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { teacherId, classId, languages, isProfPolyvalent } = req.body;
        if (!teacherId || !classId)
            return res.status(400).json({ error: 'missing_payload' });
        // Verify teacher exists and has TEACHER role (check both User and OutlookUser)
        let teacher = await User_1.User.findById(teacherId).lean();
        if (!teacher) {
            teacher = await OutlookUser_1.OutlookUser.findById(teacherId).lean();
        }
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
            languages: languages || [],
            isProfPolyvalent: !!isProfPolyvalent,
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
        const teacherIds = assignments.map(a => a.teacherId);
        const classIds = assignments.map(a => a.classId);
        const [teachers, outlookTeachers, classes] = await Promise.all([
            User_1.User.find({ _id: { $in: teacherIds } }).lean(),
            OutlookUser_1.OutlookUser.find({ _id: { $in: teacherIds } }).lean(),
            Class_1.ClassModel.find({ _id: { $in: classIds } }).lean()
        ]);
        const allTeachers = [...teachers, ...outlookTeachers];
        const result = assignments.map(a => {
            const teacher = allTeachers.find(t => String(t._id) === a.teacherId);
            const classDoc = classes.find(c => String(c._id) === a.classId);
            return {
                ...a,
                teacherName: teacher ? (teacher.displayName || teacher.email) : 'Unknown',
                className: classDoc ? classDoc.name : 'Unknown'
            };
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
