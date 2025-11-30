"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.outlookUsersRouter = void 0;
const express_1 = require("express");
const OutlookUser_1 = require("../models/OutlookUser");
const auth_1 = require("../auth");
const auditLogger_1 = require("../utils/auditLogger");
exports.outlookUsersRouter = (0, express_1.Router)();
// Get all Outlook users (Admin only)
exports.outlookUsersRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const users = await OutlookUser_1.OutlookUser.find().sort({ email: 1 });
        res.json(users);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Add a new Outlook user (Admin only)
exports.outlookUsersRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { email, role, displayName } = req.body;
        if (!email || !role) {
            return res.status(400).json({ error: 'Email and role are required' });
        }
        const normalizedEmail = email.trim().toLowerCase();
        // Check if email already exists
        const existing = await OutlookUser_1.OutlookUser.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        const user = await OutlookUser_1.OutlookUser.create({
            email: normalizedEmail,
            role,
            displayName: displayName?.trim() || undefined
        });
        // Log the action
        await (0, auditLogger_1.logAudit)({
            userId: req.user.actualUserId || req.user.userId,
            action: 'CREATE_OUTLOOK_USER',
            details: { email: normalizedEmail, role },
            req
        });
        res.json(user);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Update Outlook user role (Admin only)
exports.outlookUsersRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const { role, displayName } = req.body;
        const user = await OutlookUser_1.OutlookUser.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (role)
            user.role = role;
        if (displayName !== undefined)
            user.displayName = displayName?.trim() || undefined;
        await user.save();
        // Log the action
        await (0, auditLogger_1.logAudit)({
            userId: req.user.actualUserId || req.user.userId,
            action: 'UPDATE_OUTLOOK_USER',
            details: { email: user.email, role },
            req
        });
        res.json(user);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Delete Outlook user (Admin only)
exports.outlookUsersRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = await OutlookUser_1.OutlookUser.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        await OutlookUser_1.OutlookUser.findByIdAndDelete(id);
        // Log the action
        await (0, auditLogger_1.logAudit)({
            userId: req.user.actualUserId || req.user.userId,
            action: 'DELETE_OUTLOOK_USER',
            details: { email: user.email },
            req
        });
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
