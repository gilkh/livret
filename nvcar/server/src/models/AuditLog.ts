import { Schema, model } from 'mongoose'

const auditLogSchema = new Schema({
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userRole: { type: String, enum: ['ADMIN', 'SUBADMIN', 'TEACHER'], required: true },
    action: {
        type: String,
        enum: ['LOGIN', 'LOGOUT', 'EDIT_TEMPLATE', 'SIGN_TEMPLATE', 'EXPORT_PDF', 'CREATE_ASSIGNMENT', 'DELETE_ASSIGNMENT'],
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
