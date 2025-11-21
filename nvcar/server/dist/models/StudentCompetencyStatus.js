"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentCompetencyStatus = void 0;
const mongoose_1 = require("mongoose");
const statusSchema = new mongoose_1.Schema({
    studentId: { type: String, required: true },
    competencyId: { type: String, required: true },
    en: { type: Boolean, default: false },
    fr: { type: Boolean, default: false },
    ar: { type: Boolean, default: false },
    note: { type: String },
    updatedBy: { type: String, required: true },
    updatedAt: { type: Date, required: true },
});
statusSchema.index({ studentId: 1, competencyId: 1 }, { unique: true });
exports.StudentCompetencyStatus = (0, mongoose_1.model)('StudentCompetencyStatus', statusSchema);
