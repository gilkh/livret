import { Schema, model } from 'mongoose'

const templateChangeSuggestionSchema = new Schema({
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
})

export const TemplateChangeSuggestion = model('TemplateChangeSuggestion', templateChangeSuggestionSchema)
