"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = void 0;
const AuditLog_1 = require("../models/AuditLog");
const User_1 = require("../models/User");
const logAudit = async ({ userId, action, details, req }) => {
    try {
        // Get user info
        const user = await User_1.User.findById(userId).lean();
        if (!user) {
            console.warn(`Audit log: User ${userId} not found`);
            return;
        }
        // Extract IP address from request if available
        const ipAddress = req?.ip || req?.connection?.remoteAddress || req?.socket?.remoteAddress || 'unknown';
        await AuditLog_1.AuditLog.create({
            userId,
            userName: user.displayName || user.email,
            userRole: user.role,
            action,
            details: details || {},
            timestamp: new Date(),
            ipAddress,
        });
    }
    catch (e) {
        console.error('Failed to create audit log:', e);
    }
};
exports.logAudit = logAudit;
