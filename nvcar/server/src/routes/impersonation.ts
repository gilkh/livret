import { Router } from 'express'
import { requireAuth, signToken } from '../auth'
import { User } from '../models/User'
import { OutlookUser } from '../models/OutlookUser'
import { logAudit } from '../utils/auditLogger'

export const impersonationRouter = Router()

// Admin: Start impersonating a user (View As)
impersonationRouter.post('/start', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const adminUser = (req as any).user
        const { targetUserId } = req.body

        if (!targetUserId) {
            return res.status(400).json({ error: 'missing_target_user_id' })
        }

        // Get the target user
        let targetUser = await User.findById(targetUserId).lean() as any
        if (!targetUser) {
            targetUser = await OutlookUser.findById(targetUserId).lean()
        }

        if (!targetUser) {
            return res.status(404).json({ error: 'user_not_found' })
        }

        // Don't allow impersonating another admin
        if (targetUser.role === 'ADMIN') {
            return res.status(403).json({ error: 'cannot_impersonate_admin' })
        }

        // Generate a new token with impersonation data
        const token = signToken({
            userId: adminUser.actualUserId || adminUser.userId, // Keep original admin ID
            role: adminUser.actualRole || adminUser.role,       // Keep original admin role
            impersonateUserId: String(targetUser._id),
            impersonateRole: targetUser.role
        })

        // Log the impersonation
        await logAudit({
            userId: adminUser.actualUserId || adminUser.userId,
            action: 'START_IMPERSONATION',
            details: {
                targetUserId: String(targetUser._id),
                targetUserEmail: targetUser.email,
                targetUserRole: targetUser.role,
                targetUserDisplayName: targetUser.displayName
            },
            req
        })

        res.json({
            token,
            impersonatedUser: {
                id: String(targetUser._id),
                email: targetUser.email,
                role: targetUser.role,
                displayName: targetUser.displayName || targetUser.email
            }
        })
    } catch (e: any) {
        res.status(500).json({ error: 'impersonation_failed', message: e.message })
    }
})

// Admin: Stop impersonating (return to admin view)
impersonationRouter.post('/stop', requireAuth(), async (req, res) => {
    try {
        const user = (req as any).user

        if (!user.isImpersonating) {
            return res.status(400).json({ error: 'not_impersonating' })
        }

        // Generate a new token without impersonation
        const token = signToken({
            userId: user.actualUserId,
            role: user.actualRole
        })

        // Log the end of impersonation
        await logAudit({
            userId: user.actualUserId,
            action: 'STOP_IMPERSONATION',
            details: {
                previousImpersonatedUserId: user.userId
            },
            req
        })

        res.json({ token })
    } catch (e: any) {
        res.status(500).json({ error: 'stop_impersonation_failed', message: e.message })
    }
})

// Get current impersonation status
impersonationRouter.get('/status', requireAuth(), async (req, res) => {
    try {
        const user = (req as any).user

        if (!user.isImpersonating) {
            return res.json({ isImpersonating: false })
        }

        // Get impersonated user details
        let impersonatedUser = await User.findById(user.userId).lean() as any
        if (!impersonatedUser) {
            impersonatedUser = await OutlookUser.findById(user.userId).lean()
        }

        const actualAdmin = await User.findById(user.actualUserId).lean()

        res.json({
            isImpersonating: true,
            impersonatedUser: impersonatedUser ? {
                id: String(impersonatedUser._id),
                email: impersonatedUser.email,
                role: impersonatedUser.role,
                displayName: impersonatedUser.displayName || impersonatedUser.email
            } : null,
            actualAdmin: actualAdmin ? {
                id: String(actualAdmin._id),
                email: actualAdmin.email,
                displayName: actualAdmin.displayName
            } : null
        })
    } catch (e: any) {
        res.status(500).json({ error: 'status_check_failed', message: e.message })
    }
})
