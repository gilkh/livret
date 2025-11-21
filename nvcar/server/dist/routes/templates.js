"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.templatesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
exports.templatesRouter = (0, express_1.Router)();
exports.templatesRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const list = await GradebookTemplate_1.GradebookTemplate.find({}).lean();
    res.json(list);
});
exports.templatesRouter.post('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const { name, pages, variables, watermark, permissions, status, exportPassword } = req.body || {};
        if (!name)
            return res.status(400).json({ error: 'missing_name' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name, pages: Array.isArray(pages) ? pages : [], variables: variables || {}, watermark, permissions, status: status || 'draft', exportPassword, createdBy: req.user.userId, updatedAt: new Date() });
        res.json(tpl);
    }
    catch (e) {
        res.status(500).json({ error: 'create_failed', message: e.message });
    }
});
exports.templatesRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const { _id, __v, createdBy, updatedAt, shareId, versions, comments, ...rest } = req.body || {};
        const data = { ...rest, updatedAt: new Date() };
        if (rest.pages && !Array.isArray(rest.pages))
            data.pages = [];
        const tpl = await GradebookTemplate_1.GradebookTemplate.findByIdAndUpdate(id, data, { new: true });
        res.json(tpl);
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
exports.templatesRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    await GradebookTemplate_1.GradebookTemplate.findByIdAndDelete(id);
    res.json({ ok: true });
});
