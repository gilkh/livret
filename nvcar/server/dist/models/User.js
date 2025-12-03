"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'SUBADMIN', 'TEACHER', 'AEFE'], required: true },
    displayName: { type: String, required: true },
    signatureUrl: { type: String },
    lastActive: { type: Date },
    tokenVersion: { type: Number, default: 0 },
    bypassScopes: [{
            type: { type: String, enum: ['ALL', 'LEVEL', 'CLASS', 'STUDENT'], required: true },
            value: { type: String } // Level name, Class ID, or Student ID. Empty for ALL.
        }],
});
exports.User = (0, mongoose_1.model)('User', userSchema);
