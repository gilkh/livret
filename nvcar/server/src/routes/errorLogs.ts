import { Router } from 'express'
import { requireAuth } from '../auth'
import { ErrorLog } from '../models/ErrorLog'
import { User } from '../models/User'

export const errorLogsRouter = Router()

errorLogsRouter.post('/', requireAuth(), async (req, res) => {
  try {
    const { message, status, url, method, stack, details, source } = req.body || {}
    if (!message) return res.status(400).json({ error: 'missing_message' })

    const userInfo = (req as any).user || {}
    const userId = String(userInfo.userId || '')
    const role = String(userInfo.role || '')

    let displayName: string | undefined
    let email: string | undefined

    if (userId) {
      const user = await User.findById(userId).lean()
      if (user) {
        displayName = user.displayName
        email = user.email
      } else {
        try {
          const { OutlookUser } = await import('../models/OutlookUser')
          const outlookUser = await OutlookUser.findById(userId).lean()
          if (outlookUser) {
            displayName = outlookUser.displayName || outlookUser.email
            email = outlookUser.email
          }
        } catch {
          // ignore lookup errors
        }
      }
    }

    const log = await ErrorLog.create({
      userId,
      role,
      actualUserId: userInfo.actualUserId,
      actualRole: userInfo.actualRole,
      displayName,
      email,
      message,
      status,
      url,
      method,
      stack,
      details,
      source: source || 'client',
    })

    res.json({ success: true, logId: log._id })
  } catch (err) {
    console.error('Error logging error:', err)
    res.status(500).json({ error: 'log_failed' })
  }
})

errorLogsRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const status = String(req.query.status || 'open')
    const limit = Math.min(parseInt(String(req.query.limit || '100')), 500)

    const query: any = {}
    if (status === 'open') query.resolved = false
    if (status === 'resolved') query.resolved = true

    const logs = await ErrorLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()

    res.json({ logs })
  } catch (err) {
    console.error('Error fetching logs:', err)
    res.status(500).json({ error: 'fetch_failed' })
  }
})

errorLogsRouter.patch('/:id/resolve', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params
    const adminUserId = (req as any).user?.actualUserId || (req as any).user?.userId

    const log = await ErrorLog.findByIdAndUpdate(
      id,
      { resolved: true, resolvedAt: new Date(), resolvedBy: adminUserId },
      { new: true }
    )

    if (!log) return res.status(404).json({ error: 'not_found' })

    res.json({ success: true, log })
  } catch (err) {
    console.error('Error resolving log:', err)
    res.status(500).json({ error: 'resolve_failed' })
  }
})

errorLogsRouter.patch('/resolve-all', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const adminUserId = (req as any).user?.actualUserId || (req as any).user?.userId
    const result = await ErrorLog.updateMany(
      { resolved: false },
      { resolved: true, resolvedAt: new Date(), resolvedBy: adminUserId }
    )

    res.json({ success: true, modified: result.modifiedCount })
  } catch (err) {
    console.error('Error resolving all logs:', err)
    res.status(500).json({ error: 'resolve_failed' })
  }
})
