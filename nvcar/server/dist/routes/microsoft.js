"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.microsoftRouter = void 0;
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const OutlookUser_1 = require("../models/OutlookUser");
const auth_1 = require("../auth");
const auditLogger_1 = require("../utils/auditLogger");
exports.microsoftRouter = (0, express_1.Router)();
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5173';
const TENANT = process.env.MICROSOFT_TENANT || 'common'; // 'common' allows any Microsoft account
// Generate authorization URL
exports.microsoftRouter.get('/auth-url', (req, res) => {
    if (!CLIENT_ID) {
        return res.status(500).json({ error: 'Microsoft OAuth not configured' });
    }
    const authUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?` +
        `client_id=${CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_mode=query` +
        `&scope=${encodeURIComponent('openid email profile User.Read')}` +
        `&prompt=select_account` +
        `&state=${Math.random().toString(36).substring(7)}`;
    res.json({ authUrl });
});
// Handle OAuth callback
exports.microsoftRouter.post('/callback', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Authorization code is required' });
        }
        if (!CLIENT_ID || !CLIENT_SECRET) {
            return res.status(500).json({ error: 'Microsoft OAuth not configured' });
        }
        // Exchange code for token
        const tokenResponse = await axios_1.default.post(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
            redirect_uri: REDIRECT_URI,
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
        const outlookUser = await OutlookUser_1.OutlookUser.findOne({ email: { $in: possibleEmails } });
        if (!outlookUser) {
            return res.status(403).json({
                error: 'Email not authorized. Please contact administrator.',
                details: { receivedEmails: possibleEmails }
            });
        }
        // Update last login
        outlookUser.lastLogin = new Date();
        if (!outlookUser.displayName && displayName) {
            outlookUser.displayName = displayName;
        }
        await outlookUser.save();
        // Generate JWT token
        const token = (0, auth_1.signToken)({ userId: String(outlookUser._id), role: outlookUser.role });
        // Log the login
        await (0, auditLogger_1.logAudit)({
            userId: String(outlookUser._id),
            action: 'LOGIN_MICROSOFT',
            details: { email: outlookUser.email },
            req
        });
        res.json({
            token,
            role: outlookUser.role,
            displayName: outlookUser.displayName || outlookUser.email
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
