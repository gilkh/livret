"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassModel = void 0;
const mongoose_1 = require("mongoose");
const classSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    level: { type: String },
    schoolYearId: { type: String, required: true },
});
classSchema.index({ schoolYearId: 1, name: 1 });
exports.ClassModel = (0, mongoose_1.model)('Class', classSchema);
