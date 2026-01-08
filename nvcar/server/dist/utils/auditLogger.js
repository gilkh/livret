"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditFromReq = exports.logAudit = void 0;
const AuditLog_1 = require("../models/AuditLog");
const User_1 = require("../models/User");
const logAudit = async ({ userId, action, details, req }) => {
    try {
        // Try to get user info from regular User model first
        let user = await User_1.User.findById(userId).lean();
        // If not found, try OutlookUser model (for Microsoft OAuth users)
        if (!user) {
            const { OutlookUser } = await Promise.resolve().then(() => __importStar(require('../models/OutlookUser')));
            const outlookUser = await OutlookUser.findById(userId).lean();
            if (outlookUser) {
                user = {
                    _id: outlookUser._id,
                    email: outlookUser.email,
                    displayName: outlookUser.displayName || outlookUser.email,
                    role: outlookUser.role,
                    passwordHash: '', // Not needed for logging
                    createdAt: outlookUser.createdAt
                };
            }
        }
        if (!user) {
            console.warn(`Audit log: User ${userId} not found`);
            return;
        }
        // Extract IP address from request if available
        const ipAddress = req?.ip ||
            req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
            req?.connection?.remoteAddress ||
            req?.socket?.remoteAddress ||
            'unknown';
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
// Helper to log with admin info directly (for cases where we have the admin info in req.user)
const logAuditFromReq = async (req, action, details) => {
    const user = req.user;
    if (!user) {
        console.warn('Audit log: No user in request');
        return;
    }
    await (0, exports.logAudit)({
        userId: user.userId,
        action,
        details,
        req
    });
};
exports.logAuditFromReq = logAuditFromReq;
