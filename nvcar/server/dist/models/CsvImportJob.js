"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CsvImportJob = void 0;
const mongoose_1 = require("mongoose");
const jobSchema = new mongoose_1.Schema({
    startedAt: { type: Date, default: () => new Date() },
    finishedAt: { type: Date, default: () => new Date() },
    addedCount: { type: Number, required: true },
    updatedCount: { type: Number, required: true },
    errorCount: { type: Number, required: true },
    reportJson: { type: String, required: true },
});
exports.CsvImportJob = (0, mongoose_1.model)('CsvImportJob', jobSchema);
