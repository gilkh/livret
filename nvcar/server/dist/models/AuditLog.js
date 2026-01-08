"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = void 0;
const mongoose_1 = require("mongoose");
const auditLogSchema = new mongoose_1.Schema({
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userRole: { type: String, enum: ['ADMIN', 'SUBADMIN', 'TEACHER'], required: true },
    action: {
        type: String,
        enum: [
            // Authentication
            'LOGIN',
            'LOGOUT',
            'LOGIN_MICROSOFT',
            // Templates
            'EDIT_TEMPLATE',
            'UPDATE_TEMPLATE_DATA',
            // Signatures
            'SIGN_TEMPLATE',
            'UNSIGN_TEMPLATE',
            'UPLOAD_SIGNATURE',
            'DELETE_SIGNATURE',
            // Assignments
            'CREATE_ASSIGNMENT',
            'DELETE_ASSIGNMENT',
            'MARK_ASSIGNMENT_DONE',
            'UNMARK_ASSIGNMENT_DONE',
            // Export
            'EXPORT_PDF',
            // User Management
            'CREATE_OUTLOOK_USER',
            'UPDATE_OUTLOOK_USER',
            'DELETE_OUTLOOK_USER',
            'CREATE_USER',
            'UPDATE_USER',
            'DELETE_USER',
            'REACTIVATE_USER',
            'RESET_PASSWORD',
            // Impersonation
            'START_IMPERSONATION',
            'STOP_IMPERSONATION',
            // Students
            'PROMOTE_STUDENT',
            'CREATE_STUDENT',
            'UPDATE_STUDENT',
            'DELETE_STUDENT',
            // System
            'CREATE_BACKUP',
            'RESTORE_BACKUP',
            'EMPTY_DATABASE',
            'UPDATE_SCHOOL_YEAR',
            'UPDATE_SETTINGS',
            // Classes
            'CREATE_CLASS',
            'UPDATE_CLASS',
            'DELETE_CLASS',
        ],
        required: true
    },
    details: { type: mongoose_1.Schema.Types.Mixed },
    timestamp: { type: Date, default: () => new Date() },
    ipAddress: { type: String },
});
// Create indexes for efficient querying
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ userRole: 1, timestamp: -1 });
exports.AuditLog = (0, mongoose_1.model)('AuditLog', auditLogSchema);
