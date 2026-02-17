import { AuditLog } from '../models/AuditLog'
import { User } from '../models/User'

type AuditAction =
    // Authentication
    | 'LOGIN'
    | 'LOGOUT'
    | 'LOGIN_MICROSOFT'
    | 'EXTEND_SESSION'
    // Templates
    | 'EDIT_TEMPLATE'
    | 'UPDATE_TEMPLATE_DATA'
    // Signatures
    | 'SIGN_TEMPLATE'
    | 'UNSIGN_TEMPLATE'
    | 'UPLOAD_SIGNATURE'
    | 'DELETE_SIGNATURE'
    // Assignments
    | 'CREATE_ASSIGNMENT'
    | 'DELETE_ASSIGNMENT'
    | 'MARK_ASSIGNMENT_DONE'
    | 'UNMARK_ASSIGNMENT_DONE'
    // Export
    | 'EXPORT_PDF'
    // User Management
    | 'CREATE_OUTLOOK_USER'
    | 'UPDATE_OUTLOOK_USER'
    | 'DELETE_OUTLOOK_USER'
    | 'CREATE_USER'
    | 'UPDATE_USER'
    | 'DELETE_USER'
    | 'REACTIVATE_USER'
    | 'RESET_PASSWORD'
    // Impersonation
    | 'START_IMPERSONATION'
    | 'STOP_IMPERSONATION'
    // Students
    | 'PROMOTE_STUDENT'
    | 'CREATE_STUDENT'
    | 'UPDATE_STUDENT'
    | 'DELETE_STUDENT'
    | 'MARK_STUDENT_LEFT'
    | 'UNDO_STUDENT_LEFT'
    | 'MARK_STUDENT_RETURNED'
    // System
    | 'CREATE_BACKUP'
    | 'RESTORE_BACKUP'
    | 'RESTORE_DRILL'
    | 'EMPTY_DATABASE'
    | 'UPDATE_SCHOOL_YEAR'
    | 'UPDATE_SETTINGS'
    // Classes
    | 'CREATE_CLASS'
    | 'UPDATE_CLASS'
    | 'DELETE_CLASS'
    | 'COMPLETE_CLASS'
    // PS Onboarding
    | 'PS_ONBOARDING_ASSIGN_CLASS'
    | 'PS_ONBOARDING_BATCH_SIGN'
    | 'PS_ONBOARDING_BATCH_UNSIGN'
    | 'PS_ONBOARDING_BATCH_PROMOTE'
    | 'PS_ONBOARDING_BATCH_UNPROMOTE'

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
        const ipAddress = req?.ip ||
            req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
            req?.connection?.remoteAddress ||
            req?.socket?.remoteAddress ||
            'unknown'

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

// Helper to log with admin info directly (for cases where we have the admin info in req.user)
export const logAuditFromReq = async (req: any, action: AuditAction, details?: any) => {
    const user = req.user
    if (!user) {
        console.warn('Audit log: No user in request')
        return
    }

    await logAudit({
        userId: user.userId,
        action,
        details,
        req
    })
}
