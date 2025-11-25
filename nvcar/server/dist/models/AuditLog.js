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
        enum: ['LOGIN', 'LOGOUT', 'EDIT_TEMPLATE', 'SIGN_TEMPLATE', 'EXPORT_PDF', 'CREATE_ASSIGNMENT', 'DELETE_ASSIGNMENT'],
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
exports.AuditLog = (0, mongoose_1.model)('AuditLog', auditLogSchema);
