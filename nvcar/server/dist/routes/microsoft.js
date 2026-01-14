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
const DEFAULT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'https://localhost';
const ALLOWED_REDIRECT_URIS = [
    DEFAULT_REDIRECT_URI,
    'https://192.168.1.11',
    'https://192.168.1.74',
    'https://192.168.17.10',
    'https://localhost',
    'https://livret.champville.com'
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
        // Force clean domain if it matches ours (strip port 5173)
        if (redirectUri && redirectUri.includes('livret.champville.com:5173')) {
            redirectUri = 'https://livret.champville.com';
        }
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
        // Strategy:
        // 1. First check if authorized in OutlookUser whitelist (this is the primary source of truth)
        // 2. If in OutlookUser whitelist, use the OutlookUser's _id for JWT to match TeacherClassAssignment
        // 3. If not in OutlookUser, check User collection as fallback
        let authUserId;
        let authRole;
        let authDisplayName;
        let authTokenVersion = 0;
        // Check OutlookUser whitelist first - this is where teacher class assignments reference
        const outlookUser = await OutlookUser_1.OutlookUser.findOne({ email: { $in: possibleEmails } });
        if (outlookUser) {
            // Use the OutlookUser's _id - this is what TeacherClassAssignment uses
            authUserId = String(outlookUser._id);
            authRole = outlookUser.role;
            authDisplayName = displayName || outlookUser.displayName || outlookUser.email;
            // Update OutlookUser last login
            await OutlookUser_1.OutlookUser.findByIdAndUpdate(outlookUser._id, {
                lastLogin: new Date(),
                displayName: authDisplayName
            });
        }
        else {
            // Not in OutlookUser whitelist - check regular User collection
            const user = await User_1.User.findOne({ email: { $in: possibleEmails } });
            if (!user) {
                return res.status(403).json({
                    error: 'Email not authorized. Please contact administrator.',
                    details: { receivedEmails: possibleEmails }
                });
            }
            // Use the User's _id
            authUserId = String(user._id);
            authRole = user.role;
            authDisplayName = user.displayName || '';
            authTokenVersion = user.tokenVersion || 0;
            // Update last login
            user.lastActive = new Date();
            if (!user.displayName && displayName) {
                user.displayName = displayName;
            }
            await user.save();
        }
        // Generate JWT token using the OutlookUser's ID (if from whitelist) or User's ID
        const token = (0, auth_1.signToken)({ userId: authUserId, role: authRole, tokenVersion: authTokenVersion });
        // Log the login
        await (0, auditLogger_1.logAudit)({
            userId: authUserId,
            action: 'LOGIN_MICROSOFT',
            details: { email: outlookUser?.email || (await User_1.User.findById(authUserId))?.email },
            req
        });
        res.json({
            token,
            role: authRole,
            displayName: authDisplayName
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
