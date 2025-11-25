"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subAdminAssignmentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const SubAdminAssignment_1 = require("../models/SubAdminAssignment");
const User_1 = require("../models/User");
exports.subAdminAssignmentsRouter = (0, express_1.Router)();
// Admin: Assign teachers to sub-admin
exports.subAdminAssignmentsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { subAdminId, teacherId } = req.body;
        if (!subAdminId || !teacherId)
            return res.status(400).json({ error: 'missing_payload' });
        // Verify sub-admin exists and has SUBADMIN role
        const subAdmin = await User_1.User.findById(subAdminId).lean();
        if (!subAdmin || subAdmin.role !== 'SUBADMIN') {
            return res.status(400).json({ error: 'invalid_subadmin' });
        }
        // Verify teacher exists and has TEACHER role
        const teacher = await User_1.User.findById(teacherId).lean();
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
        const teachers = await User_1.User.find({ _id: { $in: teacherIds } }).lean();
        res.json(teachers);
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
        res.json(assignments);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
