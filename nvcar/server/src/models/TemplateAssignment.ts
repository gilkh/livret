import { Schema, model } from 'mongoose'

// Migration note: We added year-scoped assignments to allow one assignment per (template, student, schoolYear).
// This required changing the unique index from { templateId, studentId } to
// { templateId, studentId, completionSchoolYearId } so that assignments can be kept per year.
// If you have existing deployments, consider migrating existing TemplateAssignment documents by
// setting `completionSchoolYearId` to the appropriate historical school year id (or the active year)
// for each assignment before deploying to avoid unique index conflicts.

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

// Create compound index to prevent duplicate assignments per school year
// Previously uniqueness was enforced on (templateId, studentId) which prevented
// creating a separate assignment for the same template across different years.
// Make uniqueness scoped to completionSchoolYearId to allow one assignment per
// (template, student, schoolYear).
templateAssignmentSchema.index({ templateId: 1, studentId: 1, completionSchoolYearId: 1 }, { unique: true })
templateAssignmentSchema.index({ studentId: 1, status: 1 })

export const TemplateAssignment = model('TemplateAssignment', templateAssignmentSchema)
