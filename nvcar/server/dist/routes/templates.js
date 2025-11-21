"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.templatesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const pptxImporter_1 = require("../utils/pptxImporter");
exports.templatesRouter = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
exports.templatesRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const list = await GradebookTemplate_1.GradebookTemplate.find({}).lean();
    res.json(list);
});
exports.templatesRouter.post('/import-pptx', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), upload.single('file'), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'missing_file' });
        const uploadDir = path_1.default.join(process.cwd(), 'public', 'uploads', 'media');
        const importer = new pptxImporter_1.PptxImporter(uploadDir);
        const templateData = await importer.parse(req.file.buffer);
        // Create the template in DB
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({
            ...templateData,
            createdBy: req.user.userId,
            updatedAt: new Date(),
            status: 'draft'
        });
        res.json(tpl);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'import_failed', message: e.message });
    }
});
exports.templatesRouter.post('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
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
exports.templatesRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
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
