"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchoolYear = void 0;
const mongoose_1 = require("mongoose");
const schoolYearSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    active: { type: Boolean, default: true },
    activeSemester: { type: Number, default: 1 },
    sequence: { type: Number }, // Sequential identifier for ordering
});
exports.SchoolYear = (0, mongoose_1.model)('SchoolYear', schoolYearSchema);
