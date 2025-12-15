"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentAcquiredSkill = void 0;
const mongoose_1 = require("mongoose");
const acquiredSkillSchema = new mongoose_1.Schema({
    studentId: { type: String, required: true, index: true },
    // Linkage to original source
    templateId: { type: String, required: true, index: true },
    assignmentId: { type: String, index: true },
    // The Critical Data (Snapshot)
    skillText: { type: String, required: true }, // The actual text of the skill
    languages: { type: [String], default: [] }, // Codes of languages acquired: ['fr', 'en', 'ar']
    // Metadata for recovery and tracking
    sourceKey: { type: String }, // e.g., "table_0_1_row_3"
    recordedAt: { type: Date, default: () => new Date() },
    recordedBy: { type: String }
});
// Compound index to quickly find a specific skill for a student in a template
// We use upsert, so this combination should be unique per source key if we want to overwrite
// Or we can just query by studentId + templateId + skillText
acquiredSkillSchema.index({ studentId: 1, templateId: 1, sourceKey: 1 }, { unique: true });
acquiredSkillSchema.index({ templateId: 1, skillText: 1 });
exports.StudentAcquiredSkill = (0, mongoose_1.model)('StudentAcquiredSkill', acquiredSkillSchema);
