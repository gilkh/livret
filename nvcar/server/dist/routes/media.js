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
const jszip_1 = __importDefault(require("jszip"));
const auth_1 = require("../auth");
const pptxImporter_1 = require("../utils/pptxImporter");
const Student_1 = require("../models/Student");
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
    const items = fs_1.default.readdirSync(dir, { withFileTypes: true }).filter(f => !f.name.startsWith('.'));
    const result = items.map(d => ({
        name: d.name,
        type: d.isDirectory() ? 'folder' : 'file',
        path: `${folder ? '/' + folder : ''}/${d.name}`
    }));
    res.json(result);
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
// Helper function to find similar students using Levenshtein distance
function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++)
        matrix[i] = [i];
    for (let j = 0; j <= a.length; j++)
        matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
                ? matrix[i - 1][j - 1]
                : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
}
function findSimilarStudents(searchName, students, maxResults = 3) {
    const searchLower = searchName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const scored = students.map(s => {
        const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
        const reverseName = `${s.lastName} ${s.firstName}`.toLowerCase();
        const dist1 = levenshteinDistance(searchLower, fullName);
        const dist2 = levenshteinDistance(searchLower, reverseName);
        return { student: s, distance: Math.min(dist1, dist2) };
    });
    return scored
        .filter(s => s.distance <= Math.max(5, searchLower.length * 0.4)) // Allow ~40% difference
        .sort((a, b) => a.distance - b.distance)
        .slice(0, maxResults)
        .map(s => ({ _id: s.student._id, name: `${s.student.firstName} ${s.student.lastName}`, distance: s.distance }));
}
exports.mediaRouter.post('/import-photos', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), upload.single('file'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'no_file' });
    const zipPath = req.file.path;
    const studentsDir = path_1.default.join(uploadDir, 'students');
    ensureDir(studentsDir);
    try {
        const data = fs_1.default.readFileSync(zipPath);
        const zip = await jszip_1.default.loadAsync(data);
        const students = await Student_1.Student.find({}).lean();
        const studentMap = new Map();
        // Index students by various keys for fuzzy matching
        for (const s of students) {
            if (s.logicalKey)
                studentMap.set(s.logicalKey.toLowerCase(), s);
            // standard combinations
            const fl = `${s.firstName} ${s.lastName}`.toLowerCase();
            const lf = `${s.lastName} ${s.firstName}`.toLowerCase();
            const fl_ = `${s.firstName}_${s.lastName}`.toLowerCase();
            const lf_ = `${s.lastName}_${s.firstName}`.toLowerCase();
            // Only set if not already set (to avoid ambiguity? or just overwrite?)
            // If ambiguous, maybe we shouldn't map. But for now last one wins or first one.
            if (!studentMap.has(fl))
                studentMap.set(fl, s);
            if (!studentMap.has(lf))
                studentMap.set(lf, s);
            if (!studentMap.has(fl_))
                studentMap.set(fl_, s);
            if (!studentMap.has(lf_))
                studentMap.set(lf_, s);
        }
        const report = [];
        let success = 0;
        let failed = 0;
        for (const [filename, file] of Object.entries(zip.files)) {
            if (file.dir)
                continue;
            const ext = path_1.default.extname(filename).toLowerCase();
            if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext))
                continue;
            // Ignore __MACOSX and hidden files
            if (filename.startsWith('__MACOSX') || filename.split('/').pop()?.startsWith('.'))
                continue;
            const baseName = path_1.default.basename(filename, ext).toLowerCase();
            // Normalize baseName: remove extra spaces, replace separators
            const cleanName = baseName.replace(/[^a-z0-9]+/g, ' ').trim();
            const underscoreName = baseName.replace(/[^a-z0-9]+/g, '_').trim();
            let student = studentMap.get(baseName) || studentMap.get(cleanName) || studentMap.get(underscoreName);
            if (student) {
                // Extract file
                const buffer = await file.async('nodebuffer');
                const targetFilename = `${student.logicalKey}-${Date.now()}${ext}`;
                const targetPath = path_1.default.join(studentsDir, targetFilename);
                fs_1.default.writeFileSync(targetPath, buffer);
                const avatarUrl = `/uploads/students/${targetFilename}`;
                await Student_1.Student.findByIdAndUpdate(student._id, { avatarUrl });
                success++;
                report.push({ filename, status: 'matched', student: `${student.firstName} ${student.lastName}` });
            }
            else {
                failed++;
                // Find similar students for manual assignment
                const similarStudents = findSimilarStudents(baseName, students);
                report.push({ filename, status: 'no_match', similarStudents });
            }
        }
        // Cleanup zip file
        try {
            fs_1.default.unlinkSync(zipPath);
        }
        catch (e) { }
        res.json({ success, failed, report });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'import_failed', details: e.message });
    }
});
