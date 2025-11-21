"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'SUBADMIN', 'TEACHER'], required: true },
    displayName: { type: String, required: true },
});
exports.User = (0, mongoose_1.model)('User', userSchema);
