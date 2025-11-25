"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateChangeLog = void 0;
const mongoose_1 = require("mongoose");
const templateChangeLogSchema = new mongoose_1.Schema({
    templateAssignmentId: { type: String, required: true },
    teacherId: { type: String, required: true },
    changeType: { type: String, default: 'language_toggle' },
    blockIndex: { type: Number, required: true },
    pageIndex: { type: Number, required: true },
    before: { type: mongoose_1.Schema.Types.Mixed },
    after: { type: mongoose_1.Schema.Types.Mixed },
    timestamp: { type: Date, default: () => new Date() },
});
// Index for quick lookup of changes by assignment
templateChangeLogSchema.index({ templateAssignmentId: 1, timestamp: -1 });
exports.TemplateChangeLog = (0, mongoose_1.model)('TemplateChangeLog', templateChangeLogSchema);
