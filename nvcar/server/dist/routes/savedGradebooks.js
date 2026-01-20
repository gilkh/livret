"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savedGradebooksRouter = void 0;
const express_1 = require("express");
const SavedGradebook_1 = require("../models/SavedGradebook");
const SchoolYear_1 = require("../models/SchoolYear");
const RoleScope_1 = require("../models/RoleScope");
const Student_1 = require("../models/Student");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const auth_1 = require("../auth");
exports.savedGradebooksRouter = (0, express_1.Router)();
exports.savedGradebooksRouter.get('/exited/years', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const user = req.user;
        let allowedLevels = null;
        if (user.role === 'SUBADMIN' || user.role === 'AEFE') {
            const scope = await RoleScope_1.RoleScope.findOne({ userId: user.userId }).lean();
            allowedLevels = scope?.levels || [];
        }
        const candidates = await Student_1.Student.find({
            $or: [
                { status: 'left' },
                { promotions: { $elemMatch: { toLevel: { $regex: /^eb1$/i } } } },
                { nextLevel: { $regex: /^eb1$/i } },
            ],
        }).select('_id promotions').lean();
        const exits = candidates
            .map(s => {
            const promos = Array.isArray(s.promotions) ? s.promotions : [];
            const exitPromos = promos
                .filter((p) => String(p?.toLevel || '').toLowerCase() === 'eb1')
                .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
            const exitPromo = exitPromos[0];
            if (!exitPromo?.schoolYearId)
                return null;
            return {
                studentId: String(s._id),
                yearId: String(exitPromo.schoolYearId),
                fromLevel: String(exitPromo.fromLevel || ''),
            };
        })
            .filter(Boolean);
        if (exits.length === 0)
            return res.json([]);
        const yearIds = [...new Set(exits.map(e => e.yearId))];
        const savedForExitYear = await SavedGradebook_1.SavedGradebook.find({
            schoolYearId: { $in: yearIds },
            studentId: { $in: exits.map(e => e.studentId) },
        })
            .select('studentId schoolYearId level')
            .lean();
        const exitLevelByStudentYear = new Map();
        savedForExitYear.forEach(sg => {
            const key = `${String(sg.studentId)}|${String(sg.schoolYearId)}`;
            if (!exitLevelByStudentYear.has(key))
                exitLevelByStudentYear.set(key, String(sg.level || ''));
        });
        const filtered = allowedLevels
            ? exits.filter(e => {
                if (e.fromLevel && allowedLevels.includes(e.fromLevel))
                    return true;
                const key = `${e.studentId}|${e.yearId}`;
                const lvl = exitLevelByStudentYear.get(key) || '';
                return lvl ? allowedLevels.includes(lvl) : false;
            })
            : exits;
        const filteredYearIds = [...new Set(filtered.map(e => e.yearId))];
        if (filteredYearIds.length === 0)
            return res.json([]);
        const years = await SchoolYear_1.SchoolYear.find({ _id: { $in: filteredYearIds } })
            .select('name')
            .sort({ name: -1 })
            .lean();
        const countsByYear = filtered.reduce((acc, e) => {
            acc[e.yearId] = (acc[e.yearId] || 0) + 1;
            return acc;
        }, {});
        res.json(years.map(y => ({
            _id: y._id,
            name: y.name,
            count: countsByYear[String(y._id)] || 0,
        })));
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
exports.savedGradebooksRouter.get('/exited/years/:yearId/students', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const { yearId } = req.params;
        const user = req.user;
        let allowedLevels = null;
        if (user.role === 'SUBADMIN' || user.role === 'AEFE') {
            const scope = await RoleScope_1.RoleScope.findOne({ userId: user.userId }).lean();
            allowedLevels = scope?.levels || [];
        }
        const candidates = await Student_1.Student.find({
            promotions: { $elemMatch: { schoolYearId: yearId, toLevel: { $regex: /^eb1$/i } } },
        })
            .select('_id firstName lastName promotions')
            .lean();
        if (candidates.length === 0)
            return res.json([]);
        const studentIds = candidates.map(s => String(s._id));
        const savedForExitYear = await SavedGradebook_1.SavedGradebook.find({ schoolYearId: yearId, studentId: { $in: studentIds } })
            .select('studentId schoolYearId level')
            .lean();
        const exitLevelByStudent = new Map();
        savedForExitYear.forEach(sg => {
            const sid = String(sg.studentId);
            if (!exitLevelByStudent.has(sid))
                exitLevelByStudent.set(sid, String(sg.level || ''));
        });
        const out = candidates
            .map(s => {
            const promos = Array.isArray(s.promotions) ? s.promotions : [];
            const exitPromo = promos
                .filter((p) => String(p?.schoolYearId) === String(yearId) && String(p?.toLevel || '').toLowerCase() === 'eb1')
                .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0];
            const sid = String(s._id);
            const fromLevel = String(exitPromo?.fromLevel || '');
            const exitLevel = fromLevel || exitLevelByStudent.get(sid) || '';
            return {
                studentId: sid,
                firstName: s.firstName,
                lastName: s.lastName,
                exitLevel,
            };
        })
            .filter(s => {
            if (!allowedLevels)
                return true;
            return s.exitLevel ? allowedLevels.includes(s.exitLevel) : false;
        })
            .sort((a, b) => String(a.lastName || '').localeCompare(String(b.lastName || '')));
        res.json(out);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
exports.savedGradebooksRouter.get('/student/:studentId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const { studentId } = req.params;
        const user = req.user;
        let allowedLevels = null;
        if (user.role === 'SUBADMIN' || user.role === 'AEFE') {
            const scope = await RoleScope_1.RoleScope.findOne({ userId: user.userId }).lean();
            allowedLevels = scope?.levels || [];
        }
        if (allowedLevels) {
            const student = await Student_1.Student.findById(studentId).select('promotions').lean();
            const promos = Array.isArray(student?.promotions) ? student.promotions : [];
            const exitPromo = promos
                .filter((p) => String(p?.toLevel || '').toLowerCase() === 'eb1')
                .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0];
            const exitYearId = exitPromo?.schoolYearId ? String(exitPromo.schoolYearId) : '';
            const fromLevel = String(exitPromo?.fromLevel || '');
            let ok = false;
            if (fromLevel && allowedLevels.includes(fromLevel))
                ok = true;
            if (!ok && exitYearId) {
                const sg = await SavedGradebook_1.SavedGradebook.findOne({ studentId, schoolYearId: exitYearId }).select('level').lean();
                if (sg && sg.level && allowedLevels.includes(String(sg.level)))
                    ok = true;
            }
            if (!ok)
                return res.status(403).json({ error: 'not_authorized' });
        }
        const saved = await SavedGradebook_1.SavedGradebook.find({ studentId })
            .select('_id schoolYearId level createdAt templateId')
            .sort({ createdAt: -1 })
            .lean();
        const yearIds = [...new Set(saved.map(s => String(s.schoolYearId)).filter(Boolean))];
        const years = yearIds.length
            ? await SchoolYear_1.SchoolYear.find({ _id: { $in: yearIds } }).select('name').lean()
            : [];
        const yearMap = new Map(years.map(y => [String(y._id), String(y.name || '')]));
        res.json(saved.map(s => ({
            _id: s._id,
            schoolYearId: s.schoolYearId,
            yearName: yearMap.get(String(s.schoolYearId)) || '',
            level: s.level,
            createdAt: s.createdAt,
            templateId: s.templateId,
        })));
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// List years for "en cours" (students not promoted to EB1 yet)
exports.savedGradebooksRouter.get('/years', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const user = req.user;
        // Get all students who have saved gradebooks
        const savedGradebooks = await SavedGradebook_1.SavedGradebook.find({}).select('studentId schoolYearId').lean();
        const studentIds = [...new Set(savedGradebooks.map(sg => sg.studentId))];
        if (studentIds.length === 0) {
            return res.json([]);
        }
        // Get student data to filter based on promotion status
        const students = await Student_1.Student.find({ _id: { $in: studentIds } }).select('promotions status').lean();
        // Filter students who are NOT promoted to EB1 (i.e., still "en cours")
        const activeStudentIds = students.filter(student => {
            const promotions = Array.isArray(student.promotions) ? student.promotions : [];
            const hasEb1Promotion = promotions.some(p => String(p?.toLevel || '').toLowerCase() === 'eb1');
            const hasLeft = student.status === 'left';
            return !hasEb1Promotion && !hasLeft;
        }).map(s => String(s._id));
        // Get year IDs for active students only
        const activeYearIds = savedGradebooks
            .filter(sg => activeStudentIds.includes(sg.studentId))
            .map(sg => String(sg.schoolYearId));
        const years = await SchoolYear_1.SchoolYear.find({ _id: { $in: [...new Set(activeYearIds)] } })
            .select('name')
            .sort({ name: -1 })
            .lean();
        res.json(years);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// List levels for a year for "en cours" (students not promoted to EB1 yet)
exports.savedGradebooksRouter.get('/years/:yearId/levels', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
    const { yearId } = req.params;
    const user = req.user;
    let allowedLevels = null;
    if (user.role === 'SUBADMIN') {
        const scope = await RoleScope_1.RoleScope.findOne({ userId: user.userId }).lean();
        allowedLevels = scope?.levels || [];
    }
    try {
        // Get saved gradebooks for this year
        const savedGradebooks = await SavedGradebook_1.SavedGradebook.find({ schoolYearId: yearId }).select('studentId level').lean();
        const studentIds = [...new Set(savedGradebooks.map(sg => sg.studentId))];
        if (studentIds.length === 0) {
            return res.json([]);
        }
        // Get student data to filter based on promotion status
        const students = await Student_1.Student.find({ _id: { $in: studentIds } }).select('promotions status').lean();
        // Filter students who are NOT promoted to EB1 (i.e., still "en cours")
        const activeStudentIds = students.filter(student => {
            const promotions = Array.isArray(student.promotions) ? student.promotions : [];
            const hasEb1Promotion = promotions.some(p => String(p?.toLevel || '').toLowerCase() === 'eb1');
            const hasLeft = student.status === 'left';
            return !hasEb1Promotion && !hasLeft;
        }).map(s => String(s._id));
        // Get levels for active students only
        const activeLevels = savedGradebooks
            .filter(sg => activeStudentIds.includes(sg.studentId))
            .map(sg => sg.level || 'Sans niveau');
        // Normalize empty levels to 'Sans niveau' and deduplicate
        let normalizedLevels = Array.from(new Set(activeLevels));
        if (allowedLevels !== null) {
            normalizedLevels = normalizedLevels.filter(l => allowedLevels.includes(l));
        }
        res.json(normalizedLevels.sort());
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// List students for a year and level for "en cours" (students not promoted to EB1 yet)
exports.savedGradebooksRouter.get('/years/:yearId/levels/:level/students', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
    const { yearId, level } = req.params;
    const user = req.user;
    if (user.role === 'SUBADMIN') {
        const scope = await RoleScope_1.RoleScope.findOne({ userId: user.userId }).lean();
        const allowedLevels = scope?.levels || [];
        if (!allowedLevels.includes(level)) {
            return res.json([]);
        }
    }
    try {
        // Handle 'Sans niveau' mapping to empty string or 'Sans niveau'
        const levelQuery = level === 'Sans niveau' ? { $in: ['', 'Sans niveau'] } : level;
        const students = await SavedGradebook_1.SavedGradebook.find({ schoolYearId: yearId, level: levelQuery })
            .select('studentId data.student.firstName data.student.lastName createdAt')
            .lean();
        if (students.length === 0) {
            return res.json([]);
        }
        const studentIds = students.map(s => s.studentId);
        // Get student data to filter based on promotion status
        const studentDocs = await Student_1.Student.find({ _id: { $in: studentIds } }).select('promotions status').lean();
        const studentMap = new Map(studentDocs.map(s => [String(s._id), s]));
        // Filter students who are NOT promoted to EB1 (i.e., still "en cours")
        const activeStudents = students.filter(savedGradebook => {
            const student = studentMap.get(savedGradebook.studentId);
            if (!student)
                return false;
            const promotions = Array.isArray(student.promotions) ? student.promotions : [];
            const hasEb1Promotion = promotions.some(p => String(p?.toLevel || '').toLowerCase() === 'eb1');
            const hasLeft = student.status === 'left';
            return !hasEb1Promotion && !hasLeft;
        });
        // Map to a simpler structure
        const result = activeStudents.map(s => ({
            _id: s._id,
            studentId: s.studentId,
            firstName: s.data.student.firstName,
            lastName: s.data.student.lastName,
            createdAt: s.createdAt
        }));
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Get a specific saved gradebook
exports.savedGradebooksRouter.get('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const saved = await SavedGradebook_1.SavedGradebook.findById(id).lean();
    if (!saved)
        return res.status(404).json({ error: 'not_found' });
    if (user?.role === 'TEACHER') {
        const classId = String(saved.classId || '');
        if (!classId)
            return res.status(403).json({ error: 'not_authorized' });
        const ok = await TeacherClassAssignment_1.TeacherClassAssignment.exists({ teacherId: user.userId, classId });
        if (!ok)
            return res.status(403).json({ error: 'not_authorized' });
    }
    // NOTE: We intentionally do NOT patch missing snapshot data from live assignments anymore.
    // SavedGradebook snapshots must be self-contained; if historical snapshots are missing data,
    // a migration/repair script should be used instead of patching at read time.
    if (saved.data && saved.data.assignment && (!saved.data.assignment.data || Object.keys(saved.data.assignment.data).length === 0)) {
        console.warn(`[SavedGradebook] Incomplete snapshot for ${id}. Returning as-is without patching.`);
    }
    res.json(saved);
});
// Get all students with their gradebook history (for admin gradebooks page)
// Returns current students and archived (EB1) students separately
exports.savedGradebooksRouter.get('/admin/all-students', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { schoolYearId } = req.query;
        // Get all saved gradebooks with essential info
        const query = {};
        if (schoolYearId && typeof schoolYearId === 'string') {
            query.schoolYearId = schoolYearId;
        }
        const allSaved = await SavedGradebook_1.SavedGradebook.find(query)
            .select('studentId schoolYearId level meta createdAt templateId')
            .lean();
        if (allSaved.length === 0) {
            return res.json({ current: [], archived: [] });
        }
        const studentIds = [...new Set(allSaved.map(sg => sg.studentId))];
        // Get all students
        const students = await Student_1.Student.find({ _id: { $in: studentIds } })
            .select('firstName lastName level promotions status avatarUrl')
            .lean();
        const studentMap = new Map(students.map(s => [String(s._id), s]));
        // Get all school years
        const yearIds = [...new Set(allSaved.map(sg => sg.schoolYearId).filter(Boolean))];
        const years = await SchoolYear_1.SchoolYear.find({ _id: { $in: yearIds } }).select('name').lean();
        const yearMap = new Map(years.map(y => [String(y._id), y.name]));
        // Group saved gradebooks by student
        const gradebooksByStudent = new Map();
        allSaved.forEach(sg => {
            const sid = sg.studentId;
            if (!gradebooksByStudent.has(sid))
                gradebooksByStudent.set(sid, []);
            gradebooksByStudent.get(sid).push({
                _id: sg._id,
                schoolYearId: sg.schoolYearId,
                yearName: yearMap.get(sg.schoolYearId) || '',
                level: sg.level,
                snapshotReason: sg.meta?.snapshotReason || 'unknown',
                createdAt: sg.createdAt,
                templateId: sg.templateId
            });
        });
        // Categorize students
        const current = [];
        const archived = [];
        studentIds.forEach(sid => {
            const student = studentMap.get(sid);
            if (!student)
                return;
            const promotions = Array.isArray(student.promotions) ? student.promotions : [];
            const isArchived = promotions.some((p) => String(p?.toLevel || '').toLowerCase() === 'eb1') || student.status === 'left';
            const gradebooks = gradebooksByStudent.get(sid) || [];
            // Sort by createdAt desc
            gradebooks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            // Group gradebooks by year
            const byYear = {};
            gradebooks.forEach(gb => {
                const yearKey = gb.schoolYearId || 'unknown';
                if (!byYear[yearKey])
                    byYear[yearKey] = [];
                byYear[yearKey].push(gb);
            });
            // Transform to year array with S1/S2 info
            const yearsData = Object.entries(byYear).map(([yearId, gbs]) => {
                const yearName = yearMap.get(yearId) || 'Année inconnue';
                const s1 = gbs.find(g => g.snapshotReason === 'sem1' || g.snapshotReason === 'manual');
                const s2 = gbs.find(g => g.snapshotReason === 'year_end' || g.snapshotReason === 'promotion' || g.snapshotReason === 'exit');
                const level = gbs[0]?.level || '';
                return {
                    yearId,
                    yearName,
                    level,
                    s1: s1 ? { _id: s1._id, createdAt: s1.createdAt } : null,
                    s2: s2 ? { _id: s2._id, createdAt: s2.createdAt } : null,
                    allSnapshots: gbs
                };
            }).sort((a, b) => b.yearName.localeCompare(a.yearName));
            const entry = {
                studentId: sid,
                firstName: student.firstName,
                lastName: student.lastName,
                currentLevel: student.level,
                avatarUrl: student.avatarUrl,
                years: yearsData
            };
            if (isArchived) {
                // Find exit info
                const exitPromo = promotions
                    .filter((p) => String(p?.toLevel || '').toLowerCase() === 'eb1')
                    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0];
                entry.exitedAt = exitPromo?.date || null;
                entry.exitedFromLevel = exitPromo?.fromLevel || null;
                archived.push(entry);
            }
            else {
                current.push(entry);
            }
        });
        // Sort by name
        current.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
        archived.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
        res.json({ current, archived });
    }
    catch (e) {
        console.error('admin/all-students error:', e);
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
