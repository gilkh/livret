import { Schema, model } from 'mongoose'

const templateChangeSuggestionSchema = new Schema({
    subAdminId: { type: String, required: true },
    type: { type: String, enum: ['template_edit', 'semester_request', 'next_year_request'], default: 'template_edit' },
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
})

export const TemplateChangeSuggestion = model('TemplateChangeSuggestion', templateChangeSuggestionSchema)
