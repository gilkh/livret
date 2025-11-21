"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentSignature = void 0;
const mongoose_1 = require("mongoose");
const itemSchema = new mongoose_1.Schema({
    label: { type: String, required: true },
    dataUrl: { type: String },
    url: { type: String },
});
const sigSchema = new mongoose_1.Schema({
    studentId: { type: String, required: true, unique: true },
    items: { type: [itemSchema], default: [] },
    updatedAt: { type: Date, default: () => new Date() },
});
exports.StudentSignature = (0, mongoose_1.model)('StudentSignature', sigSchema);
