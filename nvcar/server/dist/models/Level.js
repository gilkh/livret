"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Level = void 0;
const mongoose_1 = require("mongoose");
const levelSchema = new mongoose_1.Schema({
    name: { type: String, required: true, unique: true },
    order: { type: Number, required: true, unique: true },
});
exports.Level = (0, mongoose_1.model)('Level', levelSchema);
