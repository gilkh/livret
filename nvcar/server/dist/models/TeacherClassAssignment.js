"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherClassAssignment = void 0;
const mongoose_1 = require("mongoose");
const teacherClassAssignmentSchema = new mongoose_1.Schema({
    teacherId: { type: String, required: true },
    classId: { type: String, required: true },
    schoolYearId: { type: String, required: true },
    languages: { type: [String], default: [] },
    isProfPolyvalent: { type: Boolean, default: false },
    assignedAt: { type: Date, default: () => new Date() },
    assignedBy: { type: String, required: true },
});
// Create compound index to prevent duplicate assignments
teacherClassAssignmentSchema.index({ teacherId: 1, classId: 1 }, { unique: true });
exports.TeacherClassAssignment = (0, mongoose_1.model)('TeacherClassAssignment', teacherClassAssignmentSchema);
