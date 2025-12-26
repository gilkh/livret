"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsRouter = void 0;
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("../auth");
const Setting_1 = require("../models/Setting");
const simulationSandbox_1 = require("../utils/simulationSandbox");
exports.settingsRouter = (0, express_1.Router)();
exports.settingsRouter.get('/status', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const dbState = mongoose_1.default.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
    res.json({
        backend: 'online',
        database: dbStatus,
        databaseName: mongoose_1.default.connection?.db?.databaseName || null,
        simulationSandbox: (0, simulationSandbox_1.isSimulationSandbox)(),
        simulationSandboxDiagnostics: (0, simulationSandbox_1.getSimulationSandboxDiagnostics)(),
        uptime: process.uptime()
    });
});
exports.settingsRouter.get('/public', async (req, res) => {
    const settings = await Setting_1.Setting.find({
        key: { $in: ['login_enabled_microsoft', 'school_name', 'nav_permissions'] }
    }).lean();
    const settingsMap = {};
    settings.forEach(s => {
        settingsMap[s.key] = s.value;
    });
    // Defaults
    if (settingsMap.login_enabled_microsoft === undefined)
        settingsMap.login_enabled_microsoft = true;
    if (settingsMap.school_name === undefined)
        settingsMap.school_name = '';
    if (settingsMap.nav_permissions === undefined)
        settingsMap.nav_permissions = {};
    res.json(settingsMap);
});
exports.settingsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const settings = await Setting_1.Setting.find({}).lean();
    const settingsMap = {};
    settings.forEach(s => {
        settingsMap[s.key] = s.value;
    });
    res.json(settingsMap);
});
exports.settingsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { key, value } = req.body;
    if (!key)
        return res.status(400).json({ error: 'missing_key' });
    await Setting_1.Setting.findOneAndUpdate({ key }, { key, value }, { upsert: true, new: true });
    res.json({ success: true });
});
exports.settingsRouter.post('/restart', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    res.json({ success: true, message: 'Restarting server...' });
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});
