"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mediaRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const auth_1 = require("../auth");
const pptxImporter_1 = require("../utils/pptxImporter");
const ensureDir = (p) => { if (!fs_1.default.existsSync(p))
    fs_1.default.mkdirSync(p, { recursive: true }); };
const uploadDir = path_1.default.join(process.cwd(), 'public', 'uploads');
ensureDir(uploadDir);
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const base = path_1.default.basename(file.originalname, ext).replace(/[^a-z0-9_-]+/gi, '_');
        cb(null, `${base}-${Date.now()}${ext}`);
    },
});
const upload = (0, multer_1.default)({ storage });
exports.mediaRouter = (0, express_1.Router)();
exports.mediaRouter.post('/upload', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), upload.single('file'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'no_file' });
    const folder = req.query?.folder ? String(req.query.folder).replace(/[^a-z0-9_\/-]+/gi, '') : '';
    const destDir = path_1.default.join(uploadDir, folder);
    ensureDir(destDir);
    const destPath = path_1.default.join(destDir, req.file.filename);
    fs_1.default.renameSync(req.file.path, destPath);
    const url = `/uploads/${folder ? folder + '/' : ''}${req.file.filename}`;
    res.json({ url });
});
exports.mediaRouter.get('/list', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const folder = req.query?.folder ? String(req.query.folder).replace(/[^a-z0-9_\/-]+/gi, '') : '';
    const dir = path_1.default.join(uploadDir, folder);
    ensureDir(dir);
    const files = fs_1.default.readdirSync(dir).filter(f => !f.startsWith('.'));
    const urls = files.map(f => `${folder ? '/' + folder : ''}/${f}`);
    res.json(urls);
});
exports.mediaRouter.post('/mkdir', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { folder } = req.body;
    if (!folder)
        return res.status(400).json({ error: 'missing_folder' });
    const dir = path_1.default.join(uploadDir, String(folder).replace(/[^a-z0-9_\/-]+/gi, ''));
    ensureDir(dir);
    res.json({ ok: true });
});
exports.mediaRouter.post('/rename', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { from, to } = req.body;
    if (!from || !to)
        return res.status(400).json({ error: 'missing_payload' });
    const src = path_1.default.join(uploadDir, String(from).replace(/[^a-z0-9_\\/.-]+/gi, ''));
    const dst = path_1.default.join(uploadDir, String(to).replace(/[^a-z0-9_\\/.-]+/gi, ''));
    fs_1.default.renameSync(src, dst);
    res.json({ ok: true });
});
exports.mediaRouter.post('/delete', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { target } = req.body;
    if (!target)
        return res.status(400).json({ error: 'missing_target' });
    const p = path_1.default.join(uploadDir, String(target).replace(/[^a-z0-9_\\/.-]+/gi, ''));
    if (fs_1.default.existsSync(p))
        fs_1.default.rmSync(p, { recursive: true, force: true });
    res.json({ ok: true });
});
const uploadMem = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
exports.mediaRouter.post('/convert-emf', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), uploadMem.single('file'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'no_file' });
    const ext = path_1.default.extname(req.file.originalname).toLowerCase();
    if (ext !== '.emf' && ext !== '.wmf')
        return res.status(400).json({ error: 'unsupported_format' });
    const baseUrl = process.env.API_URL || 'http://localhost:4000';
    const importer = new pptxImporter_1.PptxImporter(path_1.default.join(uploadDir, 'media'), baseUrl);
    const out = await importer.convertEmfWmf(req.file.buffer, ext);
    if (!out)
        return res.status(500).json({ error: 'conversion_failed' });
    const nameBase = path_1.default.basename(req.file.originalname, ext).replace(/[^a-z0-9_-]+/gi, '_');
    const filename = `${nameBase}-${Date.now()}.png`;
    const savePath = path_1.default.join(uploadDir, 'media', filename);
    fs_1.default.writeFileSync(savePath, out, { encoding: null });
    res.json({ url: `/uploads/media/${filename}` });
});
