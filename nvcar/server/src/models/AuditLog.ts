import { Schema, model } from 'mongoose'

const auditLogSchema = new Schema({
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userRole: { type: String, enum: ['ADMIN', 'SUBADMIN', 'TEACHER'], required: true },
    action: {
        type: String,
        enum: ['LOGIN', 'LOGOUT', 'EDIT_TEMPLATE', 'SIGN_TEMPLATE', 'UNSIGN_TEMPLATE', 'EXPORT_PDF', 'CREATE_ASSIGNMENT', 'DELETE_ASSIGNMENT', 'START_IMPERSONATION', 'STOP_IMPERSONATION', 'UPLOAD_SIGNATURE', 'DELETE_SIGNATURE', 'PROMOTE_STUDENT', 'UPDATE_TEMPLATE_DATA', 'LOGIN_MICROSOFT', 'CREATE_OUTLOOK_USER', 'UPDATE_OUTLOOK_USER', 'DELETE_OUTLOOK_USER', 'MARK_ASSIGNMENT_DONE', 'UNMARK_ASSIGNMENT_DONE'],
        required: true
    },
    details: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: () => new Date() },
    ipAddress: { type: String },
})

// Create indexes for efficient querying
auditLogSchema.index({ timestamp: -1 })
auditLogSchema.index({ userId: 1, timestamp: -1 })
auditLogSchema.index({ action: 1, timestamp: -1 })

export const AuditLog = model('AuditLog', auditLogSchema)
