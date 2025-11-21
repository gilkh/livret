"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Brand = void 0;
const mongoose_1 = require("mongoose");
const brandSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    logoUrl: { type: String },
    colors: { type: [String], default: [] },
    fonts: { type: [String], default: [] },
});
exports.Brand = (0, mongoose_1.model)('Brand', brandSchema);
