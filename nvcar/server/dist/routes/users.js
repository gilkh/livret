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
exports.usersRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const User_1 = require("../models/User");
const OutlookUser_1 = require("../models/OutlookUser");
const bcrypt = __importStar(require("bcryptjs"));
const auditLogger_1 = require("../utils/auditLogger");
exports.usersRouter = (0, express_1.Router)();
// Get all active users (default) or include deleted with query param
exports.usersRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { includeDeleted } = req.query;
    // Build query based on whether to include deleted users
    const userQuery = includeDeleted === 'true'
        ? {}
        : { $or: [{ status: 'active' }, { status: { $exists: false } }] };
    const [users, outlookUsers] = await Promise.all([
        User_1.User.find(userQuery).lean(),
        OutlookUser_1.OutlookUser.find({}).lean()
    ]);
    const normalizedUsers = users.map(u => {
        const raw = u;
        const { passwordHash: _passwordHash, ...safe } = raw;
        const inferredProvider = raw.authProvider || (raw.passwordHash === 'oauth-managed' ? 'microsoft' : 'local');
        return {
            ...safe,
            status: raw.status || 'active',
            authProvider: inferredProvider,
            isOutlook: false,
        };
    });
    const normalizedOutlookUsers = outlookUsers.map(u => ({
        ...u,
        _id: u._id,
        email: u.email,
        displayName: u.displayName || u.email,
        role: u.role,
        isOutlook: true,
        authProvider: 'microsoft',
        status: 'active'
    }));
    // Merge and normalize
    const allUsers = [...normalizedUsers, ...normalizedOutlookUsers];
    res.json(allUsers);
});
// Get only deleted users (for admin restore functionality)
exports.usersRouter.get('/deleted', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const users = await User_1.User.find({ status: 'deleted' }).lean();
    res.json(users);
});
exports.usersRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { email, password, role, displayName } = req.body;
    const adminId = req.user?.userId;
    if (!email || !password || !role)
        return res.status(400).json({ error: 'missing_payload' });
    // Check if email exists (including deleted users)
    const exists = await User_1.User.findOne({ email });
    if (exists) {
        // If user was deleted, offer to reactivate
        if (exists.status === 'deleted') {
            return res.status(409).json({
                error: 'email_exists_deleted',
                message: 'A deleted user with this email exists. Reactivate instead?',
                userId: exists._id
            });
        }
        return res.status(409).json({ error: 'email_exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User_1.User.create({
        email,
        passwordHash,
        role,
        displayName: displayName || email,
        status: 'active'
    });
    // Log the user creation
    await (0, auditLogger_1.logAudit)({
        userId: adminId,
        action: 'CREATE_USER',
        details: {
            createdUserId: String(user._id),
            email: user.email,
            role: user.role,
            displayName: user.displayName
        },
        req
    });
    res.json(user);
});
exports.usersRouter.patch('/:id/password', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    const adminId = req.user?.userId;
    if (!password)
        return res.status(400).json({ error: 'missing_password' });
    const user = await User_1.User.findById(id);
    if (!user)
        return res.status(404).json({ error: 'not_found' });
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();
    // Log password reset
    await (0, auditLogger_1.logAudit)({
        userId: adminId,
        action: 'RESET_PASSWORD',
        details: {
            targetUserId: id,
            targetUserEmail: user.email
        },
        req
    });
    res.json({ ok: true });
});
exports.usersRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    const { displayName, status } = req.body;
    const adminId = req.user?.userId;
    const user = await User_1.User.findById(id);
    if (!user)
        return res.status(404).json({ error: 'not_found' });
    const changes = {};
    if (displayName !== undefined) {
        changes.displayName = { from: user.displayName, to: displayName };
        user.displayName = displayName;
    }
    if (status !== undefined && ['active', 'inactive'].includes(status)) {
        changes.status = { from: user.status, to: status };
        user.status = status;
    }
    await user.save();
    // Log user update
    await (0, auditLogger_1.logAudit)({
        userId: adminId,
        action: 'UPDATE_USER',
        details: {
            targetUserId: id,
            targetUserEmail: user.email,
            changes
        },
        req
    });
    res.json(user);
});
// Soft-delete: Mark user as deleted instead of removing
exports.usersRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    const adminId = req.user?.userId;
    const user = await User_1.User.findById(id);
    if (!user)
        return res.status(404).json({ error: 'not_found' });
    user.status = 'deleted';
    user.deletedAt = new Date();
    user.deletedBy = adminId;
    await user.save();
    // Log deletion
    await (0, auditLogger_1.logAudit)({
        userId: adminId,
        action: 'DELETE_USER',
        details: {
            deletedUserId: id,
            deletedUserEmail: user.email,
            deletedUserRole: user.role,
            softDelete: true
        },
        req
    });
    res.json({ ok: true, softDeleted: true });
});
// Reactivate a deleted user
exports.usersRouter.post('/:id/reactivate', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    const adminId = req.user?.userId;
    const user = await User_1.User.findById(id);
    if (!user)
        return res.status(404).json({ error: 'not_found' });
    if (user.status !== 'deleted') {
        return res.status(400).json({ error: 'user_not_deleted', message: 'User is not deleted' });
    }
    // Reactivate
    ;
    user.status = 'active';
    user.deletedAt = null;
    user.deletedBy = null;
    await user.save();
    // Log reactivation
    await (0, auditLogger_1.logAudit)({
        userId: adminId,
        action: 'REACTIVATE_USER',
        details: {
            reactivatedUserId: id,
            reactivatedUserEmail: user.email,
            reactivatedUserRole: user.role
        },
        req
    });
    res.json({ ok: true, user });
});
// Hard delete (permanent) - requires extra confirmation
exports.usersRouter.delete('/:id/permanent', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    const { confirm } = req.body;
    const adminId = req.user?.userId;
    if (confirm !== 'PERMANENTLY_DELETE') {
        return res.status(400).json({
            error: 'confirmation_required',
            message: 'Set confirm: "PERMANENTLY_DELETE" to proceed'
        });
    }
    const user = await User_1.User.findById(id);
    if (!user)
        return res.status(404).json({ error: 'not_found' });
    // Capture details before deletion
    const userDetails = {
        email: user.email,
        role: user.role,
        displayName: user.displayName
    };
    await User_1.User.findByIdAndDelete(id);
    // Log permanent deletion
    await (0, auditLogger_1.logAudit)({
        userId: adminId,
        action: 'DELETE_USER',
        details: {
            deletedUserId: id,
            deletedUserEmail: userDetails.email,
            deletedUserRole: userDetails.role,
            permanentDelete: true
        },
        req
    });
    res.json({ ok: true, permanentlyDeleted: true });
});
