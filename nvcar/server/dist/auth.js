"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.signToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change';
const signToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, jwtSecret, { expiresIn: '2h' });
};
exports.signToken = signToken;
const requireAuth = (roles) => {
    return (req, res, next) => {
        const header = req.headers.authorization;
        if (!header || !header.startsWith('Bearer '))
            return res.status(401).json({ error: 'unauthorized' });
        try {
            const token = header.slice('Bearer '.length);
            const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
            req.user = decoded;
            if (roles && !roles.includes(decoded.role))
                return res.status(403).json({ error: 'forbidden' });
            next();
        }
        catch (e) {
            return res.status(401).json({ error: 'invalid_token' });
        }
    };
};
exports.requireAuth = requireAuth;
