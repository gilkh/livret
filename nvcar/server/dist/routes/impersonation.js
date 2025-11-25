"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.impersonationRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const User_1 = require("../models/User");
const auditLogger_1 = require("../utils/auditLogger");
exports.impersonationRouter = (0, express_1.Router)();
// Admin: Start impersonating a user (View As)
exports.impersonationRouter.post('/start', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const adminUser = req.user;
        const { targetUserId } = req.body;
        if (!targetUserId) {
            return res.status(400).json({ error: 'missing_target_user_id' });
        }
        // Get the target user
        const targetUser = await User_1.User.findById(targetUserId).lean();
        if (!targetUser) {
            return res.status(404).json({ error: 'user_not_found' });
        }
        // Don't allow impersonating another admin
        if (targetUser.role === 'ADMIN') {
            return res.status(403).json({ error: 'cannot_impersonate_admin' });
        }
        // Generate a new token with impersonation data
        const token = (0, auth_1.signToken)({
            userId: adminUser.actualUserId || adminUser.userId, // Keep original admin ID
            role: adminUser.actualRole || adminUser.role, // Keep original admin role
            impersonateUserId: String(targetUser._id),
            impersonateRole: targetUser.role
        });
        // Log the impersonation
        await (0, auditLogger_1.logAudit)({
            userId: adminUser.actualUserId || adminUser.userId,
            action: 'START_IMPERSONATION',
            details: {
                targetUserId: String(targetUser._id),
                targetUserEmail: targetUser.email,
                targetUserRole: targetUser.role,
                targetUserDisplayName: targetUser.displayName
            },
            req
        });
        res.json({
            token,
            impersonatedUser: {
                id: String(targetUser._id),
                email: targetUser.email,
                role: targetUser.role,
                displayName: targetUser.displayName
            }
        });
    }
    catch (e) {
        res.status(500).json({ error: 'impersonation_failed', message: e.message });
    }
});
// Admin: Stop impersonating (return to admin view)
exports.impersonationRouter.post('/stop', (0, auth_1.requireAuth)(), async (req, res) => {
    try {
        const user = req.user;
        if (!user.isImpersonating) {
            return res.status(400).json({ error: 'not_impersonating' });
        }
        // Generate a new token without impersonation
        const token = (0, auth_1.signToken)({
            userId: user.actualUserId,
            role: user.actualRole
        });
        // Log the end of impersonation
        await (0, auditLogger_1.logAudit)({
            userId: user.actualUserId,
            action: 'STOP_IMPERSONATION',
            details: {
                previousImpersonatedUserId: user.userId
            },
            req
        });
        res.json({ token });
    }
    catch (e) {
        res.status(500).json({ error: 'stop_impersonation_failed', message: e.message });
    }
});
// Get current impersonation status
exports.impersonationRouter.get('/status', (0, auth_1.requireAuth)(), async (req, res) => {
    try {
        const user = req.user;
        if (!user.isImpersonating) {
            return res.json({ isImpersonating: false });
        }
        // Get impersonated user details
        const impersonatedUser = await User_1.User.findById(user.userId).lean();
        const actualAdmin = await User_1.User.findById(user.actualUserId).lean();
        res.json({
            isImpersonating: true,
            impersonatedUser: impersonatedUser ? {
                id: String(impersonatedUser._id),
                email: impersonatedUser.email,
                role: impersonatedUser.role,
                displayName: impersonatedUser.displayName
            } : null,
            actualAdmin: actualAdmin ? {
                id: String(actualAdmin._id),
                email: actualAdmin.email,
                displayName: actualAdmin.displayName
            } : null
        });
    }
    catch (e) {
        res.status(500).json({ error: 'status_check_failed', message: e.message });
    }
});
