import { AuditLog } from '../models/AuditLog'
import { User } from '../models/User'

type AuditAction = 'LOGIN' | 'LOGOUT' | 'EDIT_TEMPLATE' | 'SIGN_TEMPLATE' | 'UNSIGN_TEMPLATE' | 'EXPORT_PDF' | 'CREATE_ASSIGNMENT' | 'DELETE_ASSIGNMENT' | 'MARK_ASSIGNMENT_DONE' | 'UNMARK_ASSIGNMENT_DONE' | 'START_IMPERSONATION' | 'STOP_IMPERSONATION' | 'UPLOAD_SIGNATURE' | 'DELETE_SIGNATURE' | 'PROMOTE_STUDENT' | 'UPDATE_TEMPLATE_DATA' | 'LOGIN_MICROSOFT' | 'CREATE_OUTLOOK_USER' | 'UPDATE_OUTLOOK_USER' | 'DELETE_OUTLOOK_USER'

interface LogParams {
    userId: string
    action: AuditAction
    details?: any
    req?: any
}

export const logAudit = async ({ userId, action, details, req }: LogParams) => {
    try {
        // Try to get user info from regular User model first
        let user = await User.findById(userId).lean()
        
        // If not found, try OutlookUser model (for Microsoft OAuth users)
        if (!user) {
            const { OutlookUser } = await import('../models/OutlookUser')
            const outlookUser = await OutlookUser.findById(userId).lean()
            if (outlookUser) {
                user = {
                    _id: outlookUser._id,
                    email: outlookUser.email,
                    displayName: outlookUser.displayName || outlookUser.email,
                    role: outlookUser.role,
                    passwordHash: '', // Not needed for logging
                    createdAt: outlookUser.createdAt
                } as any
            }
        }
        
        if (!user) {
            console.warn(`Audit log: User ${userId} not found`)
            return
        }

        // Extract IP address from request if available
        const ipAddress = req?.ip || req?.connection?.remoteAddress || req?.socket?.remoteAddress || 'unknown'

        await AuditLog.create({
            userId,
            userName: user.displayName || user.email,
            userRole: user.role,
            action,
            details: details || {},
            timestamp: new Date(),
            ipAddress,
        })
    } catch (e) {
        console.error('Failed to create audit log:', e)
    }
}
