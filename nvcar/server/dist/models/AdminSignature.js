"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminSignature = void 0;
const mongoose_1 = require("mongoose");
const adminSigSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    dataUrl: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    createdAt: { type: Date, default: () => new Date() },
});
exports.AdminSignature = (0, mongoose_1.model)('AdminSignature', adminSigSchema);
