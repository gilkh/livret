import { Schema, model } from 'mongoose'

const templateAssignmentSchema = new Schema({
    templateId: { type: String, required: true },
    studentId: { type: String, required: true },
    assignedTeachers: { type: [String], default: [] },
    status: { type: String, enum: ['draft', 'in_progress', 'completed', 'signed'], default: 'draft' },
    assignedAt: { type: Date, default: () => new Date() },
    assignedBy: { type: String, required: true },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    completedBy: { type: String },
})

// Create compound index to prevent duplicate assignments
templateAssignmentSchema.index({ templateId: 1, studentId: 1 }, { unique: true })

export const TemplateAssignment = model('TemplateAssignment', templateAssignmentSchema)
