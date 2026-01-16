import { Schema, model } from 'mongoose'

const templateAssignmentSchema = new Schema({
    templateId: { type: String, required: true },
    templateVersion: { type: Number, required: true, default: 1 },
    studentId: { type: String, required: true },
    completionSchoolYearId: { type: String },
    assignedTeachers: { type: [String], default: [] },
    teacherCompletions: {
        type: [{
            teacherId: String,
            completed: Boolean,
            completedAt: Date,
            completedSem1: Boolean,
            completedAtSem1: Date,
            completedSem2: Boolean,
            completedAtSem2: Date
        }],
        default: []
    },
    languageCompletions: {
        type: [{
            code: String,
            completed: Boolean,
            completedAt: Date,
            completedSem1: Boolean,
            completedAtSem1: Date,
            completedSem2: Boolean,
            completedAtSem2: Date
        }],
        default: []
    },
    // Historical teacher completions per school year (never deleted)
    // Key: schoolYearId, Value: array of teacher completions for that year
    teacherCompletionsByYear: {
        type: Schema.Types.Mixed,
        default: {}
    },
    // Historical completion flags per school year (never deleted)
    // Key: schoolYearId, Value: { isCompleted, isCompletedSem1, isCompletedSem2, completedAt, etc. }
    completionHistoryByYear: {
        type: Schema.Types.Mixed,
        default: {}
    },
    // Historical assigned teachers per school year (never deleted)
    // Key: schoolYearId, Value: array of teacher IDs that were assigned for that year
    assignedTeachersByYear: {
        type: Schema.Types.Mixed,
        default: {}
    },
    // status is UI-only hint. Business logic must use isCompleted/isCompletedSem1/isSigned etc.
    status: { type: String, enum: ['draft', 'in_progress', 'completed', 'signed'], default: 'draft' },
    assignedAt: { type: Date, default: () => new Date() },
    assignedBy: { type: String, required: true },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    completedBy: { type: String },
    isCompletedSem1: { type: Boolean, default: false },
    completedAtSem1: { type: Date },
    isCompletedSem2: { type: Boolean, default: false },
    completedAtSem2: { type: Date },
    data: { type: Schema.Types.Mixed, default: {} },
    // Optimistic concurrency for assignment data
    dataVersion: { type: Number, default: 1, index: true }
}, { timestamps: true })

// Create compound index to prevent duplicate assignments
templateAssignmentSchema.index({ templateId: 1, studentId: 1 }, { unique: true })
templateAssignmentSchema.index({ studentId: 1, status: 1 })

export const TemplateAssignment = model('TemplateAssignment', templateAssignmentSchema)
