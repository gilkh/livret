"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateSignature = void 0;
const mongoose_1 = require("mongoose");
const templateSignatureSchema = new mongoose_1.Schema({
    templateAssignmentId: { type: String, required: true },
    subAdminId: { type: String, required: true },
    signedAt: { type: Date, default: () => new Date() },
    pdfPath: { type: String },
    status: { type: String, enum: ['signed', 'exported'], default: 'signed' },
    type: { type: String, enum: ['standard', 'end_of_year'], default: 'standard' },
});
// Index for quick lookup
templateSignatureSchema.index({ templateAssignmentId: 1 });
exports.TemplateSignature = (0, mongoose_1.model)('TemplateSignature', templateSignatureSchema);
