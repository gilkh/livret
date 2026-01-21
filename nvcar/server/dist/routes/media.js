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
const crypto_1 = __importDefault(require("crypto"));
const jszip_1 = __importDefault(require("jszip"));
const node_unrar_js_1 = require("node-unrar-js");
const auth_1 = require("../auth");
const pptxImporter_1 = require("../utils/pptxImporter");
const Student_1 = require("../models/Student");
const Enrollment_1 = require("../models/Enrollment");
const Class_1 = require("../models/Class");
const SchoolYear_1 = require("../models/SchoolYear");
const Level_1 = require("../models/Level");
const uuid_1 = require("uuid");
const ensureDir = (p) => { if (!fs_1.default.existsSync(p))
    fs_1.default.mkdirSync(p, { recursive: true }); };
const uploadDir = path_1.default.join(process.cwd(), 'public', 'uploads');
ensureDir(uploadDir);
const pendingStudentsDir = path_1.default.join(uploadDir, 'students-pending');
ensureDir(pendingStudentsDir);
const hashBuffer = (buffer) => crypto_1.default.createHash('sha256').update(buffer).digest('hex');
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
function findSimilarStudents(searchName, students, maxResults = 5, filenameBirthYear) {
    const searchNormalized = normalizeNameKey(searchName);
    const scored = students.map(s => {
        const fullName = normalizeNameKey(`${s.firstName} ${s.lastName}`);
        const reverseName = normalizeNameKey(`${s.lastName} ${s.firstName}`);
        const dist1 = levenshteinDistance(searchNormalized, fullName);
        const dist2 = levenshteinDistance(searchNormalized, reverseName);
        let distance = Math.min(dist1, dist2);
        // Boost score if birth year matches
        if (filenameBirthYear) {
            const studentYear = getStudentBirthYear(s);
            if (studentYear === filenameBirthYear) {
                distance = Math.max(0, distance - 2); // Reduce distance for year match
            }
        }
        return { student: s, distance };
    });
    return scored
        .filter(s => s.distance <= Math.max(5, searchNormalized.length * 0.4)) // Allow ~40% difference
        .sort((a, b) => a.distance - b.distance)
        .slice(0, maxResults)
        .map(s => ({ _id: String(s.student._id), name: `${s.student.firstName} ${s.student.lastName}`, distance: s.distance, birthYear: getStudentBirthYear(s.student) }));
}
// Remove accents from string (é→e, ç→c, etc.)
const removeAccents = (str) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};
// Normalize segment for level/class matching
const normalizeSegment = (segment) => removeAccents(segment).toLowerCase().replace(/[^a-z0-9]+/g, '');
// Normalize name for matching: remove accents, hyphens→spaces, lowercase, trim
const normalizeNameKey = (name) => {
    return removeAccents(name)
        .toLowerCase()
        .replace(/[-]+/g, ' ') // hyphens to spaces (Jean-Pierre → Jean Pierre)
        .replace(/[^a-z0-9]+/g, ' ') // remove special chars
        .replace(/\s+/g, ' ') // collapse multiple spaces
        .trim();
};
// Extract birth year from filename if present (e.g., Jean_Dupont_2018.jpg → 2018)
const extractBirthYear = (filename) => {
    const match = filename.match(/[_\s-](19\d{2}|20[0-2]\d)[_\s.-]?/);
    if (match)
        return parseInt(match[1], 10);
    // Also try at end of name before extension
    const endMatch = filename.match(/(19\d{2}|20[0-2]\d)$/);
    if (endMatch)
        return parseInt(endMatch[1], 10);
    return null;
};
// Get birth year from student DOB
const getStudentBirthYear = (student) => {
    if (!student.dateOfBirth)
        return null;
    const d = new Date(student.dateOfBirth);
    return isNaN(d.getTime()) ? null : d.getFullYear();
};
// Build student map with multiple key variants and track duplicates
const buildStudentMap = (students) => {
    const map = new Map();
    const duplicates = new Map();
    const addToMap = (key, student) => {
        if (!key)
            return;
        if (map.has(key)) {
            // Track as duplicate
            if (!duplicates.has(key))
                duplicates.set(key, [map.get(key)]);
            duplicates.get(key)?.push(student);
        }
        else {
            map.set(key, student);
        }
    };
    for (const s of students) {
        const firstName = normalizeNameKey(s.firstName || '');
        const lastName = normalizeNameKey(s.lastName || '');
        // logicalKey
        if (s.logicalKey)
            addToMap(s.logicalKey.toLowerCase(), s);
        // Standard name combinations
        const fl = `${firstName} ${lastName}`.trim();
        const lf = `${lastName} ${firstName}`.trim();
        addToMap(fl, s);
        addToMap(lf, s);
        // Underscore variants
        const fl_ = `${firstName}_${lastName}`.trim();
        const lf_ = `${lastName}_${firstName}`.trim();
        addToMap(fl_, s);
        addToMap(lf_, s);
        // No-space variants (JeanPierre instead of Jean Pierre)
        const flNoSpace = `${firstName}${lastName}`.replace(/\s/g, '');
        const lfNoSpace = `${lastName}${firstName}`.replace(/\s/g, '');
        addToMap(flNoSpace, s);
        addToMap(lfNoSpace, s);
        // With birth year suffix
        const birthYear = getStudentBirthYear(s);
        if (birthYear) {
            addToMap(`${fl} ${birthYear}`, s);
            addToMap(`${lf} ${birthYear}`, s);
            addToMap(`${fl}_${birthYear}`, s);
            addToMap(`${lf}_${birthYear}`, s);
        }
    }
    return { map, duplicates };
};
const savePendingPhoto = (entry) => {
    const ext = path_1.default.extname(entry.filename).toLowerCase();
    const pendingId = (0, uuid_1.v4)();
    const pendingFilename = `${pendingId}${ext}`;
    fs_1.default.writeFileSync(path_1.default.join(pendingStudentsDir, pendingFilename), entry.buffer);
    return pendingId;
};
const readZipEntries = async (archivePath) => {
    const data = fs_1.default.readFileSync(archivePath);
    const zip = await jszip_1.default.loadAsync(data);
    const entries = [];
    for (const [filename, file] of Object.entries(zip.files)) {
        if (file.dir)
            continue;
        const ext = path_1.default.extname(filename).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext))
            continue;
        if (filename.startsWith('__MACOSX') || filename.split('/').pop()?.startsWith('.'))
            continue;
        const buffer = await file.async('nodebuffer');
        entries.push({ filename, buffer });
    }
    return entries;
};
const readRarEntries = async (archivePath) => {
    const data = fs_1.default.readFileSync(archivePath);
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const extractor = await (0, node_unrar_js_1.createExtractorFromData)({ data: arrayBuffer });
    const list = extractor.getFileList();
    const headers = list?.fileHeaders ? Array.from(list.fileHeaders) : [];
    const entries = [];
    for (const header of headers) {
        const rawName = String(header?.name || '');
        const filename = rawName.replace(/\\/g, '/');
        const ext = path_1.default.extname(filename).toLowerCase();
        const isDir = header?.flags?.directory;
        if (isDir)
            continue;
        if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext))
            continue;
        if (filename.startsWith('__MACOSX') || filename.split('/').pop()?.startsWith('.'))
            continue;
        const extracted = extractor.extract({ files: [rawName] });
        const files = extracted?.files ? Array.from(extracted.files) : [];
        const file = files[0];
        if (!file || !file.extraction)
            continue;
        const buffer = Buffer.from(file.extraction);
        entries.push({ filename, buffer });
    }
    return entries;
};
exports.mediaRouter.post('/import-photos', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), upload.single('file'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'no_file' });
    const archivePath = req.file.path;
    const archiveExt = path_1.default.extname(req.file.originalname || req.file.filename).toLowerCase();
    if (!['.zip', '.rar'].includes(archiveExt)) {
        return res.status(400).json({ error: 'unsupported_archive' });
    }
    const studentsDir = path_1.default.join(uploadDir, 'students');
    ensureDir(studentsDir);
    // Optional: only match these student IDs (for targeted import of missing photos)
    const targetStudentIds = req.body?.targetStudentIds
        ? new Set(JSON.parse(req.body.targetStudentIds).map((id) => String(id)))
        : null;
    try {
        const allStudents = await Student_1.Student.find({}).lean();
        // If targeting specific students, filter the list for matching
        const targetStudents = targetStudentIds
            ? allStudents.filter(s => targetStudentIds.has(String(s._id)))
            : allStudents;
        const studentsById = new Map(allStudents.map(s => [String(s._id), s]));
        // Build map for target students (for direct matching)
        const { map: targetStudentMap, duplicates: targetDuplicates } = buildStudentMap(targetStudents);
        // Build map for ALL students (for similar name searches and class mismatch checks)
        const { map: allStudentMap, duplicates: allDuplicates } = buildStudentMap(allStudents);
        const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        const classQuery = activeYear ? { schoolYearId: String(activeYear._id) } : {};
        const classes = await Class_1.ClassModel.find(classQuery).lean();
        const classByName = new Map(classes.map(c => [String(c.name).toLowerCase(), c]));
        const classById = new Map(classes.map(c => [String(c._id), c]));
        const enrollQuery = activeYear ? { schoolYearId: String(activeYear._id) } : {};
        const enrollments = await Enrollment_1.Enrollment.find(enrollQuery).lean();
        const enrollByClass = new Map();
        const classByStudent = new Map();
        for (const enr of enrollments) {
            if (!enr.classId)
                continue;
            const key = String(enr.classId);
            if (!enrollByClass.has(key))
                enrollByClass.set(key, []);
            enrollByClass.get(key)?.push(String(enr.studentId));
            const cls = classById.get(key);
            if (cls)
                classByStudent.set(String(enr.studentId), cls);
        }
        const levelDocs = await Level_1.Level.find({}).lean();
        const levelNames = [...levelDocs.map(l => l.name), 'PS', 'MS', 'GS'];
        const levelLookup = new Map(levelNames.map(l => [normalizeSegment(l), l]));
        const entries = archiveExt === '.rar' ? await readRarEntries(archivePath) : await readZipEntries(archivePath);
        const report = [];
        let success = 0;
        let failed = 0;
        const classStudentMapCache = new Map();
        const resolveClassFromPath = (filePath) => {
            const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
            if (!segments.length)
                return null;
            let levelIndex = -1;
            for (let i = segments.length - 1; i >= 0; i--) {
                const normalized = normalizeSegment(segments[i]);
                if (levelLookup.has(normalized)) {
                    levelIndex = i;
                    break;
                }
            }
            if (levelIndex < 0)
                return { reason: 'level_not_found' };
            if (levelIndex + 1 >= segments.length) {
                const levelName = levelLookup.get(normalizeSegment(segments[levelIndex])) || segments[levelIndex];
                return { levelName, reason: 'class_not_found_in_path' };
            }
            const levelName = levelLookup.get(normalizeSegment(segments[levelIndex])) || segments[levelIndex];
            const classSegment = segments[levelIndex + 1];
            const classClean = classSegment.replace(/[_-]+/g, ' ').trim();
            const prefixedClass = `${levelName} ${classClean}`.trim();
            const exactClass = classByName.get(classClean.toLowerCase()) || classByName.get(prefixedClass.toLowerCase());
            if (!exactClass)
                return { levelName, className: prefixedClass, reason: 'class_not_found' };
            return { levelName, className: exactClass.name, classId: String(exactClass._id) };
        };
        for (const entry of entries) {
            const ext = path_1.default.extname(entry.filename).toLowerCase();
            const baseName = path_1.default.basename(entry.filename, ext).toLowerCase();
            const cleanName = normalizeNameKey(baseName);
            const underscoreName = baseName.replace(/[^a-z0-9]+/g, '_').trim();
            const classInfo = resolveClassFromPath(entry.filename);
            let candidateStudents = targetStudents;
            let studentMap = targetStudentMap;
            let duplicates = targetDuplicates;
            if (classInfo?.classId) {
                if (!classStudentMapCache.has(classInfo.classId)) {
                    const ids = enrollByClass.get(classInfo.classId) || [];
                    const classStudents = ids.map(id => studentsById.get(id)).filter(Boolean);
                    classStudentMapCache.set(classInfo.classId, buildStudentMap(classStudents));
                }
                const cached = classStudentMapCache.get(classInfo.classId);
                if (cached) {
                    studentMap = cached.map;
                    duplicates = cached.duplicates;
                }
                candidateStudents = Array.from(studentMap.values());
            }
            // Extract birth year from filename for disambiguation
            const filenameBirthYear = extractBirthYear(baseName);
            // Build all possible lookup keys
            const lookupKeys = [baseName, cleanName, underscoreName];
            if (filenameBirthYear) {
                lookupKeys.push(`${cleanName} ${filenameBirthYear}`);
                lookupKeys.push(`${cleanName}_${filenameBirthYear}`);
            }
            // Try to find student with all key variants
            let student = null;
            let matchedKey = '';
            for (const key of lookupKeys) {
                if (studentMap.has(key)) {
                    student = studentMap.get(key);
                    matchedKey = key;
                    break;
                }
            }
            // Check for multiple matches (duplicates)
            let multipleMatches = null;
            if (matchedKey && duplicates.has(matchedKey)) {
                multipleMatches = duplicates.get(matchedKey) || null;
            }
            if (classInfo?.reason === 'class_not_found' || classInfo?.reason === 'class_not_found_in_path') {
                failed++;
                report.push({
                    filename: entry.filename,
                    status: 'invalid_class',
                    reason: classInfo.reason,
                    className: classInfo.className,
                    level: classInfo.levelName
                });
                continue;
            }
            // Handle multiple matches - require review
            if (multipleMatches && multipleMatches.length > 1) {
                failed++;
                const pendingId = savePendingPhoto(entry);
                const similarStudents = multipleMatches.map(s => {
                    const cls = classByStudent.get(String(s._id));
                    return {
                        _id: s._id,
                        name: `${s.firstName} ${s.lastName}`,
                        distance: 0,
                        className: cls?.name,
                        level: cls?.level,
                        birthYear: getStudentBirthYear(s)
                    };
                });
                report.push({
                    filename: entry.filename,
                    status: 'needs_review',
                    reason: 'multiple_matches',
                    className: classInfo?.className,
                    level: classInfo?.levelName,
                    pendingId,
                    similarStudents
                });
                continue;
            }
            if (student) {
                const targetFilename = `${student.logicalKey}-${Date.now()}${ext}`;
                const targetPath = path_1.default.join(studentsDir, targetFilename);
                fs_1.default.writeFileSync(targetPath, entry.buffer);
                const avatarUrl = `/uploads/students/${targetFilename}`;
                const avatarHash = hashBuffer(entry.buffer);
                await Student_1.Student.findByIdAndUpdate(student._id, { avatarUrl, avatarHash });
                success++;
                report.push({
                    filename: entry.filename,
                    status: 'matched',
                    student: `${student.firstName} ${student.lastName}`,
                    className: classInfo?.className,
                    level: classInfo?.levelName
                });
            }
            else {
                failed++;
                if (classInfo?.classId) {
                    // Check if student exists in another class (within target students for targeted import)
                    const searchMap = targetStudentIds ? targetStudentMap : allStudentMap;
                    let globalExact = null;
                    for (const key of lookupKeys) {
                        if (searchMap.has(key)) {
                            globalExact = searchMap.get(key);
                            break;
                        }
                    }
                    if (globalExact && (!targetStudentIds || targetStudentIds.has(String(globalExact._id)))) {
                        const foundClass = classByStudent.get(String(globalExact._id));
                        const pendingId = savePendingPhoto(entry);
                        report.push({
                            filename: entry.filename,
                            status: 'needs_review',
                            reason: 'class_mismatch',
                            className: classInfo?.className,
                            level: classInfo?.levelName,
                            expectedClass: classInfo?.className,
                            foundClass: foundClass?.name,
                            pendingId,
                            similarStudents: [{
                                    _id: String(globalExact._id),
                                    name: `${globalExact.firstName} ${globalExact.lastName}`,
                                    distance: 0,
                                    className: foundClass?.name,
                                    level: foundClass?.level
                                }]
                        });
                        continue;
                    }
                    // Search within target students for similar names (if targeted import, only missing-photo students)
                    const searchPool = targetStudentIds ? targetStudents : allStudents;
                    const similarStudents = findSimilarStudents(baseName, searchPool, 5, filenameBirthYear).map(s => {
                        const cls = classByStudent.get(String(s._id));
                        return { ...s, className: cls?.name, level: cls?.level };
                    });
                    const pendingId = savePendingPhoto(entry);
                    report.push({
                        filename: entry.filename,
                        status: 'needs_review',
                        reason: 'no_match_in_class',
                        similarStudents,
                        className: classInfo?.className,
                        level: classInfo?.levelName,
                        pendingId
                    });
                    continue;
                }
                // Search within target students for similar names (if targeted import, only missing-photo students)
                const searchPool = targetStudentIds ? targetStudents : allStudents;
                const similarStudents = findSimilarStudents(baseName, searchPool, 5, filenameBirthYear).map(s => {
                    const cls = classByStudent.get(String(s._id));
                    return { ...s, className: cls?.name, level: cls?.level };
                });
                const pendingId = similarStudents.length ? savePendingPhoto(entry) : undefined;
                report.push({
                    filename: entry.filename,
                    status: 'no_match',
                    reason: classInfo?.reason || 'no_match',
                    similarStudents,
                    className: classInfo?.className,
                    level: classInfo?.levelName,
                    pendingId
                });
            }
        }
        try {
            fs_1.default.unlinkSync(archivePath);
        }
        catch (e) { }
        res.json({ success, failed, report });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'import_failed', details: e.message });
    }
});
exports.mediaRouter.post('/backfill-avatar-hashes', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const studentIds = Array.isArray(req.body?.studentIds)
            ? req.body.studentIds.map((id) => String(id))
            : null;
        const query = {
            avatarUrl: { $exists: true, $ne: '' },
            $or: [{ avatarHash: { $exists: false } }, { avatarHash: null }, { avatarHash: '' }]
        };
        if (studentIds?.length)
            query._id = { $in: studentIds };
        const students = await Student_1.Student.find(query).select('_id avatarUrl').lean();
        let updated = 0;
        let missingFile = 0;
        let skipped = 0;
        for (const student of students) {
            const rawUrl = String(student.avatarUrl || '');
            const normalizedUrl = rawUrl.split('?')[0];
            if (!normalizedUrl.startsWith('/uploads/')) {
                skipped++;
                continue;
            }
            const relPath = normalizedUrl.replace(/^\/uploads\//, '');
            const safeRelPath = path_1.default.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
            if (!safeRelPath || safeRelPath.startsWith('..') || path_1.default.isAbsolute(safeRelPath)) {
                skipped++;
                continue;
            }
            const filePath = path_1.default.join(uploadDir, safeRelPath);
            if (!fs_1.default.existsSync(filePath)) {
                missingFile++;
                continue;
            }
            const buffer = fs_1.default.readFileSync(filePath);
            const avatarHash = hashBuffer(buffer);
            await Student_1.Student.findByIdAndUpdate(student._id, { avatarHash });
            updated++;
        }
        res.json({ total: students.length, updated, missingFile, skipped });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'backfill_failed', details: e.message });
    }
});
exports.mediaRouter.post('/confirm-photo', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { pendingId, studentId } = req.body;
    if (!pendingId || !studentId)
        return res.status(400).json({ error: 'missing_payload' });
    try {
        const pendingFiles = fs_1.default.readdirSync(pendingStudentsDir);
        const pendingFile = pendingFiles.find(name => name.startsWith(String(pendingId)));
        if (!pendingFile)
            return res.status(404).json({ error: 'pending_not_found' });
        const ext = path_1.default.extname(pendingFile).toLowerCase();
        const student = await Student_1.Student.findById(studentId).lean();
        if (!student)
            return res.status(404).json({ error: 'student_not_found' });
        const targetFilename = `${student.logicalKey}-${Date.now()}${ext}`;
        const targetPath = path_1.default.join(uploadDir, 'students', targetFilename);
        ensureDir(path_1.default.join(uploadDir, 'students'));
        const pendingPath = path_1.default.join(pendingStudentsDir, pendingFile);
        const pendingBuffer = fs_1.default.readFileSync(pendingPath);
        fs_1.default.renameSync(pendingPath, targetPath);
        const avatarUrl = `/uploads/students/${targetFilename}`;
        const avatarHash = hashBuffer(pendingBuffer);
        await Student_1.Student.findByIdAndUpdate(studentId, { avatarUrl, avatarHash });
        res.json({ ok: true, url: avatarUrl, studentId });
    }
    catch (e) {
        res.status(500).json({ error: 'confirm_failed', details: e.message });
    }
});
