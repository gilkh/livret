"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Student = void 0;
const mongoose_1 = require("mongoose");
const studentSchema = new mongoose_1.Schema({
    logicalKey: { type: String, unique: true, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    avatarUrl: { type: String },
    avatarHash: { type: String },
    parentName: { type: String },
    parentPhone: { type: String },
    fatherName: { type: String },
    fatherEmail: { type: String },
    motherEmail: { type: String },
    studentEmail: { type: String },
    level: { type: String }, // Current level if not in a class, or cached level
    nextLevel: { type: String }, // Staging for next level
    schoolYearId: { type: String }, // Current school year association
    status: { type: String, enum: ['active', 'archived', 'left'], default: 'active' },
    // Track when student left the school
    leftAt: { type: Date },
    leftSchoolYearId: { type: String }, // The school year when the student left
    leftBy: { type: String }, // Admin who marked the student as left
    // Track when student came back
    returnedAt: { type: Date },
    returnedSchoolYearId: { type: String }, // The school year when the student returned
    returnedBy: { type: String }, // Admin who marked the student as returned
    promotions: [{
            schoolYearId: { type: String },
            date: { type: Date },
            fromLevel: { type: String },
            toLevel: { type: String },
            promotedBy: { type: String }
        }]
});
// Add indexes for performance
studentSchema.index({ schoolYearId: 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ lastName: 1, firstName: 1 });
exports.Student = (0, mongoose_1.model)('Student', studentSchema);
