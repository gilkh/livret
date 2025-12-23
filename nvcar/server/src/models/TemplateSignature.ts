import { Schema, model } from 'mongoose'

const templateSignatureSchema = new Schema({
    templateAssignmentId: { type: String, required: true },
    subAdminId: { type: String, required: true },
    signedAt: { type: Date, default: () => new Date() },
    pdfPath: { type: String },
    status: { type: String, enum: ['signed', 'exported'], default: 'signed' },
    type: { type: String, enum: ['standard', 'end_of_year'], default: 'standard' },
    signatureUrl: { type: String },
    level: { type: String },
    schoolYearId: { type: String },
    // Deterministic period id like '2024/2025-eoy' or schoolYearId + type
    signaturePeriodId: { type: String },
})

// Index for quick lookup
templateSignatureSchema.index({ templateAssignmentId: 1 })
templateSignatureSchema.index({ signaturePeriodId: 1 })
templateSignatureSchema.index({ schoolYearId: 1 })

// Ensure at-most-one signature per assignment/type/period/level when signaturePeriodId is present
templateSignatureSchema.index(
    { templateAssignmentId: 1, type: 1, signaturePeriodId: 1, level: 1 },
    { unique: true, partialFilterExpression: { signaturePeriodId: { $exists: true, $ne: null } } }
)

export const TemplateSignature = model('TemplateSignature', templateSignatureSchema)
