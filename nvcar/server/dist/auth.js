"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.signToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("./models/User");
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change';
const signToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, jwtSecret, { expiresIn: '2h' });
};
exports.signToken = signToken;
const requireAuth = (roles) => {
    return async (req, res, next) => {
        let token = '';
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.slice('Bearer '.length);
        }
        else if (req.query.token) {
            token = String(req.query.token);
        }
        if (!token)
            return res.status(401).json({ error: 'unauthorized' });
        try {
            const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
            // If impersonating, use the impersonated user's ID and role for authorization
            // but keep the original admin info for audit trails
            const effectiveUserId = decoded.impersonateUserId || decoded.userId;
            const effectiveRole = decoded.impersonateRole || decoded.role;
            // Check token version and update lastActive
            // We check the ACTUAL user (the one who logged in)
            const user = await User_1.User.findById(decoded.userId);
            if (!user)
                return res.status(401).json({ error: 'user_not_found' });
            const tokenVersion = decoded.tokenVersion || 0;
            if ((user.tokenVersion || 0) > tokenVersion) {
                return res.status(401).json({ error: 'token_expired' });
            }
            // Update lastActive
            user.lastActive = new Date();
            await user.save();
            req.user = {
                userId: effectiveUserId,
                role: effectiveRole,
                actualUserId: decoded.userId, // Original admin user ID
                actualRole: decoded.role, // Original admin role
                isImpersonating: !!decoded.impersonateUserId,
                bypassScopes: user.bypassScopes || []
            };
            if (roles && !roles.includes(effectiveRole))
                return res.status(403).json({ error: 'forbidden' });
            next();
        }
        catch (e) {
            return res.status(401).json({ error: 'invalid_token' });
        }
    };
};
exports.requireAuth = requireAuth;
