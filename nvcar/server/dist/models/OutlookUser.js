"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutlookUser = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, required: true, enum: ['ADMIN', 'SUBADMIN', 'TEACHER'] },
    displayName: { type: String },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date },
    signatureUrl: { type: String }
});
exports.OutlookUser = (0, mongoose_1.model)('OutlookUser', schema);
