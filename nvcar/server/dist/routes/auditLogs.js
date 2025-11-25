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
        const { userId, action, startDate, endDate, limit = '100', skip = '0' } = req.query;
        // Build query
        const query = {};
        if (userId)
            query.userId = userId;
        if (action)
            query.action = action;
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate)
                query.timestamp.$gte = new Date(startDate);
            if (endDate)
                query.timestamp.$lte = new Date(endDate);
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
        const actionCounts = await AuditLog_1.AuditLog.aggregate([
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        res.json({
            totalLogs,
            recentLogs,
            actionCounts,
        });
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
