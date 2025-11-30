"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subAdminAssignmentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const SubAdminAssignment_1 = require("../models/SubAdminAssignment");
const User_1 = require("../models/User");
const OutlookUser_1 = require("../models/OutlookUser");
const Class_1 = require("../models/Class");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const RoleScope_1 = require("../models/RoleScope");
exports.subAdminAssignmentsRouter = (0, express_1.Router)();
// Admin: Assign sub-admin to all teachers in a level
exports.subAdminAssignmentsRouter.post('/bulk-level', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { subAdminId, level } = req.body;
        if (!subAdminId || !level)
            return res.status(400).json({ error: 'missing_payload' });
        // Verify sub-admin exists
        let subAdmin = await User_1.User.findById(subAdminId).lean();
        if (!subAdmin) {
            subAdmin = await OutlookUser_1.OutlookUser.findById(subAdminId).lean();
        }
        if (!subAdmin || subAdmin.role !== 'SUBADMIN') {
            return res.status(400).json({ error: 'invalid_subadmin' });
        }
        // Find all classes in this level
        const classes = await Class_1.ClassModel.find({ level }).lean();
        const classIds = classes.map(c => String(c._id));
        if (classIds.length === 0) {
            return res.json({ count: 0, message: 'No classes found for this level' });
        }
        // Find all teachers assigned to these classes
        const teacherAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: { $in: classIds } }).lean();
        const teacherIds = [...new Set(teacherAssignments.map(ta => ta.teacherId))];
        if (teacherIds.length === 0) {
            return res.json({ count: 0, message: 'No teachers found for this level' });
        }
        // Create assignments
        let count = 0;
        for (const teacherId of teacherIds) {
            await SubAdminAssignment_1.SubAdminAssignment.findOneAndUpdate({ subAdminId, teacherId }, {
                subAdminId,
                teacherId,
                assignedBy: req.user.userId,
                assignedAt: new Date(),
            }, { upsert: true });
            count++;
        }
        // Also update RoleScope to persist the level assignment
        await RoleScope_1.RoleScope.findOneAndUpdate({ userId: subAdminId }, { $addToSet: { levels: level } }, { upsert: true, new: true });
        res.json({ count, message: `Assigned ${count} teachers to sub-admin` });
    }
    catch (e) {
        res.status(500).json({ error: 'bulk_assign_failed', message: e.message });
    }
});
// Admin: Assign teachers to sub-admin
exports.subAdminAssignmentsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { subAdminId, teacherId } = req.body;
        if (!subAdminId || !teacherId)
            return res.status(400).json({ error: 'missing_payload' });
        // Verify sub-admin exists and has SUBADMIN role
        let subAdmin = await User_1.User.findById(subAdminId).lean();
        if (!subAdmin) {
            subAdmin = await OutlookUser_1.OutlookUser.findById(subAdminId).lean();
        }
        if (!subAdmin || subAdmin.role !== 'SUBADMIN') {
            return res.status(400).json({ error: 'invalid_subadmin' });
        }
        // Verify teacher exists and has TEACHER role
        let teacher = await User_1.User.findById(teacherId).lean();
        if (!teacher) {
            teacher = await OutlookUser_1.OutlookUser.findById(teacherId).lean();
        }
        if (!teacher || teacher.role !== 'TEACHER') {
            return res.status(400).json({ error: 'invalid_teacher' });
        }
        // Create or update assignment
        const assignment = await SubAdminAssignment_1.SubAdminAssignment.findOneAndUpdate({ subAdminId, teacherId }, {
            subAdminId,
            teacherId,
            assignedBy: req.user.userId,
            assignedAt: new Date(),
        }, { upsert: true, new: true });
        res.json(assignment);
    }
    catch (e) {
        res.status(500).json({ error: 'create_failed', message: e.message });
    }
});
// Get teachers for a sub-admin
exports.subAdminAssignmentsRouter.get('/subadmin/:subAdminId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const { subAdminId } = req.params;
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        const [teachers, outlookTeachers] = await Promise.all([
            User_1.User.find({ _id: { $in: teacherIds } }).lean(),
            OutlookUser_1.OutlookUser.find({ _id: { $in: teacherIds } }).lean()
        ]);
        const allTeachers = [...teachers, ...outlookTeachers];
        res.json(allTeachers);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Admin: Delete assignment
exports.subAdminAssignmentsRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        await SubAdminAssignment_1.SubAdminAssignment.findByIdAndDelete(id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'delete_failed', message: e.message });
    }
});
// Admin: Get all assignments
exports.subAdminAssignmentsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({}).lean();
        const subAdminIds = assignments.map(a => a.subAdminId);
        const teacherIds = assignments.map(a => a.teacherId);
        const allUserIds = [...new Set([...subAdminIds, ...teacherIds])];
        const [users, outlookUsers] = await Promise.all([
            User_1.User.find({ _id: { $in: allUserIds } }).lean(),
            OutlookUser_1.OutlookUser.find({ _id: { $in: allUserIds } }).lean()
        ]);
        const allUsers = [...users, ...outlookUsers];
        const result = assignments.map(a => {
            const subAdmin = allUsers.find(u => String(u._id) === a.subAdminId);
            const teacher = allUsers.find(u => String(u._id) === a.teacherId);
            return {
                ...a,
                subAdminName: subAdmin ? (subAdmin.displayName || subAdmin.email) : 'Unknown',
                teacherName: teacher ? (teacher.displayName || teacher.email) : 'Unknown'
            };
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
