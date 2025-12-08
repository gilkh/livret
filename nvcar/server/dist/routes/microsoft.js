"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.microsoftRouter = void 0;
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const OutlookUser_1 = require("../models/OutlookUser");
const User_1 = require("../models/User");
const auth_1 = require("../auth");
const auditLogger_1 = require("../utils/auditLogger");
exports.microsoftRouter = (0, express_1.Router)();
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const DEFAULT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5173';
const ALLOWED_REDIRECT_URIS = [
    DEFAULT_REDIRECT_URI,
    'https://192.168.1.74:5173',
    'https://192.168.17.10:5173',
    'https://localhost:5173'
];
const TENANT = process.env.MICROSOFT_TENANT || 'common'; // 'common' allows any Microsoft account
// Generate authorization URL
exports.microsoftRouter.get('/auth-url', (req, res) => {
    if (!CLIENT_ID) {
        return res.status(500).json({ error: 'Microsoft OAuth not configured' });
    }
    let redirectUri = req.query.redirect_uri;
    if (!redirectUri || !ALLOWED_REDIRECT_URIS.includes(redirectUri)) {
        redirectUri = DEFAULT_REDIRECT_URI;
    }
    const authUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?` +
        `client_id=${CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_mode=query` +
        `&scope=${encodeURIComponent('openid email profile User.Read')}` +
        `&prompt=select_account` +
        `&state=${Math.random().toString(36).substring(7)}`;
    res.json({ authUrl });
});
// Handle OAuth callback
exports.microsoftRouter.post('/callback', async (req, res) => {
    try {
        const { code, redirect_uri } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Authorization code is required' });
        }
        if (!CLIENT_ID || !CLIENT_SECRET) {
            return res.status(500).json({ error: 'Microsoft OAuth not configured' });
        }
        let redirectUri = redirect_uri;
        if (!redirectUri || !ALLOWED_REDIRECT_URIS.includes(redirectUri)) {
            redirectUri = DEFAULT_REDIRECT_URI;
        }
        // Exchange code for token
        const tokenResponse = await axios_1.default.post(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            scope: 'openid email profile User.Read'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const { access_token } = tokenResponse.data;
        // Get user info from Microsoft Graph
        const userResponse = await axios_1.default.get('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const { mail, userPrincipalName, displayName, preferred_username } = userResponse.data;
        const possibleEmails = [mail, userPrincipalName, preferred_username]
            .map((value) => value?.toLowerCase().trim())
            .filter((value) => Boolean(value));
        console.log('Microsoft OAuth - possible emails from Graph:', possibleEmails);
        if (possibleEmails.length === 0) {
            return res.status(400).json({ error: 'Could not retrieve email from Microsoft account' });
        }
        // Check if user is authorized (match any alias)
        // We check the main User collection first, then OutlookUser for legacy/specific config
        // Actually, we should unify this. For now, let's assume we want to log in as a User.
        // Strategy:
        // 1. Find a User with this email.
        // 2. If found, log them in.
        // 3. If not found, check OutlookUser whitelist.
        // 4. If in whitelist but not in User, create/update User? Or just use OutlookUser?
        // The auth middleware uses User.findById. So we MUST have a User document.
        let user = await User_1.User.findOne({ email: { $in: possibleEmails } });
        if (!user) {
            // Check if authorized in OutlookUser whitelist
            const outlookUser = await OutlookUser_1.OutlookUser.findOne({ email: { $in: possibleEmails } });
            if (outlookUser) {
                // Create a User record for them if it doesn't exist
                // We need a dummy password hash since they use OAuth
                user = await User_1.User.create({
                    email: outlookUser.email,
                    passwordHash: 'oauth-managed',
                    role: outlookUser.role,
                    displayName: displayName || outlookUser.displayName || outlookUser.email,
                    tokenVersion: 0
                });
            }
            else {
                return res.status(403).json({
                    error: 'Email not authorized. Please contact administrator.',
                    details: { receivedEmails: possibleEmails }
                });
            }
        }
        // Update last login
        user.lastActive = new Date();
        if (!user.displayName && displayName) {
            user.displayName = displayName;
        }
        await user.save();
        // Generate JWT token
        const token = (0, auth_1.signToken)({ userId: String(user._id), role: user.role, tokenVersion: user.tokenVersion });
        // Log the login
        await (0, auditLogger_1.logAudit)({
            userId: String(user._id),
            action: 'LOGIN_MICROSOFT',
            details: { email: user.email },
            req
        });
        res.json({
            token,
            role: user.role,
            displayName: user.displayName || user.email
        });
    }
    catch (e) {
        console.error('Microsoft OAuth error:', e.response?.data || e.message);
        const errorData = e.response?.data || {};
        res.status(500).json({
            error: 'Authentication failed',
            details: errorData.error_description || e.message,
            fullError: errorData
        });
    }
});
