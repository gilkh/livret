"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulationRun = void 0;
const mongoose_1 = require("mongoose");
const simulationActionMetricSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    ok: { type: Boolean, required: true },
    ms: { type: Number, required: true },
    status: { type: Number },
    error: { type: String },
    at: { type: Date, default: () => new Date() },
});
const simulationRunSchema = new mongoose_1.Schema({
    status: { type: String, enum: ['running', 'stopped', 'completed', 'failed'], required: true },
    scenario: { type: String, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    requestedDurationSec: { type: Number, required: true },
    teachers: { type: Number, required: true },
    subAdmins: { type: Number, required: true },
    templateName: { type: String },
    sandboxTemplateId: { type: String },
    sandbox: { type: Boolean, default: true },
    sandboxMarker: { type: String },
    summary: { type: mongoose_1.Schema.Types.Mixed },
    lastMetrics: { type: mongoose_1.Schema.Types.Mixed },
    recentActions: { type: [simulationActionMetricSchema], default: [] },
    error: { type: String },
}, { timestamps: true });
simulationRunSchema.index({ startedAt: -1 });
exports.SimulationRun = (0, mongoose_1.model)('SimulationRun', simulationRunSchema);
