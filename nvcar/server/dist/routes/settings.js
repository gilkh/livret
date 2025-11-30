"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const Setting_1 = require("../models/Setting");
exports.settingsRouter = (0, express_1.Router)();
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
