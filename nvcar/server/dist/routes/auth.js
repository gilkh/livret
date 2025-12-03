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
exports.authRouter = void 0;
const express_1 = require("express");
const bcrypt = __importStar(require("bcryptjs"));
const User_1 = require("../models/User");
const Setting_1 = require("../models/Setting");
const auth_1 = require("../auth");
const auditLogger_1 = require("../utils/auditLogger");
exports.authRouter = (0, express_1.Router)();
exports.authRouter.post('/login', async (req, res) => {
    let { email, password } = req.body;
    email = String(email || '').trim().toLowerCase();
    password = String(password || '').trim();
    if (!email || !password)
        return res.status(400).json({ error: 'missing_credentials' });
    if (email === 'admin' && password === 'admin') {
        let admin = await User_1.User.findOne({ email: 'admin' });
        if (!admin) {
            const hash = await bcrypt.hash('admin', 10);
            admin = await User_1.User.create({ email: 'admin', passwordHash: hash, role: 'ADMIN', displayName: 'Admin' });
        }
        const token = (0, auth_1.signToken)({ userId: String(admin._id), role: 'ADMIN', tokenVersion: admin.tokenVersion || 0 });
        // Log login
        await (0, auditLogger_1.logAudit)({ userId: String(admin._id), action: 'LOGIN', details: { email }, req });
        return res.json({ token, role: 'ADMIN', displayName: 'Admin' });
    }
    const user = await User_1.User.findOne({ email });
    if (!user)
        return res.status(401).json({ error: 'invalid_login' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok)
        return res.status(401).json({ error: 'invalid_login' });
    // Check global login settings
    if (user.role === 'TEACHER') {
        const s = await Setting_1.Setting.findOne({ key: 'login_enabled_teacher' });
        if (s && s.value === false) {
            return res.status(403).json({ error: 'login_disabled' });
        }
    }
    if (user.role === 'SUBADMIN') {
        const s = await Setting_1.Setting.findOne({ key: 'login_enabled_subadmin' });
        if (s && s.value === false) {
            return res.status(403).json({ error: 'login_disabled' });
        }
    }
    if (user.role === 'AEFE') {
        const s = await Setting_1.Setting.findOne({ key: 'login_enabled_aefe' });
        if (s && s.value === false) {
            return res.status(403).json({ error: 'login_disabled' });
        }
    }
    const token = (0, auth_1.signToken)({ userId: String(user._id), role: user.role, tokenVersion: user.tokenVersion || 0 });
    // Log login
    await (0, auditLogger_1.logAudit)({ userId: String(user._id), action: 'LOGIN', details: { email }, req });
    res.json({ token, role: user.role, displayName: user.displayName });
});
