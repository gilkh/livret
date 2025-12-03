import { Schema, model } from 'mongoose'

const templateSignatureSchema = new Schema({
    templateAssignmentId: { type: String, required: true },
    subAdminId: { type: String, required: true },
    signedAt: { type: Date, default: () => new Date() },
    pdfPath: { type: String },
    status: { type: String, enum: ['signed', 'exported'], default: 'signed' },
    type: { type: String, enum: ['standard', 'end_of_year'], default: 'standard' },
})

// Index for quick lookup
templateSignatureSchema.index({ templateAssignmentId: 1 })

export const TemplateSignature = model('TemplateSignature', templateSignatureSchema)
