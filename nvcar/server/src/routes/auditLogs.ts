import { Router } from 'express'
import { requireAuth } from '../auth'
import { AuditLog } from '../models/AuditLog'

export const auditLogsRouter = Router()

// Admin: Get audit logs with filtering
auditLogsRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { userId, action, userRole, startDate, endDate, limit = '100', skip = '0' } = req.query

        // Build query
        const query: any = {}
        if (userId) {
            // Allow searching by userId or userName (partial match)
            query.$or = [
                { userId: userId as string },
                { userName: { $regex: userId as string, $options: 'i' } }
            ]
        }
        if (action) query.action = action
        if (userRole) query.userRole = userRole
        if (startDate || endDate) {
            query.timestamp = {}
            if (startDate) query.timestamp.$gte = new Date(startDate as string)
            if (endDate) {
                // Set end date to end of day
                const end = new Date(endDate as string)
                end.setHours(23, 59, 59, 999)
                query.timestamp.$lte = end
            }
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

        // Action counts
        const actionCounts = await AuditLog.aggregate([
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ])

        // Role counts - for the role-based tabs
        const roleCounts = await AuditLog.aggregate([
            { $group: { _id: '$userRole', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ])

        // Recent activity by role (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const recentByRole = await AuditLog.aggregate([
            { $match: { timestamp: { $gte: sevenDaysAgo } } },
            { $group: { _id: '$userRole', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ])

        // Daily activity trend (last 7 days)
        const dailyActivity = await AuditLog.aggregate([
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
        ])

        // Top users by activity (last 7 days)
        const topUsers = await AuditLog.aggregate([
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
        ])

        res.json({
            totalLogs,
            recentLogs,
            actionCounts,
            roleCounts,
            recentByRole,
            dailyActivity,
            topUsers,
        })
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})
