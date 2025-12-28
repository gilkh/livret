"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsRouter = void 0;
exports.getSmtpSettings = getSmtpSettings;
exports.createSmtpTransporter = createSmtpTransporter;
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const auth_1 = require("../auth");
const Setting_1 = require("../models/Setting");
const simulationSandbox_1 = require("../utils/simulationSandbox");
exports.settingsRouter = (0, express_1.Router)();
// Helper to get SMTP settings from database
async function getSmtpSettings() {
    const settings = await Setting_1.Setting.find({
        key: { $in: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure'] }
    }).lean();
    const map = {};
    settings.forEach(s => { map[s.key] = s.value; });
    return {
        host: map.smtp_host || '',
        port: parseInt(map.smtp_port) || 587,
        user: map.smtp_user || '',
        pass: map.smtp_pass || '',
        secure: map.smtp_secure === true
    };
}
// Helper to create nodemailer transporter
async function createSmtpTransporter() {
    const smtp = await getSmtpSettings();
    if (!smtp.host || !smtp.user || !smtp.pass) {
        return null;
    }
    return nodemailer_1.default.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
            user: smtp.user,
            pass: smtp.pass
        }
    });
}
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
// Test SMTP connection
exports.settingsRouter.post('/smtp/test', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { host, port, user, pass, secure, testEmail } = req.body;
        if (!host || !user || !pass) {
            return res.status(400).json({ success: false, error: 'Configuration SMTP incomplète' });
        }
        const transporter = nodemailer_1.default.createTransport({
            host,
            port: parseInt(port) || 587,
            secure: secure === true,
            auth: { user, pass }
        });
        // Verify connection
        await transporter.verify();
        // Send test email if address provided
        if (testEmail) {
            await transporter.sendMail({
                from: user,
                to: testEmail,
                subject: 'Test SMTP - NVCAR',
                text: 'Ce message confirme que la configuration SMTP fonctionne correctement.',
                html: '<h2>Test SMTP réussi</h2><p>Ce message confirme que la configuration SMTP fonctionne correctement.</p>'
            });
            return res.json({ success: true, message: 'Email de test envoyé avec succès' });
        }
        res.json({ success: true, message: 'Connexion SMTP vérifiée avec succès' });
    }
    catch (err) {
        console.error('SMTP test error:', err);
        res.status(400).json({
            success: false,
            error: err.message || 'Erreur de connexion SMTP'
        });
    }
});
