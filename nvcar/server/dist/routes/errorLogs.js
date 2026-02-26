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
exports.errorLogsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const ErrorLog_1 = require("../models/ErrorLog");
const User_1 = require("../models/User");
exports.errorLogsRouter = (0, express_1.Router)();
exports.errorLogsRouter.post('/', (0, auth_1.requireAuth)(), async (req, res) => {
    try {
        const { message, status, url, method, stack, details, source } = req.body || {};
        if (!message)
            return res.status(400).json({ error: 'missing_message' });
        const userInfo = req.user || {};
        const userId = String(userInfo.userId || '');
        const role = String(userInfo.role || '');
        let displayName;
        let email;
        if (userId) {
            const user = await User_1.User.findById(userId).lean();
            if (user) {
                displayName = user.displayName;
                email = user.email;
            }
            else {
                try {
                    const { OutlookUser } = await Promise.resolve().then(() => __importStar(require('../models/OutlookUser')));
                    const outlookUser = await OutlookUser.findById(userId).lean();
                    if (outlookUser) {
                        displayName = outlookUser.displayName || outlookUser.email;
                        email = outlookUser.email;
                    }
                }
                catch {
                    // ignore lookup errors
                }
            }
        }
        const log = await ErrorLog_1.ErrorLog.create({
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
        });
        res.json({ success: true, logId: log._id });
    }
    catch (err) {
        console.error('Error logging error:', err);
        res.status(500).json({ error: 'log_failed' });
    }
});
exports.errorLogsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const status = String(req.query.status || 'open');
        const limit = Math.min(parseInt(String(req.query.limit || '100')), 500);
        const query = {};
        if (status === 'open')
            query.resolved = false;
        if (status === 'resolved')
            query.resolved = true;
        const logs = await ErrorLog_1.ErrorLog.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        res.json({ logs });
    }
    catch (err) {
        console.error('Error fetching logs:', err);
        res.status(500).json({ error: 'fetch_failed' });
    }
});
exports.errorLogsRouter.patch('/:id/resolve', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const adminUserId = req.user?.actualUserId || req.user?.userId;
        const log = await ErrorLog_1.ErrorLog.findByIdAndUpdate(id, { resolved: true, resolvedAt: new Date(), resolvedBy: adminUserId }, { new: true });
        if (!log)
            return res.status(404).json({ error: 'not_found' });
        res.json({ success: true, log });
    }
    catch (err) {
        console.error('Error resolving log:', err);
        res.status(500).json({ error: 'resolve_failed' });
    }
});
exports.errorLogsRouter.patch('/resolve-all', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const adminUserId = req.user?.actualUserId || req.user?.userId;
        const result = await ErrorLog_1.ErrorLog.updateMany({ resolved: false }, { resolved: true, resolvedAt: new Date(), resolvedBy: adminUserId });
        res.json({ success: true, modified: result.modifiedCount });
    }
    catch (err) {
        console.error('Error resolving all logs:', err);
        res.status(500).json({ error: 'resolve_failed' });
    }
});
exports.errorLogsRouter.delete('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const status = String(req.query.status || 'all');
        const query = {};
        if (status === 'open')
            query.resolved = false;
        if (status === 'resolved')
            query.resolved = true;
        const result = await ErrorLog_1.ErrorLog.deleteMany(query);
        res.json({ success: true, deleted: result.deletedCount || 0 });
    }
    catch (err) {
        console.error('Error deleting logs:', err);
        res.status(500).json({ error: 'delete_failed' });
    }
});
exports.errorLogsRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const log = await ErrorLog_1.ErrorLog.findByIdAndDelete(id);
        if (!log)
            return res.status(404).json({ error: 'not_found' });
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error deleting log:', err);
        res.status(500).json({ error: 'delete_failed' });
    }
});
