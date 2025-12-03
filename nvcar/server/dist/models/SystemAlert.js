"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemAlert = void 0;
const mongoose_1 = require("mongoose");
const systemAlertSchema = new mongoose_1.Schema({
    message: { type: String, required: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
});
exports.SystemAlert = (0, mongoose_1.model)('SystemAlert', systemAlertSchema);
