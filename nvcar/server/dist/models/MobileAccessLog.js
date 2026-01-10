"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MobileAccessLog = void 0;
const mongoose_1 = require("mongoose");
const mobileAccessLogSchema = new mongoose_1.Schema({
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true },
    screenWidth: { type: Number },
    screenHeight: { type: Number },
    deviceType: { type: String }, // Parsed from user agent (phone, tablet, etc.)
    browser: { type: String }, // Parsed browser name
    os: { type: String }, // Parsed OS name
    timestamp: { type: Date, default: () => new Date() },
    path: { type: String }, // Which page they tried to access
});
// Create indexes for efficient querying
mobileAccessLogSchema.index({ timestamp: -1 });
mobileAccessLogSchema.index({ ipAddress: 1, timestamp: -1 });
exports.MobileAccessLog = (0, mongoose_1.model)('MobileAccessLog', mobileAccessLogSchema);
