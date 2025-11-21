"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schoolYearsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const SchoolYear_1 = require("../models/SchoolYear");
exports.schoolYearsRouter = (0, express_1.Router)();
exports.schoolYearsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const list = await SchoolYear_1.SchoolYear.find({}).sort({ startDate: -1 }).lean();
    res.json(list);
});
exports.schoolYearsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { name, startDate, endDate, active } = req.body;
    if (!name || !startDate || !endDate)
        return res.status(400).json({ error: 'missing_payload' });
    const year = await SchoolYear_1.SchoolYear.create({ name, startDate: new Date(startDate), endDate: new Date(endDate), active: active ?? true });
    res.json(year);
});
exports.schoolYearsRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    const data = { ...req.body };
    if (data.startDate)
        data.startDate = new Date(data.startDate);
    if (data.endDate)
        data.endDate = new Date(data.endDate);
    const year = await SchoolYear_1.SchoolYear.findByIdAndUpdate(id, data, { new: true });
    res.json(year);
});
exports.schoolYearsRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    await SchoolYear_1.SchoolYear.findByIdAndDelete(id);
    res.json({ ok: true });
});
