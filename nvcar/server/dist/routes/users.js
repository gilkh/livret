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
exports.usersRouter = (0, express_1.Router)();
exports.usersRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const [users, outlookUsers] = await Promise.all([
        User_1.User.find({}).lean(),
        OutlookUser_1.OutlookUser.find({}).lean()
    ]);
    // Merge and normalize
    const allUsers = [
        ...users,
        ...outlookUsers.map(u => ({
            ...u,
            _id: u._id,
            email: u.email,
            displayName: u.displayName || u.email,
            role: u.role,
            isOutlook: true
        }))
    ];
    res.json(allUsers);
});
exports.usersRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { email, password, role, displayName } = req.body;
    if (!email || !password || !role)
        return res.status(400).json({ error: 'missing_payload' });
    const exists = await User_1.User.findOne({ email });
    if (exists)
        return res.status(409).json({ error: 'email_exists' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User_1.User.create({ email, passwordHash, role, displayName: displayName || email });
    res.json(user);
});
exports.usersRouter.patch('/:id/password', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    if (!password)
        return res.status(400).json({ error: 'missing_password' });
    const user = await User_1.User.findById(id);
    if (!user)
        return res.status(404).json({ error: 'not_found' });
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();
    res.json({ ok: true });
});
exports.usersRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    const { displayName } = req.body;
    const user = await User_1.User.findById(id);
    if (!user)
        return res.status(404).json({ error: 'not_found' });
    if (displayName !== undefined)
        user.displayName = displayName;
    await user.save();
    res.json(user);
});
exports.usersRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    const user = await User_1.User.findByIdAndDelete(id);
    if (!user)
        return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
});
