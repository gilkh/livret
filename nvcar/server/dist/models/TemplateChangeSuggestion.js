"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateChangeSuggestion = void 0;
const mongoose_1 = require("mongoose");
const templateChangeSuggestionSchema = new mongoose_1.Schema({
    subAdminId: { type: String, required: true },
    type: { type: String, enum: ['template_edit', 'semester_request'], default: 'template_edit' },
    templateId: { type: String },
    templateVersion: { type: Number },
    pageIndex: { type: Number },
    blockIndex: { type: Number },
    blockId: { type: String },
    originalText: { type: String },
    suggestedText: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    adminComment: { type: String },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
});
exports.TemplateChangeSuggestion = (0, mongoose_1.model)('TemplateChangeSuggestion', templateChangeSuggestionSchema);
