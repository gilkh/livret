"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Setting = void 0;
const mongoose_1 = require("mongoose");
const settingSchema = new mongoose_1.Schema({
    key: { type: String, unique: true, required: true },
    value: { type: mongoose_1.Schema.Types.Mixed, required: true },
});
exports.Setting = (0, mongoose_1.model)('Setting', settingSchema);
