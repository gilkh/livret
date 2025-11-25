"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubAdminAssignment = void 0;
const mongoose_1 = require("mongoose");
const subAdminAssignmentSchema = new mongoose_1.Schema({
    subAdminId: { type: String, required: true },
    teacherId: { type: String, required: true },
    assignedAt: { type: Date, default: () => new Date() },
    assignedBy: { type: String, required: true },
});
// Create compound index to prevent duplicate assignments
subAdminAssignmentSchema.index({ subAdminId: 1, teacherId: 1 }, { unique: true });
exports.SubAdminAssignment = (0, mongoose_1.model)('SubAdminAssignment', subAdminAssignmentSchema);
