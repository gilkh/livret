"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateChangeSuggestion = void 0;
const mongoose_1 = require("mongoose");
const templateChangeSuggestionSchema = new mongoose_1.Schema({
    subAdminId: { type: String, required: true },
    templateId: { type: String, required: true },
    pageIndex: { type: Number, required: true },
    blockIndex: { type: Number, required: true },
    originalText: { type: String, required: true },
    suggestedText: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    adminComment: { type: String },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
});
exports.TemplateChangeSuggestion = (0, mongoose_1.model)('TemplateChangeSuggestion', templateChangeSuggestionSchema);
