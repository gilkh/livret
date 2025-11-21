"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradebookTemplate = void 0;
const mongoose_1 = require("mongoose");
const blockSchema = new mongoose_1.Schema({
    type: { type: String, required: true },
    props: { type: mongoose_1.Schema.Types.Mixed, default: {} },
});
const pageSchema = new mongoose_1.Schema({
    title: { type: String },
    layout: { type: String, default: 'single' },
    blocks: { type: [blockSchema], default: [] },
});
const templateSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    pages: { type: [pageSchema], default: [] },
    createdBy: { type: String },
    updatedAt: { type: Date, default: () => new Date() },
    exportPassword: { type: String },
    status: { type: String, default: 'draft' },
    variables: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    watermark: { type: mongoose_1.Schema.Types.Mixed },
    permissions: { type: mongoose_1.Schema.Types.Mixed, default: { roles: ['ADMIN', 'SUBADMIN'] } },
    shareId: { type: String },
    versions: { type: [mongoose_1.Schema.Types.Mixed], default: [] },
    comments: { type: [mongoose_1.Schema.Types.Mixed], default: [] },
});
exports.GradebookTemplate = (0, mongoose_1.model)('GradebookTemplate', templateSchema);
