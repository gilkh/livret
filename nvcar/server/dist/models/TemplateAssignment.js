"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateAssignment = void 0;
const mongoose_1 = require("mongoose");
const templateAssignmentSchema = new mongoose_1.Schema({
    templateId: { type: String, required: true },
    templateVersion: { type: Number, required: true, default: 1 },
    studentId: { type: String, required: true },
    assignedTeachers: { type: [String], default: [] },
    teacherCompletions: {
        type: [{
                teacherId: String,
                completed: Boolean,
                completedAt: Date
            }],
        default: []
    },
    status: { type: String, enum: ['draft', 'in_progress', 'completed', 'signed'], default: 'draft' },
    assignedAt: { type: Date, default: () => new Date() },
    assignedBy: { type: String, required: true },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    completedBy: { type: String },
    data: { type: mongoose_1.Schema.Types.Mixed, default: {} },
});
// Create compound index to prevent duplicate assignments
templateAssignmentSchema.index({ templateId: 1, studentId: 1 }, { unique: true });
templateAssignmentSchema.index({ studentId: 1, status: 1 });
exports.TemplateAssignment = (0, mongoose_1.model)('TemplateAssignment', templateAssignmentSchema);
