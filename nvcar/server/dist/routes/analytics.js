"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRouter = void 0;
const express_1 = require("express");
const User_1 = require("../models/User");
const Class_1 = require("../models/Class");
const Student_1 = require("../models/Student");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const AuditLog_1 = require("../models/AuditLog");
exports.analyticsRouter = (0, express_1.Router)();
exports.analyticsRouter.get('/', async (req, res) => {
    try {
        const [totalUsers, usersByRole, totalClasses, totalStudents, assignmentsByStatus, recentActivity] = await Promise.all([
            User_1.User.countDocuments(),
            User_1.User.aggregate([
                { $group: { _id: '$role', count: { $sum: 1 } } }
            ]),
            Class_1.ClassModel.countDocuments(),
            Student_1.Student.countDocuments(),
            TemplateAssignment_1.TemplateAssignment.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            AuditLog_1.AuditLog.find().sort({ timestamp: -1 }).limit(10)
        ]);
        res.json({
            counts: {
                users: totalUsers,
                classes: totalClasses,
                students: totalStudents,
            },
            distribution: {
                usersByRole: usersByRole.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
                assignmentsByStatus: assignmentsByStatus.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
            },
            recentActivity
        });
    }
    catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});
