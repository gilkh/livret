"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const Class_1 = require("../models/Class");
exports.classesRouter = (0, express_1.Router)();
exports.classesRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { schoolYearId } = req.query;
    const list = await Class_1.ClassModel.find(schoolYearId ? { schoolYearId } : {}).lean();
    res.json(list);
});
exports.classesRouter.post('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { name, level, schoolYearId } = req.body;
    if (!name || !schoolYearId)
        return res.status(400).json({ error: 'missing_payload' });
    const c = await Class_1.ClassModel.create({ name, level, schoolYearId });
    res.json(c);
});
exports.classesRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    const c = await Class_1.ClassModel.findByIdAndUpdate(id, req.body, { new: true });
    res.json(c);
});
exports.classesRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    await Class_1.ClassModel.findByIdAndDelete(id);
    res.json({ ok: true });
});
