"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompetencyVisibilityRule = void 0;
const mongoose_1 = require("mongoose");
const ruleSchema = new mongoose_1.Schema({
    competencyId: { type: String, required: true },
    minAgeMonths: { type: Number },
    maxAgeMonths: { type: Number },
    levels: { type: [String], default: [] },
    classIds: { type: [String], default: [] },
});
exports.CompetencyVisibilityRule = (0, mongoose_1.model)('CompetencyVisibilityRule', ruleSchema);
