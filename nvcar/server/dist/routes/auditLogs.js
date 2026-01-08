"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const AuditLog_1 = require("../models/AuditLog");
exports.auditLogsRouter = (0, express_1.Router)();
// Admin: Get audit logs with filtering
exports.auditLogsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { userId, action, userRole, startDate, endDate, limit = '100', skip = '0' } = req.query;
        // Build query
        const query = {};
        if (userId) {
            // Allow searching by userId or userName (partial match)
            query.$or = [
                { userId: userId },
                { userName: { $regex: userId, $options: 'i' } }
            ];
        }
        if (action)
            query.action = action;
        if (userRole)
            query.userRole = userRole;
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate)
                query.timestamp.$gte = new Date(startDate);
            if (endDate) {
                // Set end date to end of day
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.timestamp.$lte = end;
            }
        }
        // Execute query with pagination
        const logs = await AuditLog_1.AuditLog.find(query)
            .sort({ timestamp: -1 })
            .limit(Number(limit))
            .skip(Number(skip))
            .lean();
        // Get total count for pagination
        const total = await AuditLog_1.AuditLog.countDocuments(query);
        res.json({
            logs,
            total,
            limit: Number(limit),
            skip: Number(skip),
        });
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Admin: Get audit log statistics
exports.auditLogsRouter.get('/stats', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const totalLogs = await AuditLog_1.AuditLog.countDocuments();
        const recentLogs = await AuditLog_1.AuditLog.countDocuments({
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });
        // Action counts
        const actionCounts = await AuditLog_1.AuditLog.aggregate([
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        // Role counts - for the role-based tabs
        const roleCounts = await AuditLog_1.AuditLog.aggregate([
            { $group: { _id: '$userRole', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        // Recent activity by role (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentByRole = await AuditLog_1.AuditLog.aggregate([
            { $match: { timestamp: { $gte: sevenDaysAgo } } },
            { $group: { _id: '$userRole', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        // Daily activity trend (last 7 days)
        const dailyActivity = await AuditLog_1.AuditLog.aggregate([
            { $match: { timestamp: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        // Top users by activity (last 7 days)
        const topUsers = await AuditLog_1.AuditLog.aggregate([
            { $match: { timestamp: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: '$userId',
                    userName: { $first: '$userName' },
                    userRole: { $first: '$userRole' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        res.json({
            totalLogs,
            recentLogs,
            actionCounts,
            roleCounts,
            recentByRole,
            dailyActivity,
            topUsers,
        });
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
