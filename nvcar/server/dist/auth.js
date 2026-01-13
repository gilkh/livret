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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.signToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("./models/User");
const simulationSandbox_1 = require("./utils/simulationSandbox");
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change';
const signToken = (payload, options) => {
    return jsonwebtoken_1.default.sign(payload, jwtSecret, { expiresIn: options?.expiresIn ?? '2h' });
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
            req.authToken = token;
            req.tokenPayload = decoded;
            // If impersonating, use the impersonated user's ID and role for authorization
            // but keep the original admin info for audit trails
            const effectiveUserId = decoded.impersonateUserId || decoded.userId;
            const effectiveRole = decoded.impersonateRole || decoded.role;
            // Check token version and update lastActive
            // We check the ACTUAL user (the one who logged in) - could be in User or OutlookUser collection
            let user = await User_1.User.findById(decoded.userId);
            let isOutlookUser = false;
            let outlookUser = null;
            if (!user) {
                // Check OutlookUser collection - MS OAuth users may be stored there
                const { OutlookUser } = await Promise.resolve().then(() => __importStar(require('./models/OutlookUser')));
                outlookUser = await OutlookUser.findById(decoded.userId);
                if (outlookUser) {
                    isOutlookUser = true;
                }
                else {
                    // In the sandbox server, we intentionally run against an isolated DB.
                    // We still want to reuse the normal admin login to control simulations,
                    // so allow a valid ADMIN token even if the user doc isn't present in the sandbox DB.
                    if ((0, simulationSandbox_1.isSimulationSandbox)() && decoded.role === 'ADMIN') {
                        ;
                        req.user = {
                            userId: effectiveUserId,
                            role: effectiveRole,
                            actualUserId: decoded.userId,
                            actualRole: decoded.role,
                            isImpersonating: !!decoded.impersonateUserId,
                            bypassScopes: [],
                        };
                        if (roles && !roles.includes(effectiveRole))
                            return res.status(403).json({ error: 'forbidden' });
                        return next();
                    }
                    return res.status(401).json({ error: 'user_not_found' });
                }
            }
            if (isOutlookUser && outlookUser) {
                // OutlookUser doesn't have tokenVersion, so skip that check
                // Update lastLogin for OutlookUser
                await Promise.resolve().then(() => __importStar(require('./models/OutlookUser'))).then(({ OutlookUser }) => OutlookUser.findByIdAndUpdate(decoded.userId, { lastLogin: new Date() }));
                req.user = {
                    userId: effectiveUserId,
                    role: effectiveRole,
                    actualUserId: decoded.userId,
                    actualRole: decoded.role,
                    isImpersonating: !!decoded.impersonateUserId,
                    bypassScopes: []
                };
            }
            else if (user) {
                const tokenVersion = decoded.tokenVersion || 0;
                if ((user.tokenVersion || 0) > tokenVersion) {
                    return res.status(401).json({ error: 'token_expired' });
                }
                // Check if user account is active
                const userStatus = user.status || 'active';
                if (userStatus === 'deleted') {
                    return res.status(401).json({ error: 'account_deleted', message: 'This account has been deleted' });
                }
                if (userStatus === 'inactive') {
                    return res.status(401).json({ error: 'account_disabled', message: 'This account has been deactivated' });
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
            }
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
