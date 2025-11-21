"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleScope = void 0;
const mongoose_1 = require("mongoose");
const roleScopeSchema = new mongoose_1.Schema({
    userId: { type: String, unique: true, required: true },
    schoolYearId: { type: String },
    levels: { type: [String], default: [] },
    classIds: { type: [String], default: [] },
    categoryIds: { type: [String], default: [] },
});
exports.RoleScope = (0, mongoose_1.model)('RoleScope', roleScopeSchema);
