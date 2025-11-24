import { Router } from 'express'
import { requireAuth } from '../auth'
import { AuditLog } from '../models/AuditLog'

export const auditLogsRouter = Router()

// Admin: Get audit logs with filtering
auditLogsRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { userId, action, startDate, endDate, limit = '100', skip = '0' } = req.query

        // Build query
        const query: any = {}
        if (userId) query.userId = userId
        if (action) query.action = action
        if (startDate || endDate) {
            query.timestamp = {}
            if (startDate) query.timestamp.$gte = new Date(startDate as string)
            if (endDate) query.timestamp.$lte = new Date(endDate as string)
        }

        // Execute query with pagination
        const logs = await AuditLog.find(query)
            .sort({ timestamp: -1 })
            .limit(Number(limit))
            .skip(Number(skip))
            .lean()

        // Get total count for pagination
        const total = await AuditLog.countDocuments(query)

        res.json({
            logs,
            total,
            limit: Number(limit),
            skip: Number(skip),
        })
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Admin: Get audit log statistics
auditLogsRouter.get('/stats', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const totalLogs = await AuditLog.countDocuments()
        const recentLogs = await AuditLog.countDocuments({
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })

        const actionCounts = await AuditLog.aggregate([
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ])

        res.json({
            totalLogs,
            recentLogs,
            actionCounts,
        })
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})
