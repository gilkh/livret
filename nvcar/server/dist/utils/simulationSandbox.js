"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSimulationSandbox = exports.isSimulationSandbox = exports.getSimulationSandboxDiagnostics = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const getSimulationSandboxDiagnostics = () => {
    const flagRaw = String(process.env.SIMULATION_SANDBOX || '');
    const flag = flagRaw.toLowerCase() === 'true';
    const uri = String(process.env.MONGO_URI || process.env.MONGODB_URI || '');
    const dbName = mongoose_1.default.connection?.db?.databaseName;
    const marker = String(process.env.SIMULATION_SANDBOX_MARKER || '').trim().toLowerCase() || 'sandbox';
    const uriLower = uri.toLowerCase();
    const dbLower = String(dbName || '').toLowerCase();
    const markerMatch = !!marker && (uriLower.includes(marker) || dbLower.includes(marker));
    const testMatch = uriLower.includes('test') || dbLower.includes('test');
    return {
        ok: flag && (markerMatch || testMatch),
        flag,
        flagRaw,
        marker,
        markerMatch,
        testMatch,
        dbName: dbName || null,
        uri: uri || null,
        envSource: process.env.MONGO_URI ? 'MONGO_URI' : process.env.MONGODB_URI ? 'MONGODB_URI' : null,
    };
};
exports.getSimulationSandboxDiagnostics = getSimulationSandboxDiagnostics;
const isSimulationSandbox = () => {
    return (0, exports.getSimulationSandboxDiagnostics)().ok;
};
exports.isSimulationSandbox = isSimulationSandbox;
const assertSimulationSandbox = () => {
    if ((0, exports.isSimulationSandbox)())
        return;
    const uri = String(process.env.MONGO_URI || process.env.MONGODB_URI || '');
    const dbName = mongoose_1.default.connection?.db?.databaseName;
    const message = `simulation_not_allowed: set SIMULATION_SANDBOX=true and connect to a sandbox DB (marker: ${process.env.SIMULATION_SANDBOX_MARKER || 'sandbox'}). currentDb=${dbName || 'unknown'} currentUri=${uri || 'unset'}`;
    const err = new Error(message);
    err.code = 'simulation_not_allowed';
    throw err;
};
exports.assertSimulationSandbox = assertSimulationSandbox;
