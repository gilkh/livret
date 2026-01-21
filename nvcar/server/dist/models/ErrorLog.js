"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorLog = void 0;
const mongoose_1 = require("mongoose");
const errorLogSchema = new mongoose_1.Schema({
    userId: { type: String, required: true },
    role: { type: String, required: true },
    actualUserId: { type: String },
    actualRole: { type: String },
    displayName: { type: String },
    email: { type: String },
    source: { type: String, default: 'client' },
    method: { type: String },
    url: { type: String },
    status: { type: Number },
    message: { type: String, required: true },
    stack: { type: String },
    details: { type: mongoose_1.Schema.Types.Mixed },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
}, { timestamps: true });
errorLogSchema.index({ resolved: 1, createdAt: -1 });
errorLogSchema.index({ userId: 1, createdAt: -1 });
exports.ErrorLog = (0, mongoose_1.model)('ErrorLog', errorLogSchema);
