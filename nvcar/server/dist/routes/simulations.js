"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulationsRouter = void 0;
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("../auth");
const SimulationRun_1 = require("../models/SimulationRun");
const simulationSandbox_1 = require("../utils/simulationSandbox");
const simulationRunner_1 = require("../services/simulationRunner");
const sandboxServerManager_1 = require("../services/sandboxServerManager");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
exports.simulationsRouter = (0, express_1.Router)();
const proxyToSandbox = async (req, res, method, path, body) => {
    const st = (0, sandboxServerManager_1.getSandboxServerStatus)();
    if (!st.running) {
        return res.status(409).json({ error: 'sandbox_server_not_running', sandboxServer: st });
    }
    const url = `${st.baseUrl}${path}`;
    const auth = req.headers?.authorization;
    const isHttps = String(url).toLowerCase().startsWith('https://');
    const r = await axios_1.default.request({
        method,
        url,
        data: body,
        timeout: 30000,
        validateStatus: () => true,
        ...(isHttps ? { httpsAgent: new https_1.default.Agent({ rejectUnauthorized: false }) } : {}),
        headers: {
            ...(auth ? { Authorization: auth } : {}),
        },
    });
    return res.status(r.status).json(r.data);
};
// Sandbox server lifecycle (only meaningful on the normal server)
exports.simulationsRouter.get('/sandbox/status', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    if ((0, simulationSandbox_1.isSimulationSandbox)()) {
        return res.json({ ok: true, mode: 'sandbox', sandboxServer: { running: true, pid: process.pid, port: process.env.PORT ? Number(process.env.PORT) : 4001 } });
    }
    res.json({ ok: true, mode: 'normal', sandboxServer: (0, sandboxServerManager_1.getSandboxServerStatus)() });
});
exports.simulationsRouter.post('/sandbox/start', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    if ((0, simulationSandbox_1.isSimulationSandbox)()) {
        return res.status(400).json({ error: 'already_in_sandbox' });
    }
    try {
        const st = await (0, sandboxServerManager_1.startSandboxServer)();
        res.json({ ok: true, sandboxServer: st });
    }
    catch (e) {
        res.status(500).json({ error: 'sandbox_start_failed', message: String(e?.message || e), sandboxServer: (0, sandboxServerManager_1.getSandboxServerStatus)() });
    }
});
exports.simulationsRouter.post('/sandbox/stop', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    if ((0, simulationSandbox_1.isSimulationSandbox)()) {
        return res.status(400).json({ error: 'cannot_stop_from_sandbox' });
    }
    const st = await (0, sandboxServerManager_1.stopSandboxServer)();
    res.json({ ok: true, sandboxServer: st });
});
exports.simulationsRouter.get('/status', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    if (!(0, simulationSandbox_1.isSimulationSandbox)()) {
        try {
            return await proxyToSandbox(req, res, 'get', '/simulations/status');
        }
        catch (e) {
            return res.status(502).json({ error: 'sandbox_proxy_failed', message: String(e?.message || e), sandboxServer: (0, sandboxServerManager_1.getSandboxServerStatus)() });
        }
    }
    const running = await SimulationRun_1.SimulationRun.findOne({ status: 'running' }).sort({ startedAt: -1 }).lean();
    if (!running) {
        return res.json({
            sandbox: (0, simulationSandbox_1.isSimulationSandbox)(),
            sandboxDiagnostics: (0, simulationSandbox_1.getSimulationSandboxDiagnostics)(),
            running: null,
            live: null,
        });
    }
    const live = (0, simulationRunner_1.getLiveSimulationState)(String(running._id));
    res.json({
        sandbox: (0, simulationSandbox_1.isSimulationSandbox)(),
        sandboxDiagnostics: (0, simulationSandbox_1.getSimulationSandboxDiagnostics)(),
        running,
        live,
    });
});
exports.simulationsRouter.get('/history', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    if (!(0, simulationSandbox_1.isSimulationSandbox)()) {
        try {
            return await proxyToSandbox(req, res, 'get', '/simulations/history');
        }
        catch (e) {
            return res.status(502).json({ error: 'sandbox_proxy_failed', message: String(e?.message || e), sandboxServer: (0, sandboxServerManager_1.getSandboxServerStatus)() });
        }
    }
    const list = await SimulationRun_1.SimulationRun.find({}).sort({ startedAt: -1 }).limit(25).lean();
    res.json({ sandbox: (0, simulationSandbox_1.isSimulationSandbox)(), sandboxDiagnostics: (0, simulationSandbox_1.getSimulationSandboxDiagnostics)(), runs: list });
});
exports.simulationsRouter.get('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    if (!(0, simulationSandbox_1.isSimulationSandbox)()) {
        try {
            return await proxyToSandbox(req, res, 'get', `/simulations/${encodeURIComponent(String(req.params.id))}`);
        }
        catch (e) {
            return res.status(502).json({ error: 'sandbox_proxy_failed', message: String(e?.message || e), sandboxServer: (0, sandboxServerManager_1.getSandboxServerStatus)() });
        }
    }
    const run = await SimulationRun_1.SimulationRun.findById(req.params.id).lean();
    if (!run)
        return res.status(404).json({ error: 'not_found' });
    const live = (0, simulationRunner_1.getLiveSimulationState)(String(run._id));
    res.json({ sandbox: (0, simulationSandbox_1.isSimulationSandbox)(), sandboxDiagnostics: (0, simulationSandbox_1.getSimulationSandboxDiagnostics)(), run, live });
});
exports.simulationsRouter.post('/start', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    if (!(0, simulationSandbox_1.isSimulationSandbox)()) {
        try {
            return await proxyToSandbox(req, res, 'post', '/simulations/start', req.body || {});
        }
        catch (e) {
            return res.status(502).json({ error: 'sandbox_proxy_failed', message: String(e?.message || e), sandboxServer: (0, sandboxServerManager_1.getSandboxServerStatus)() });
        }
    }
    try {
        (0, simulationSandbox_1.assertSimulationSandbox)();
        const existing = await SimulationRun_1.SimulationRun.findOne({ status: 'running' }).lean();
        if (existing) {
            return res.status(409).json({ error: 'already_running', runId: String(existing._id) });
        }
        const { teachers, subAdmins, durationSec, scenario, template } = req.body || {};
        const t = Math.max(0, Math.min(200, Number(teachers) || 30));
        const s = Math.max(0, Math.min(50, Number(subAdmins) || 5));
        const d = Math.max(10, Math.min(60 * 30, Number(durationSec) || 120));
        const sc = String(scenario || 'mixed');
        let sandboxTemplateId = null;
        let templateName = null;
        if (template && typeof template === 'object') {
            const clean = { ...template };
            delete clean._id;
            delete clean.__v;
            templateName = String(clean.name || '') || null;
            const created = await GradebookTemplate_1.GradebookTemplate.create(clean);
            sandboxTemplateId = String(created._id);
        }
        const doc = await SimulationRun_1.SimulationRun.create({
            status: 'running',
            scenario: sc,
            startedAt: new Date(),
            requestedDurationSec: d,
            teachers: t,
            subAdmins: s,
            templateName: templateName || undefined,
            sandboxTemplateId: sandboxTemplateId || undefined,
            sandbox: true,
            sandboxMarker: String(process.env.SIMULATION_SANDBOX_MARKER || 'sandbox'),
            lastMetrics: {
                dbName: mongoose_1.default.connection?.db?.databaseName,
            }
        });
        const protocol = process.env.PUBLIC_API_PROTOCOL || 'http';
        const host = process.env.PUBLIC_API_HOST || 'localhost';
        const port = process.env.PORT || '4000';
        const baseUrl = `${protocol}://${host}:${port}`;
        (0, simulationRunner_1.runSimulation)({
            runId: String(doc._id),
            baseUrl,
            scenario: 'mixed',
            durationSec: d,
            teachers: t,
            subAdmins: s,
            templateId: sandboxTemplateId || undefined,
        }).catch(() => { });
        res.json({ ok: true, runId: String(doc._id) });
    }
    catch (e) {
        if (e?.code === 'simulation_not_allowed') {
            return res.status(403).json({ error: 'simulation_not_allowed', message: e.message });
        }
        res.status(500).json({ error: 'start_failed', message: String(e?.message || e) });
    }
});
exports.simulationsRouter.post('/stop', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    if (!(0, simulationSandbox_1.isSimulationSandbox)()) {
        try {
            return await proxyToSandbox(req, res, 'post', '/simulations/stop', req.body || {});
        }
        catch (e) {
            return res.status(502).json({ error: 'sandbox_proxy_failed', message: String(e?.message || e), sandboxServer: (0, sandboxServerManager_1.getSandboxServerStatus)() });
        }
    }
    const { runId } = req.body || {};
    const running = runId
        ? await SimulationRun_1.SimulationRun.findById(String(runId)).lean()
        : await SimulationRun_1.SimulationRun.findOne({ status: 'running' }).sort({ startedAt: -1 }).lean();
    if (!running)
        return res.status(404).json({ error: 'not_found' });
    await (0, simulationRunner_1.stopSimulation)(String(running._id));
    res.json({ ok: true });
});
