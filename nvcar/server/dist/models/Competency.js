"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Competency = void 0;
const mongoose_1 = require("mongoose");
const competencySchema = new mongoose_1.Schema({
    categoryId: { type: String, required: true },
    label: { type: String, required: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
});
exports.Competency = (0, mongoose_1.model)('Competency', competencySchema);
