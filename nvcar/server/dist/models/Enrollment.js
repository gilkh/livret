"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Enrollment = void 0;
const mongoose_1 = require("mongoose");
const enrollmentSchema = new mongoose_1.Schema({
    studentId: { type: String, required: true },
    classId: { type: String, required: true },
    schoolYearId: { type: String, required: true },
});
exports.Enrollment = (0, mongoose_1.model)('Enrollment', enrollmentSchema);
