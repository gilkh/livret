"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Enrollment = void 0;
const mongoose_1 = require("mongoose");
const enrollmentSchema = new mongoose_1.Schema({
    studentId: { type: String, required: true },
    classId: { type: String }, // Optional for promoted students not yet assigned
    schoolYearId: { type: String, required: true },
    status: { type: String, enum: ['active', 'promoted', 'archived'], default: 'active' },
    promotionStatus: { type: String, enum: ['promoted', 'retained', 'conditional', 'summer_school', 'left', 'pending'], default: 'pending' },
});
// Add indexes for performance
enrollmentSchema.index({ studentId: 1 });
enrollmentSchema.index({ schoolYearId: 1 });
enrollmentSchema.index({ classId: 1 });
enrollmentSchema.index({ studentId: 1, schoolYearId: 1 }); // Compound index for common lookup
enrollmentSchema.index({ schoolYearId: 1, studentId: 1 });
enrollmentSchema.index({ schoolYearId: 1, classId: 1 });
exports.Enrollment = (0, mongoose_1.model)('Enrollment', enrollmentSchema);
