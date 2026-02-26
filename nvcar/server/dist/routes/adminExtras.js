"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminExtrasRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const User_1 = require("../models/User");
const Class_1 = require("../models/Class");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const SchoolYear_1 = require("../models/SchoolYear");
const Enrollment_1 = require("../models/Enrollment");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const SystemAlert_1 = require("../models/SystemAlert");
const RoleScope_1 = require("../models/RoleScope");
const SubAdminAssignment_1 = require("../models/SubAdminAssignment");
const OutlookUser_1 = require("../models/OutlookUser");
const TemplateSignature_1 = require("../models/TemplateSignature");
const Student_1 = require("../models/Student");
const AdminSignature_1 = require("../models/AdminSignature");
const signatureService_1 = require("../services/signatureService");
const templateUtils_1 = require("../utils/templateUtils");
const signatureSnapshot_1 = require("../utils/signatureSnapshot");
const rolloverService_1 = require("../services/rolloverService");
const StudentCompetencyStatus_1 = require("../models/StudentCompetencyStatus");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const promises_1 = __importDefault(require("fs/promises"));
const multer_1 = __importDefault(require("multer"));
const socket_1 = require("../socket");
exports.adminExtrasRouter = (0, express_1.Router)();
const ensureDir = (p) => { if (!(0, fs_1.existsSync)(p))
    (0, fs_1.mkdirSync)(p, { recursive: true }); };
const psSignatureUploadDir = path_1.default.join(process.cwd(), 'public', 'uploads', 'ps-signatures');
ensureDir(psSignatureUploadDir);
const psSignatureStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, psSignatureUploadDir),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const base = path_1.default.basename(file.originalname, ext).replace(/[^a-z0-9_-]+/gi, '_');
        cb(null, `${base}-${Date.now()}${ext}`);
    },
});
const psSignatureUpload = (0, multer_1.default)({ storage: psSignatureStorage });
// 1. Progress (All Classes)
exports.adminExtrasRouter.get('/progress', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!activeYear)
            return res.status(400).json({ error: 'no_active_year' });
        // --- Classes Progress ---
        const classes = await Class_1.ClassModel.find({ schoolYearId: String(activeYear._id) }).lean();
        const classIds = classes.map(c => String(c._id));
        const teacherAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean();
        const teacherIds = [...new Set(teacherAssignments.map(ta => ta.teacherId))];
        const [users, outlookUsers] = await Promise.all([
            User_1.User.find({ _id: { $in: teacherIds } }).lean(),
            OutlookUser_1.OutlookUser.find({ _id: { $in: teacherIds } }).lean()
        ]);
        const allTeachers = [...users, ...outlookUsers];
        const teacherMap = new Map(allTeachers.map(t => [String(t._id), t]));
        const enrollments = await Enrollment_1.Enrollment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id),
            status: { $ne: 'archived' }
        }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds }
        }).lean();
        const templateIds = [...new Set(assignments.map(a => a.templateId))];
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).lean();
        const templateMap = new Map(templates.map(t => [String(t._id), t]));
        const teacherAssignmentsByClassId = new Map();
        for (const ta of teacherAssignments) {
            const classId = String(ta.classId);
            if (!teacherAssignmentsByClassId.has(classId))
                teacherAssignmentsByClassId.set(classId, []);
            teacherAssignmentsByClassId.get(classId).push(ta);
        }
        const studentToClassId = new Map();
        for (const e of enrollments) {
            if (e.studentId && e.classId)
                studentToClassId.set(String(e.studentId), String(e.classId));
        }
        const assignmentsByClassId = new Map();
        for (const a of assignments) {
            const classId = studentToClassId.get(String(a.studentId));
            if (!classId)
                continue;
            if (!assignmentsByClassId.has(classId))
                assignmentsByClassId.set(classId, []);
            assignmentsByClassId.get(classId).push(a);
        }
        const classesResult = classes.map(cls => {
            const clsId = String(cls._id);
            const clsTeacherAssignments = teacherAssignmentsByClassId.get(clsId) || [];
            const clsTeachers = clsTeacherAssignments.map(ta => {
                const t = teacherMap.get(String(ta.teacherId));
                return t?.displayName || t?.email || 'Unknown';
            });
            // Categorize teachers
            const polyvalentTeachers = [];
            const englishTeachers = [];
            const arabicTeachers = [];
            clsTeacherAssignments.forEach(ta => {
                const t = teacherMap.get(String(ta.teacherId));
                const teacherName = t?.displayName || t?.email || 'Unknown';
                const langs = (ta.languages || []).map((l) => String(l).toLowerCase());
                if (ta.isProfPolyvalent) {
                    polyvalentTeachers.push(teacherName);
                }
                if (langs.includes('ar') || langs.includes('lb')) {
                    arabicTeachers.push(teacherName);
                }
                if (langs.includes('en') || langs.includes('uk') || langs.includes('gb')) {
                    englishTeachers.push(teacherName);
                }
            });
            const clsEnrollments = enrollments.filter(e => String(e.classId) === clsId);
            const clsStudentIds = new Set(clsEnrollments.map(e => String(e.studentId)));
            const clsAssignments = assignmentsByClassId.get(clsId) || [];
            let totalCompetencies = 0;
            let filledCompetencies = 0;
            const categoryStats = {};
            clsAssignments.forEach(assignment => {
                const templateId = String(assignment.templateId);
                const template = templateMap.get(templateId);
                if (!template)
                    return;
                const assignmentData = assignment.data || {};
                const level = cls.level;
                const teacherCompletions = (assignment.teacherCompletions || []);
                const completionMemo = new Map();
                const isCategoryCompleted = (categoryName, langCode) => {
                    const key = `${categoryName}|${langCode || ''}`;
                    if (completionMemo.has(key))
                        return completionMemo.get(key);
                    const l = categoryName.toLowerCase();
                    const code = (langCode || '').toLowerCase();
                    const isArabic = code === 'ar' || code === 'lb' || l.includes('arabe') || l.includes('arabic') || l.includes('العربية');
                    const isEnglish = code === 'en' || code === 'uk' || code === 'gb' || l.includes('anglais') || l.includes('english');
                    let responsibleTeachers = clsTeacherAssignments
                        .filter((ta) => {
                        const langs = (ta.languages || []).map((tl) => String(tl).toLowerCase());
                        if (isArabic) {
                            if (langs.length === 0)
                                return !ta.isProfPolyvalent;
                            return langs.some((v) => v === 'ar' || v === 'lb' || v.includes('arabe') || v.includes('arabic') || v.includes('العربية'));
                        }
                        if (isEnglish) {
                            if (langs.length === 0)
                                return !ta.isProfPolyvalent;
                            return langs.some((v) => v === 'en' || v === 'uk' || v === 'gb' || v.includes('anglais') || v.includes('english'));
                        }
                        return !!ta.isProfPolyvalent;
                    })
                        .map((ta) => String(ta.teacherId));
                    if (responsibleTeachers.length === 0) {
                        responsibleTeachers = (assignment.assignedTeachers || []).map(id => String(id));
                    }
                    const completed = responsibleTeachers.some(tid => teacherCompletions.some(tc => String(tc.teacherId) === String(tid) &&
                        (tc.completed || tc.completedSem1 || tc.completedSem2)));
                    completionMemo.set(key, completed);
                    return completed;
                };
                template.pages.forEach((page, pageIdx) => {
                    (page.blocks || []).forEach((block, blockIdx) => {
                        let itemsToProcess = [];
                        if (['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                            const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null;
                            const keyStable = blockId ? `language_toggle_${blockId}` : null;
                            const keyLegacy = `language_toggle_${pageIdx}_${blockIdx}`;
                            const overrideItems = (keyStable ? assignmentData[keyStable] : null) || assignmentData[keyLegacy];
                            itemsToProcess = overrideItems || block.props.items || [];
                        }
                        else if (block.type === 'table' && block.props.expandedRows) {
                            const rows = block.props.cells || [];
                            const expandedLanguages = block.props.expandedLanguages || [];
                            const rowLanguages = block.props.rowLanguages || {};
                            const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : [];
                            const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null;
                            rows.forEach((_, ri) => {
                                const rowId = typeof rowIds?.[ri] === 'string' && rowIds[ri].trim() ? rowIds[ri].trim() : null;
                                const keyStable = blockId && rowId ? `table_${blockId}_row_${rowId}` : null;
                                const keyLegacy1 = `table_${pageIdx}_${blockIdx}_row_${ri}`;
                                const keyLegacy2 = `table_${blockIdx}_row_${ri}`;
                                const rowLangs = rowLanguages[ri] || expandedLanguages;
                                const currentItems = (keyStable ? assignmentData[keyStable] : null) || assignmentData[keyLegacy1] || assignmentData[keyLegacy2] || rowLangs || [];
                                if (Array.isArray(currentItems)) {
                                    itemsToProcess.push(...currentItems);
                                }
                            });
                        }
                        if (itemsToProcess.length === 0)
                            return;
                        itemsToProcess.forEach((item) => {
                            let isAssigned = true;
                            let itemLevels = item.levels && Array.isArray(item.levels) ? item.levels : [];
                            if (itemLevels.length === 0 && item.level)
                                itemLevels = [item.level];
                            if (itemLevels.length > 0) {
                                if (!level || !itemLevels.includes(level)) {
                                    isAssigned = false;
                                }
                            }
                            if (!isAssigned)
                                return;
                            const code = (item.code || '').toLowerCase();
                            const rawLang = item.type || item.label || '';
                            const lang = (() => {
                                const ll = String(rawLang).toLowerCase();
                                if (code === 'fr' || ll.includes('français') || ll.includes('french'))
                                    return 'Polyvalent';
                                if (code === 'ar' || code === 'lb' || ll.includes('arabe') || ll.includes('arabic') || ll.includes('العربية'))
                                    return 'Arabe';
                                if (code === 'en' || code === 'uk' || code === 'gb' || ll.includes('anglais') || ll.includes('english'))
                                    return 'Anglais';
                                return 'Autre';
                            })();
                            if (!categoryStats[lang])
                                categoryStats[lang] = { total: 0, filled: 0, name: lang };
                            categoryStats[lang].total++;
                            totalCompetencies++;
                            if (isCategoryCompleted(lang, code) || item.active) {
                                categoryStats[lang].filled++;
                                filledCompetencies++;
                            }
                        });
                    });
                });
            });
            return {
                classId: clsId,
                className: cls.name,
                level: cls.level,
                teachers: clsTeachers,
                studentCount: clsStudentIds.size,
                progress: {
                    total: totalCompetencies,
                    filled: filledCompetencies,
                    percentage: totalCompetencies > 0 ? Math.round((filledCompetencies / totalCompetencies) * 100) : 0
                },
                teachersCheck: {
                    polyvalent: polyvalentTeachers,
                    english: englishTeachers,
                    arabic: arabicTeachers,
                    hasPolyvalent: polyvalentTeachers.length > 0,
                    hasEnglish: englishTeachers.length > 0,
                    hasArabic: arabicTeachers.length > 0
                },
                byCategory: Object.values(categoryStats).map(stat => ({
                    name: stat.name,
                    total: stat.total,
                    filled: stat.filled,
                    percentage: stat.total > 0 ? Math.round((stat.filled / stat.total) * 100) : 0
                }))
            };
        });
        // --- Sub-Admin Progress ---
        const subAdmins = await User_1.User.find({ role: 'SUBADMIN' }).lean();
        const subAdminProgress = await Promise.all(subAdmins.map(async (sa) => {
            const saId = String(sa._id);
            // Get assigned levels from RoleScope
            const scope = await RoleScope_1.RoleScope.findOne({ userId: saId }).lean();
            const assignedLevels = scope?.levels || [];
            // Get directly assigned teachers
            const directAssignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId: saId }).lean();
            const assignedTeacherIds = [...new Set(directAssignments.map(da => String(da.teacherId)))];
            // Find classes matching levels OR teachers
            // 1. By Level
            const levelClasses = await Class_1.ClassModel.find({
                level: { $in: assignedLevels },
                schoolYearId: String(activeYear._id)
            }).lean();
            // 2. By Teacher
            const teacherClassesAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({
                teacherId: { $in: assignedTeacherIds },
                schoolYearId: String(activeYear._id)
            }).lean();
            const teacherClassIds = teacherClassesAssignments.map(tca => tca.classId);
            const teacherClasses = await Class_1.ClassModel.find({ _id: { $in: teacherClassIds } }).lean();
            // Merge unique classes
            const allRelevantClasses = [...levelClasses, ...teacherClasses];
            const uniqueClassIds = [...new Set(allRelevantClasses.map(c => String(c._id)))];
            // Find students in these classes
            const saEnrollments = await Enrollment_1.Enrollment.find({
                classId: { $in: uniqueClassIds },
                schoolYearId: String(activeYear._id),
                status: { $ne: 'archived' }
            }).lean();
            const saStudentIds = [...new Set(saEnrollments.map(e => String(e.studentId)))];
            // Find assignments for these students
            const saAssignments = await TemplateAssignment_1.TemplateAssignment.find({
                studentId: { $in: saStudentIds }
            }).lean();
            const totalAssignments = saAssignments.length;
            const saAssignmentIds = saAssignments.map(a => String(a._id));
            const signatures = saAssignmentIds.length
                ? await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: { $in: saAssignmentIds }, subAdminId: saId }).lean()
                : [];
            const signedAssignments = new Set(signatures.map(s => String(s.templateAssignmentId))).size;
            return {
                subAdminId: saId,
                displayName: sa.displayName,
                assignedLevels,
                assignedTeacherCount: assignedTeacherIds.length,
                totalStudents: saStudentIds.length,
                totalAssignments,
                signedAssignments,
                percentage: totalAssignments > 0 ? Math.round((signedAssignments / totalAssignments) * 100) : 0
            };
        }));
        res.json({ classes: classesResult, subAdmins: subAdminProgress });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch progress' });
    }
});
// 2. Online Users
exports.adminExtrasRouter.get('/online-users', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const [users, outlookUsers] = await Promise.all([
            User_1.User.find({ lastActive: { $gte: fiveMinutesAgo } })
                .select('displayName role lastActive email')
                .lean(),
            OutlookUser_1.OutlookUser.find({ lastLogin: { $gte: fiveMinutesAgo } })
                .select('displayName role lastLogin email')
                .lean(),
        ]);
        const normalizedOutlookUsers = outlookUsers.map((u) => ({
            _id: u._id,
            displayName: u.displayName || u.email || 'Utilisateur Microsoft',
            email: u.email,
            role: u.role,
            lastActive: u.lastLogin,
        }));
        const normalizedUsers = users.map((u) => ({
            _id: u._id,
            displayName: u.displayName || u.email || 'Utilisateur',
            email: u.email,
            role: u.role,
            lastActive: u.lastActive,
        }));
        const allOnlineUsers = [...normalizedUsers, ...normalizedOutlookUsers]
            .filter(u => !!u.lastActive)
            .sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
        res.json(allOnlineUsers);
    }
    catch (e) {
        res.status(500).json({ error: 'failed' });
    }
});
// 3. Alerts
exports.adminExtrasRouter.post('/alert', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { message, duration, type } = req.body;
        await SystemAlert_1.SystemAlert.updateMany({}, { active: false }); // Deactivate old alerts
        if (message) {
            const alertData = {
                message,
                type: type === 'success' ? 'success' : 'warning',
                createdBy: req.user.userId,
                active: true
            };
            if (duration && !isNaN(Number(duration))) {
                alertData.expiresAt = new Date(Date.now() + Number(duration) * 60 * 1000);
            }
            const createdAlert = await SystemAlert_1.SystemAlert.create(alertData);
            (0, socket_1.emitSystemAlertUpdate)({
                _id: String(createdAlert._id),
                message: createdAlert.message,
                type: createdAlert.type === 'success' ? 'success' : 'warning',
                expiresAt: createdAlert.expiresAt ? new Date(createdAlert.expiresAt).toISOString() : undefined,
            });
        }
        else {
            (0, socket_1.emitSystemAlertUpdate)(null);
        }
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'failed' });
    }
});
exports.adminExtrasRouter.post('/alert/stop', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { duration } = req.body || {};
        await SystemAlert_1.SystemAlert.updateMany({ active: true }, { active: false });
        const cancelDurationMinutes = !isNaN(Number(duration)) && Number(duration) > 0 ? Number(duration) : 5;
        const cancelNotice = await SystemAlert_1.SystemAlert.create({
            message: 'La maintenance a été annulée. Le système reste pleinement opérationnel, sauf communication d’un nouvel avis.',
            type: 'success',
            createdBy: req.user.userId,
            active: true,
            expiresAt: new Date(Date.now() + cancelDurationMinutes * 60 * 1000),
        });
        (0, socket_1.emitSystemAlertUpdate)({
            _id: String(cancelNotice._id),
            message: cancelNotice.message,
            type: 'success',
            expiresAt: cancelNotice.expiresAt ? new Date(cancelNotice.expiresAt).toISOString() : undefined,
        });
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'failed' });
    }
});
exports.adminExtrasRouter.get('/alert', async (req, res) => {
    try {
        const alert = await SystemAlert_1.SystemAlert.findOne({ active: true }).sort({ createdAt: -1 }).lean();
        if (alert && alert.expiresAt && new Date() > new Date(alert.expiresAt)) {
            await SystemAlert_1.SystemAlert.updateOne({ _id: alert._id }, { active: false });
            return res.json(null);
        }
        res.json(alert);
    }
    catch (e) {
        res.status(500).json({ error: 'failed' });
    }
});
// 4. Logout All
exports.adminExtrasRouter.post('/logout-all', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        // Increment tokenVersion for all non-admins
        await User_1.User.updateMany({ role: { $ne: 'ADMIN' } }, { $inc: { tokenVersion: 1 } });
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'failed' });
    }
});
// 5. Permissions
exports.adminExtrasRouter.get('/subadmins', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const subadmins = await User_1.User.find({ role: 'SUBADMIN' }).select('displayName email bypassScopes').lean();
        res.json(subadmins);
    }
    catch (e) {
        res.status(500).json({ error: 'failed' });
    }
});
exports.adminExtrasRouter.post('/permissions', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { userId, bypassScopes } = req.body;
        await User_1.User.findByIdAndUpdate(userId, { bypassScopes });
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'failed' });
    }
});
// Admin: Get ALL gradebooks for active year
exports.adminExtrasRouter.get('/all-gradebooks', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        // Get active school year
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!activeSchoolYear) {
            return res.json([]);
        }
        // Get ALL classes for active year
        const classes = await Class_1.ClassModel.find({ schoolYearId: activeSchoolYear._id }).lean();
        const classIds = classes.map(c => String(c._id));
        const classMap = new Map(classes.map(c => [String(c._id), c]));
        // Get ALL enrollments
        const enrollments = await Enrollment_1.Enrollment.find({ classId: { $in: classIds } }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        const studentClassMap = new Map(enrollments.map(e => [String(e.studentId), String(e.classId)]));
        // Get ALL template assignments
        const templateAssignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds },
        }).lean();
        // Get signature information
        const assignmentIds = templateAssignments.map(a => String(a._id));
        const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } }).lean();
        const signatureMap = new Map();
        signatures.forEach(s => {
            if (!signatureMap.has(s.templateAssignmentId)) {
                signatureMap.set(s.templateAssignmentId, []);
            }
            signatureMap.get(s.templateAssignmentId).push(s);
        });
        // Enrich
        const enrichedAssignments = await Promise.all(templateAssignments.map(async (assignment) => {
            const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
            const student = await Student_1.Student.findById(assignment.studentId).lean();
            const assignmentSignatures = signatureMap.get(String(assignment._id)) || [];
            const signature = assignmentSignatures.length > 0 ? assignmentSignatures[0] : null;
            const classId = studentClassMap.get(String(assignment.studentId));
            const classInfo = classId ? classMap.get(classId) : null;
            return {
                ...assignment,
                template,
                student,
                signature,
                signatures: assignmentSignatures,
                className: classInfo?.name,
                level: classInfo?.level,
            };
        }));
        res.json(enrichedAssignments);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Helper: Extract toggle items from a block + assignment data (shared by summary & batch-update)
function extractToggleItems(block, blockIdx, pageIdx, assignmentData) {
    const results = [];
    const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null;
    if (['language_toggle', 'language_toggle_v2'].includes(block?.type)) {
        const keyStable = blockId ? `language_toggle_${blockId}` : null;
        const keyLegacy = `language_toggle_${pageIdx}_${blockIdx}`;
        const items = (keyStable ? assignmentData[keyStable] : null) || assignmentData[keyLegacy] || block?.props?.items;
        if (Array.isArray(items) && items.length > 0) {
            results.push({ key: keyStable || keyLegacy, items });
        }
    }
    else if (block?.type === 'table' && block?.props?.expandedRows) {
        const rows = block?.props?.cells || [];
        const expandedLanguages = block?.props?.expandedLanguages || [];
        const rowLanguages = block?.props?.rowLanguages || {};
        const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : [];
        rows.forEach((_, ri) => {
            const rowId = typeof rowIds?.[ri] === 'string' && rowIds[ri].trim() ? rowIds[ri].trim() : null;
            const keyStable = blockId && rowId ? `table_${blockId}_row_${rowId}` : null;
            const keyLegacy1 = `table_${pageIdx}_${blockIdx}_row_${ri}`;
            const keyLegacy2 = `table_${blockIdx}_row_${ri}`;
            const rowLangs = rowLanguages[ri] || expandedLanguages;
            const currentItems = (keyStable ? assignmentData[keyStable] : null) || assignmentData[keyLegacy1] || assignmentData[keyLegacy2] || rowLangs || [];
            if (Array.isArray(currentItems) && currentItems.length > 0) {
                results.push({ key: keyStable || keyLegacy1, items: currentItems });
            }
        });
    }
    return results;
}
// Admin: Batch update gradebook toggle items by class or level
exports.adminExtrasRouter.post('/gradebooks/toggles/batch-update', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const scopeTypeRaw = String(req.body?.scopeType || '').trim().toLowerCase();
        const scopeValueRaw = String(req.body?.scopeValue || '').trim();
        const toggleLevelRaw = String(req.body?.toggleLevel || '').trim().toUpperCase();
        const levelRelationRaw = String(req.body?.levelRelation || 'all').trim().toLowerCase();
        const languageCategoryRaw = String(req.body?.languageCategory || 'all').trim().toLowerCase();
        const schoolYearIdRaw = String(req.body?.schoolYearId || '').trim();
        const active = req.body?.active;
        if (!['class', 'level'].includes(scopeTypeRaw)) {
            return res.status(400).json({ error: 'invalid_scope_type' });
        }
        if (!scopeValueRaw) {
            return res.status(400).json({ error: 'missing_scope_value' });
        }
        if (!toggleLevelRaw) {
            return res.status(400).json({ error: 'missing_toggle_level' });
        }
        if (typeof active !== 'boolean') {
            return res.status(400).json({ error: 'invalid_active_flag' });
        }
        if (!['all', 'current', 'past'].includes(levelRelationRaw)) {
            return res.status(400).json({ error: 'invalid_level_relation' });
        }
        if (!['all', 'poly', 'arabic', 'english'].includes(languageCategoryRaw)) {
            return res.status(400).json({ error: 'invalid_language_category' });
        }
        const targetYear = schoolYearIdRaw
            ? await SchoolYear_1.SchoolYear.findById(schoolYearIdRaw).lean()
            : await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!targetYear) {
            return res.status(400).json({ error: 'school_year_not_found' });
        }
        const schoolYearId = String(targetYear._id);
        let classDocs = [];
        if (scopeTypeRaw === 'class') {
            const classDoc = await Class_1.ClassModel.findOne({ _id: scopeValueRaw, schoolYearId }).lean();
            if (!classDoc) {
                return res.status(404).json({ error: 'class_not_found' });
            }
            classDocs = [classDoc];
        }
        else {
            const normalizedLevel = scopeValueRaw.toUpperCase();
            classDocs = await Class_1.ClassModel.find({ schoolYearId, level: normalizedLevel }).lean();
        }
        const classIds = classDocs.map(c => String(c._id));
        const classIdCandidates = [...classIds, ...classDocs.map(c => c._id)];
        const classLevelById = new Map(classDocs.map(c => [String(c._id), String(c.level || '').toUpperCase()]));
        const levels = await Level_1.Level.find({}).sort({ order: 1 }).lean();
        const levelOrder = new Map();
        levels.forEach((level, index) => {
            const key = String(level?.name || '').trim().toUpperCase();
            if (!key)
                return;
            const ord = Number.isFinite(Number(level?.order)) ? Number(level.order) : index + 1;
            levelOrder.set(key, ord);
        });
        if (classIds.length === 0) {
            return res.json({
                success: true,
                schoolYearId,
                scopeType: scopeTypeRaw,
                scopeValue: scopeValueRaw,
                toggleLevel: toggleLevelRaw,
                active,
                matchedClasses: 0,
                matchedStudents: 0,
                matchedAssignments: 0,
                updatedAssignments: 0,
                updatedToggleBlocks: 0,
                updatedItems: 0,
            });
        }
        const enrollments = await Enrollment_1.Enrollment.find({
            classId: { $in: classIdCandidates },
            status: { $nin: ['archived', 'left'] }
        }).select('studentId classId').lean();
        const studentIds = Array.from(new Set(enrollments.map(e => String(e.studentId)).filter(Boolean)));
        const studentClassLevel = new Map();
        enrollments.forEach(enrollment => {
            const studentId = String(enrollment?.studentId || '');
            const classId = String(enrollment?.classId || '');
            if (!studentId || !classId)
                return;
            const classLevel = classLevelById.get(classId) || '';
            studentClassLevel.set(studentId, classLevel);
        });
        if (studentIds.length === 0) {
            return res.json({
                success: true,
                schoolYearId,
                scopeType: scopeTypeRaw,
                scopeValue: scopeValueRaw,
                toggleLevel: toggleLevelRaw,
                active,
                matchedClasses: classIds.length,
                matchedStudents: 0,
                matchedAssignments: 0,
                updatedAssignments: 0,
                updatedToggleBlocks: 0,
                updatedItems: 0,
            });
        }
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ studentId: { $in: studentIds } })
            .select('_id studentId templateId templateVersion data')
            .lean();
        if (assignments.length === 0) {
            return res.json({
                success: true,
                schoolYearId,
                scopeType: scopeTypeRaw,
                scopeValue: scopeValueRaw,
                toggleLevel: toggleLevelRaw,
                active,
                matchedClasses: classIds.length,
                matchedStudents: studentIds.length,
                matchedAssignments: 0,
                updatedAssignments: 0,
                updatedToggleBlocks: 0,
                updatedItems: 0,
            });
        }
        const templateIds = Array.from(new Set(assignments.map(a => String(a.templateId))));
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).select('pages currentVersion versionHistory').lean();
        const templateMap = new Map(templates.map(t => [String(t._id), t]));
        const toUpper = (value) => String(value || '').trim().toUpperCase();
        const classifyLanguage = (item) => {
            const code = String(item?.code || item?.lang || '').trim().toLowerCase();
            const label = String(item?.label || item?.type || '').toLowerCase();
            if (code === 'fr' || code === 'fra' || label.includes('français') || label.includes('french'))
                return 'poly';
            if (code === 'ar' || code === 'ara' || code === 'arab' || code === 'lb' || label.includes('arabe') || label.includes('arabic') || label.includes('العربية'))
                return 'arabic';
            if (code === 'en' || code === 'eng' || code === 'uk' || code === 'gb' || label.includes('anglais') || label.includes('english'))
                return 'english';
            return 'other';
        };
        const classifyLevelRelation = (item, assignmentLevel) => {
            const assignment = String(assignmentLevel || '').trim().toUpperCase();
            const itemLevels = [];
            if (Array.isArray(item?.levels)) {
                item.levels.forEach((value) => {
                    const normalized = String(value || '').trim().toUpperCase();
                    if (normalized)
                        itemLevels.push(normalized);
                });
            }
            if (typeof item?.level === 'string') {
                const normalized = String(item.level).trim().toUpperCase();
                if (normalized)
                    itemLevels.push(normalized);
            }
            const uniqueLevels = Array.from(new Set(itemLevels));
            if (!assignment || uniqueLevels.length === 0)
                return 'current';
            if (uniqueLevels.includes(assignment))
                return 'current';
            const assignmentOrder = levelOrder.get(assignment);
            if (!Number.isFinite(assignmentOrder))
                return 'past';
            const hasPast = uniqueLevels.some(level => {
                const levelOrd = levelOrder.get(level);
                return Number.isFinite(levelOrd) && Number(levelOrd) < Number(assignmentOrder);
            });
            return hasPast ? 'past' : 'current';
        };
        const shouldUpdateItem = (item, assignmentLevel) => {
            if (!item || typeof item !== 'object')
                return false;
            if (toggleLevelRaw === 'ALL')
                return true;
            const normalizedLevels = [];
            if (Array.isArray(item.levels)) {
                for (const level of item.levels) {
                    const normalized = toUpper(level);
                    if (normalized)
                        normalizedLevels.push(normalized);
                }
            }
            if (typeof item.level === 'string') {
                const normalized = toUpper(item.level);
                if (normalized)
                    normalizedLevels.push(normalized);
            }
            const levelMatch = normalizedLevels.length === 0
                ? assignmentLevel === toggleLevelRaw
                : normalizedLevels.includes(toggleLevelRaw);
            if (!levelMatch)
                return false;
            const relation = classifyLevelRelation(item, assignmentLevel);
            const language = classifyLanguage(item);
            if (levelRelationRaw !== 'all' && relation !== levelRelationRaw)
                return false;
            if (languageCategoryRaw !== 'all' && language !== languageCategoryRaw)
                return false;
            return true;
        };
        const operations = [];
        let updatedAssignments = 0;
        let updatedToggleBlocks = 0;
        let updatedItems = 0;
        for (const assignment of assignments) {
            const templateRaw = templateMap.get(String(assignment.templateId));
            const template = templateRaw ? (0, templateUtils_1.getVersionedTemplate)(templateRaw, assignment.templateVersion) : null;
            const templatePages = Array.isArray(template?.pages) ? template.pages : [];
            const assignmentData = assignment.data && typeof assignment.data === 'object'
                ? { ...assignment.data }
                : {};
            let assignmentChanged = false;
            templatePages.forEach((page, pageIndex) => {
                const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
                blocks.forEach((block, blockIndex) => {
                    const extracted = extractToggleItems(block, blockIndex, pageIndex, assignmentData);
                    if (extracted.length === 0)
                        return;
                    const assignmentLevel = String(studentClassLevel.get(String(assignment.studentId)) || '').toUpperCase();
                    for (const { key, items } of extracted) {
                        let blockChanged = false;
                        const nextItems = items.map((item) => {
                            if (!shouldUpdateItem(item, assignmentLevel))
                                return item;
                            if (item?.active === active)
                                return item;
                            blockChanged = true;
                            updatedItems += 1;
                            return { ...item, active };
                        });
                        if (!blockChanged)
                            continue;
                        assignmentData[key] = nextItems;
                        assignmentChanged = true;
                        updatedToggleBlocks += 1;
                    }
                });
            });
            if (!assignmentChanged)
                continue;
            updatedAssignments += 1;
            operations.push({
                updateOne: {
                    filter: { _id: assignment._id },
                    update: {
                        $set: { data: assignmentData },
                        $inc: { dataVersion: 1 }
                    }
                }
            });
        }
        if (operations.length > 0) {
            await TemplateAssignment_1.TemplateAssignment.bulkWrite(operations);
        }
        return res.json({
            success: true,
            schoolYearId,
            scopeType: scopeTypeRaw,
            scopeValue: scopeValueRaw,
            toggleLevel: toggleLevelRaw,
            levelRelation: levelRelationRaw,
            languageCategory: languageCategoryRaw,
            active,
            matchedClasses: classIds.length,
            matchedStudents: studentIds.length,
            matchedAssignments: assignments.length,
            updatedAssignments,
            updatedToggleBlocks,
            updatedItems,
        });
    }
    catch (e) {
        return res.status(500).json({ error: 'batch_toggle_update_failed', message: e.message });
    }
});
// Admin: Get toggle summary counts by class and level
exports.adminExtrasRouter.get('/gradebooks/toggles/summary', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const schoolYearIdRaw = String(req.query?.schoolYearId || '').trim();
        const toggleLevelRaw = String(req.query?.toggleLevel || 'ALL').trim().toUpperCase();
        const targetYear = schoolYearIdRaw
            ? await SchoolYear_1.SchoolYear.findById(schoolYearIdRaw).lean()
            : await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!targetYear) {
            return res.status(400).json({ error: 'school_year_not_found' });
        }
        const schoolYearId = String(targetYear._id);
        const classDocs = await Class_1.ClassModel.find({ schoolYearId }).lean();
        const classIds = classDocs.map(c => String(c._id));
        const classIdCandidates = [...classIds, ...classDocs.map(c => c._id)];
        const classLevelById = new Map(classDocs.map(c => [String(c._id), String(c.level || '').toUpperCase()]));
        const levelsMeta = await Level_1.Level.find({}).sort({ order: 1 }).lean();
        const levelOrder = new Map();
        levelsMeta.forEach((level, index) => {
            const key = String(level?.name || '').trim().toUpperCase();
            if (!key)
                return;
            const ord = Number.isFinite(Number(level?.order)) ? Number(level.order) : index + 1;
            levelOrder.set(key, ord);
        });
        if (classIds.length === 0) {
            return res.json({
                schoolYearId,
                toggleLevel: toggleLevelRaw,
                classes: [],
                levels: [],
                classMatrix: [],
                totals: { on: 0, total: 0, off: 0 }
            });
        }
        const enrollments = await Enrollment_1.Enrollment.find({
            classId: { $in: classIdCandidates },
            status: { $nin: ['archived', 'left'] }
        }).select('studentId classId').lean();
        const studentClassMap = new Map();
        enrollments.forEach(enrollment => {
            if (!enrollment?.studentId || !enrollment?.classId)
                return;
            studentClassMap.set(String(enrollment.studentId), String(enrollment.classId));
        });
        const studentIds = Array.from(studentClassMap.keys());
        if (studentIds.length === 0) {
            const emptyClasses = classDocs.map(cls => ({
                classId: String(cls._id),
                className: cls.name,
                level: cls.level || '',
                on: 0,
                total: 0,
                off: 0
            }));
            return res.json({
                schoolYearId,
                toggleLevel: toggleLevelRaw,
                classes: emptyClasses,
                levels: [],
                classMatrix: [],
                totals: { on: 0, total: 0, off: 0 }
            });
        }
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ studentId: { $in: studentIds } })
            .select('studentId templateId templateVersion data')
            .lean();
        const templateIds = Array.from(new Set(assignments.map(a => String(a.templateId))));
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).select('pages currentVersion versionHistory').lean();
        const templateMap = new Map(templates.map(t => [String(t._id), t]));
        const classMetaById = new Map();
        classDocs.forEach(cls => {
            classMetaById.set(String(cls._id), {
                className: cls.name,
                level: cls.level || ''
            });
        });
        const countersByClass = new Map();
        classIds.forEach(classId => countersByClass.set(classId, { on: 0, total: 0 }));
        // Matrix: per class → per item-level → per language → { on, total }
        const matrixByClass = new Map();
        classIds.forEach(classId => matrixByClass.set(classId, new Map()));
        const ensureLangBucket = () => ({
            poly: { on: 0, total: 0 },
            arabic: { on: 0, total: 0 },
            english: { on: 0, total: 0 },
        });
        const classifyLanguage = (item) => {
            const code = String(item?.code || item?.lang || '').trim().toLowerCase();
            const label = String(item?.label || item?.type || '').toLowerCase();
            if (code === 'fr' || code === 'fra' || label.includes('français') || label.includes('french'))
                return 'poly';
            if (code === 'ar' || code === 'ara' || code === 'arab' || code === 'lb' || label.includes('arabe') || label.includes('arabic') || label.includes('العربية'))
                return 'arabic';
            if (code === 'en' || code === 'eng' || code === 'uk' || code === 'gb' || label.includes('anglais') || label.includes('english'))
                return 'english';
            return 'other';
        };
        const shouldIncludeItem = (item, assignmentLevel) => {
            if (!item || typeof item !== 'object')
                return false;
            if (toggleLevelRaw === 'ALL')
                return true;
            const normalizedLevels = [];
            if (Array.isArray(item.levels)) {
                item.levels.forEach((value) => {
                    const normalized = String(value || '').trim().toUpperCase();
                    if (normalized)
                        normalizedLevels.push(normalized);
                });
            }
            if (typeof item.level === 'string') {
                const normalized = String(item.level).trim().toUpperCase();
                if (normalized)
                    normalizedLevels.push(normalized);
            }
            if (normalizedLevels.length === 0) {
                return assignmentLevel === toggleLevelRaw;
            }
            return normalizedLevels.includes(toggleLevelRaw);
        };
        for (const assignment of assignments) {
            const classId = studentClassMap.get(String(assignment.studentId));
            if (!classId)
                continue;
            const templateRaw = templateMap.get(String(assignment.templateId));
            const template = templateRaw ? (0, templateUtils_1.getVersionedTemplate)(templateRaw, assignment.templateVersion) : null;
            const templatePages = Array.isArray(template?.pages) ? template.pages : [];
            const assignmentData = assignment.data && typeof assignment.data === 'object' ? assignment.data : {};
            const classCounters = countersByClass.get(classId);
            if (!classCounters)
                continue;
            templatePages.forEach((page, pageIndex) => {
                const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
                blocks.forEach((block, blockIndex) => {
                    const extracted = extractToggleItems(block, blockIndex, pageIndex, assignmentData);
                    if (extracted.length === 0)
                        return;
                    const assignmentLevel = String(classLevelById.get(String(classId)) || '').toUpperCase();
                    for (const { items } of extracted) {
                        items.forEach((item) => {
                            if (!shouldIncludeItem(item, assignmentLevel))
                                return;
                            classCounters.total += 1;
                            if (item?.active === true)
                                classCounters.on += 1;
                            const language = classifyLanguage(item);
                            if (language === 'other')
                                return;
                            // Determine item's own level name
                            let itemLevel = assignmentLevel;
                            const itemLevels = [];
                            if (Array.isArray(item?.levels)) {
                                item.levels.forEach((v) => { const n = String(v || '').trim().toUpperCase(); if (n)
                                    itemLevels.push(n); });
                            }
                            if (typeof item?.level === 'string') {
                                const n = String(item.level).trim().toUpperCase();
                                if (n)
                                    itemLevels.push(n);
                            }
                            if (itemLevels.length > 0)
                                itemLevel = itemLevels[0];
                            const classMatrix = matrixByClass.get(String(classId));
                            if (!classMatrix)
                                return;
                            if (!classMatrix.has(itemLevel))
                                classMatrix.set(itemLevel, ensureLangBucket());
                            const bucket = classMatrix.get(itemLevel);
                            bucket[language].total += 1;
                            if (item?.active === true)
                                bucket[language].on += 1;
                        });
                    }
                });
            });
        }
        const classes = classIds.map(classId => {
            const counters = countersByClass.get(classId) || { on: 0, total: 0 };
            const meta = classMetaById.get(classId) || { className: classId, level: '' };
            const off = Math.max(counters.total - counters.on, 0);
            return {
                classId,
                className: meta.className,
                level: meta.level,
                on: counters.on,
                total: counters.total,
                off
            };
        }).sort((a, b) => a.className.localeCompare(b.className, 'fr', { sensitivity: 'base' }));
        const levelMap = new Map();
        classes.forEach(item => {
            const levelKey = String(item.level || 'Sans niveau');
            if (!levelMap.has(levelKey))
                levelMap.set(levelKey, { on: 0, total: 0 });
            const counters = levelMap.get(levelKey);
            counters.on += item.on;
            counters.total += item.total;
        });
        const levels = Array.from(levelMap.entries())
            .map(([level, counters]) => ({
            level,
            on: counters.on,
            total: counters.total,
            off: Math.max(counters.total - counters.on, 0)
        }))
            .sort((a, b) => a.level.localeCompare(b.level, 'fr', { sensitivity: 'base', numeric: true }));
        const classMatrix = classIds.map(classId => {
            const meta = classMetaById.get(classId) || { className: classId, level: '' };
            const rawMatrix = matrixByClass.get(classId) || new Map();
            const classLevel = String(meta.level || '').toUpperCase();
            const classLevelOrder = levelOrder.get(classLevel);
            // Build per-level breakdown with relation tag
            const byItemLevel = [];
            for (const [lvl, bucket] of rawMatrix.entries()) {
                const lvlOrder = levelOrder.get(lvl);
                let relation = 'current';
                if (classLevel && lvl !== classLevel && Number.isFinite(classLevelOrder) && Number.isFinite(lvlOrder)) {
                    if (Number(lvlOrder) < Number(classLevelOrder)) {
                        relation = 'past';
                    }
                    else if (Number(lvlOrder) > Number(classLevelOrder)) {
                        relation = 'future';
                    }
                }
                byItemLevel.push({ itemLevel: lvl, relation, ...bucket });
            }
            // Sort by level order
            byItemLevel.sort((a, b) => {
                const oa = levelOrder.get(a.itemLevel) ?? 99;
                const ob = levelOrder.get(b.itemLevel) ?? 99;
                return oa - ob;
            });
            return {
                classId,
                className: meta.className,
                level: meta.level,
                byItemLevel,
            };
        }).sort((a, b) => a.className.localeCompare(b.className, 'fr', { sensitivity: 'base' }));
        const totals = classes.reduce((acc, cls) => {
            acc.on += cls.on;
            acc.total += cls.total;
            return acc;
        }, { on: 0, total: 0 });
        return res.json({
            schoolYearId,
            toggleLevel: toggleLevelRaw,
            classes,
            levels,
            classMatrix,
            totals: {
                on: totals.on,
                total: totals.total,
                off: Math.max(totals.total - totals.on, 0)
            }
        });
    }
    catch (e) {
        return res.status(500).json({ error: 'toggle_summary_failed', message: e.message });
    }
});
// Admin: Sign gradebook (Unrestricted)
exports.adminExtrasRouter.post('/templates/:templateAssignmentId/sign', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        const { type = 'standard', signaturePeriodId, signatureSchoolYearId } = req.body;
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        let signatureLevel = '';
        const studentForSig = await Student_1.Student.findById(assignment.studentId).lean();
        if (studentForSig) {
            signatureLevel = studentForSig.level || '';
            const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
            if (activeSchoolYear) {
                const enrollment = await Enrollment_1.Enrollment.findOne({
                    studentId: assignment.studentId,
                    schoolYearId: activeSchoolYear._id,
                    status: 'active'
                }).lean();
                if (enrollment && enrollment.classId) {
                    const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
                    if (cls && cls.level)
                        signatureLevel = cls.level;
                }
            }
        }
        // Get active admin signature
        const activeSig = await AdminSignature_1.AdminSignature.findOne({ isActive: true }).lean();
        const signatureData = activeSig?.dataUrl;
        try {
            const signature = await (0, signatureService_1.signTemplateAssignment)({
                templateAssignmentId,
                signerId: adminId,
                type: type,
                signatureUrl: activeSig ? activeSig.dataUrl : undefined,
                signatureData,
                req,
                level: signatureLevel || undefined,
                signaturePeriodId,
                signatureSchoolYearId
            });
            res.json(signature);
        }
        catch (e) {
            if (e.message === 'already_signed')
                return res.status(400).json({ error: 'already_signed' });
            if (e.message === 'not_found')
                return res.status(404).json({ error: 'not_found' });
            throw e;
        }
    }
    catch (e) {
        res.status(500).json({ error: 'sign_failed', message: e.message });
    }
});
// Admin: Unsign gradebook
exports.adminExtrasRouter.delete('/templates/:templateAssignmentId/sign', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { templateAssignmentId } = req.params;
        const { type } = req.body;
        try {
            await (0, signatureService_1.unsignTemplateAssignment)({
                templateAssignmentId,
                signerId: req.user.userId,
                type,
                req
            });
            res.json({ success: true });
        }
        catch (e) {
            if (e.message === 'not_found')
                return res.status(404).json({ error: 'not_found' });
            throw e;
        }
    }
    catch (e) {
        res.status(500).json({ error: 'unsign_failed', message: e.message });
    }
});
// Admin: Update assignment data (Unrestricted)
exports.adminExtrasRouter.patch('/templates/:assignmentId/data', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { type, pageIndex, blockIndex, items, data } = req.body;
        // Get assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId);
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        if (type === 'language_toggle') {
            if (pageIndex === undefined || blockIndex === undefined || !items) {
                return res.status(400).json({ error: 'missing_payload' });
            }
            const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).select('pages').lean();
            const block = template?.pages?.[pageIndex]?.blocks?.[blockIndex];
            const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null;
            const keyStable = blockId ? `language_toggle_${blockId}` : `language_toggle_${pageIndex}_${blockIndex}`;
            // Update assignment data
            if (!assignment.data)
                assignment.data = {};
            assignment.data[keyStable] = items;
            assignment.markModified('data');
            await assignment.save();
            return res.json({ success: true });
        }
        else if (data) {
            // Generic data update (for dropdowns etc)
            if (!assignment.data)
                assignment.data = {};
            for (const key in data) {
                assignment.data[key] = data[key];
            }
            assignment.markModified('data');
            await assignment.save();
            return res.json({ success: true });
        }
        res.status(400).json({ error: 'unknown_update_type' });
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
// Admin: Get gradebook review data (Unrestricted)
exports.adminExtrasRouter.get('/templates/:templateAssignmentId/review', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { templateAssignmentId } = req.params;
        // Get the template assignment
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(templateAssignmentId).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
        const student = await Student_1.Student.findById(assignment.studentId).lean();
        const signature = await TemplateSignature_1.TemplateSignature.findOne({ templateAssignmentId, type: { $ne: 'end_of_year' } }).sort({ signedAt: -1 }).lean();
        const finalSignature = await TemplateSignature_1.TemplateSignature.findOne({ templateAssignmentId, type: 'end_of_year' }).lean();
        // Use centralized helper for versioning and data merging
        const versionedTemplate = (0, templateUtils_1.mergeAssignmentDataIntoTemplate)(template, assignment);
        // Check if signed by ME
        const isSignedByMe = !!(signature && String(signature.subAdminId) === String(adminId));
        // Get active semester
        const activeSchoolYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        const activeSemester = activeSchoolYear?.activeSemester || 1;
        // Check if promoted
        const isPromoted = student?.promotions?.some((p) => p.schoolYearId === String(activeSchoolYear?._id));
        // Enrich student with current class level and name for accurate display
        let level = student?.level || '';
        let className = '';
        if (student) {
            const enrollment = await Enrollment_1.Enrollment.findOne({ studentId: assignment.studentId, status: 'active' }).lean();
            if (enrollment && enrollment.classId) {
                const classDoc = await Class_1.ClassModel.findById(enrollment.classId).lean();
                if (classDoc) {
                    level = classDoc.level || level;
                    className = classDoc.name || '';
                }
            }
        }
        // Populate signatures into assignment.data.signatures for visibility checks
        const populatedAssignment = await (0, signatureService_1.populateSignatures)(assignment);
        res.json({
            template: versionedTemplate,
            student: { ...student, level, className },
            assignment: populatedAssignment,
            signature,
            finalSignature,
            canEdit: true,
            isPromoted,
            isSignedByMe,
            activeSemester
        });
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// ============================================================================
// PS-TO-MS ONBOARDING ENDPOINTS
// ============================================================================
const Level_1 = require("../models/Level");
const auditLogger_1 = require("../utils/auditLogger");
const readinessUtils_1 = require("../utils/readinessUtils");
// Helper: Get next level based on order
const normalizeLevel = (level) => String(level || '').toUpperCase();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const getFromLevelConfig = (fromLevelRaw) => {
    const normalized = normalizeLevel(fromLevelRaw || 'PS') || 'PS';
    const classLevels = normalized === 'PS' ? ['PS', 'TPS'] : [normalized];
    const levelVariants = Array.from(new Set(classLevels.flatMap(l => [l, l.toLowerCase()])));
    return { fromLevel: normalized, classLevels, levelVariants };
};
const getNextLevelName = async (currentLevel) => {
    const normalizedCurrent = normalizeLevel(currentLevel);
    const fallbackNextByLevel = {
        TPS: 'PS',
        PS: 'MS',
        MS: 'GS',
        GS: 'EB1',
        KG1: 'KG2',
        KG2: 'KG3',
        KG3: 'EB1'
    };
    const fallbackNext = fallbackNextByLevel[normalizedCurrent];
    const currentDoc = await Level_1.Level.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(normalizedCurrent)}$`, 'i') }
    }).lean();
    if (currentDoc && typeof currentDoc.order === 'number') {
        const nextDoc = await Level_1.Level.findOne({ order: currentDoc.order + 1 }).lean();
        if (nextDoc?.name)
            return String(nextDoc.name);
        const nextByHigherOrder = await Level_1.Level.findOne({ order: { $gt: currentDoc.order } }).sort({ order: 1 }).lean();
        if (nextByHigherOrder?.name)
            return String(nextByHigherOrder.name);
    }
    if (fallbackNext) {
        const fallbackDoc = await Level_1.Level.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(fallbackNext)}$`, 'i') }
        }).lean();
        return fallbackDoc?.name ? String(fallbackDoc.name) : fallbackNext;
    }
    return null;
};
// PS Onboarding: Get PS students for the previous school year
exports.adminExtrasRouter.get('/ps-onboarding/students', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        // Find active school year (for reference)
        const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        // If schoolYearId is provided, use that; otherwise try to find previous year
        const { schoolYearId, fromLevel: fromLevelParam } = req.query;
        let selectedYear = null;
        if (schoolYearId && typeof schoolYearId === 'string') {
            // User selected a specific year
            selectedYear = await SchoolYear_1.SchoolYear.findById(schoolYearId).lean();
            if (!selectedYear) {
                return res.status(400).json({ error: 'year_not_found', message: 'Selected school year not found' });
            }
        }
        else {
            // Default to active year
            if (!activeYear)
                return res.status(400).json({ error: 'no_active_year' });
            selectedYear = activeYear;
        }
        const { fromLevel, classLevels, levelVariants } = getFromLevelConfig(typeof fromLevelParam === 'string' ? fromLevelParam : undefined);
        const selectedYearId = String(selectedYear._id);
        const activeYearId = activeYear ? String(activeYear._id) : '';
        // Check if next year exists for promotion eligibility
        let nextYear = null;
        if (selectedYear.sequence) {
            nextYear = await SchoolYear_1.SchoolYear.findOne({ sequence: selectedYear.sequence + 1 }).lean();
        }
        if (!nextYear && selectedYear.name) {
            const match = String(selectedYear.name).match(/(\d{4})([-\/.])((\d{4}))/);
            if (match) {
                const startYear = parseInt(match[1], 10);
                const sep = match[2];
                const endYear = parseInt(match[4], 10);
                const nextName = `${startYear + 1}${sep}${endYear + 1}`;
                nextYear = await SchoolYear_1.SchoolYear.findOne({ name: nextName }).lean();
            }
        }
        if (!nextYear && selectedYear.endDate) {
            nextYear = await SchoolYear_1.SchoolYear.findOne({ startDate: { $gte: selectedYear.endDate } }).sort({ startDate: 1 }).lean();
        }
        if (!nextYear && selectedYear.startDate) {
            nextYear = await SchoolYear_1.SchoolYear.findOne({ startDate: { $gt: selectedYear.startDate } }).sort({ startDate: 1 }).lean();
        }
        // Check if next level exists
        const nextLevel = await getNextLevelName(fromLevel);
        // Get ALL classes from the selected year
        const allClasses = await Class_1.ClassModel.find({ schoolYearId: selectedYearId }).lean();
        console.log(`[PS-Onboarding] Year ${selectedYear.name}: Found ${allClasses.length} classes (fromLevel=${fromLevel})`);
        // Debug: show all class levels
        const allClassLevels = [...new Set(allClasses.map(c => c.level || 'undefined'))];
        console.log(`[PS-Onboarding] Unique levels in classes: ${allClassLevels.join(', ')}`);
        // Filter for requested classes - use simple matching like the rest of the app
        const fromClasses = allClasses.filter(c => classLevels.includes(normalizeLevel(c.level)));
        console.log(`[PS-Onboarding] Found ${fromClasses.length} ${fromLevel} classes: ${fromClasses.map(c => c.name).join(', ')}`);
        const fromClassIds = fromClasses.map(c => String(c._id));
        // Get ALL enrollments from the selected year
        const allEnrollments = await Enrollment_1.Enrollment.find({
            schoolYearId: selectedYearId
        }).lean();
        console.log(`[PS-Onboarding] Found ${allEnrollments.length} total enrollments`);
        // Filter to find PS enrollments (students in PS classes)
        const fromEnrollments = allEnrollments.filter(e => fromClassIds.includes(String(e.classId)));
        console.log(`[PS-Onboarding] Found ${fromEnrollments.length} ${fromLevel} enrollments`);
        const enrolledFromStudentIds = fromEnrollments.map(e => String(e.studentId));
        // Get students: either enrolled in PS classes OR currently at PS level  
        const fromStudents = await Student_1.Student.find({
            $or: [
                { _id: { $in: enrolledFromStudentIds } },
                { level: { $in: levelVariants } }
            ]
        }).lean();
        console.log(`[PS-Onboarding] Found ${fromStudents.length} ${fromLevel} students`);
        // Map: studentId -> enrollment in selected year (use PS enrollments for accurate mapping)
        const enrollmentMap = new Map(fromEnrollments.map(e => [String(e.studentId), e]));
        const classMap = new Map(fromClasses.map(c => [String(c._id), c]));
        // Get template assignments for these students
        const studentIds = fromStudents.map(s => String(s._id));
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ studentId: { $in: studentIds } }).lean();
        const assignmentMap = new Map(assignments.map(a => [String(a.studentId), a]));
        // Get signatures
        const assignmentIds = assignments.map(a => String(a._id));
        const signatures = assignmentIds.length > 0
            ? await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } }).lean()
            : [];
        // Build signature lookup by assignmentId
        const sigByAssignment = new Map();
        signatures.forEach(s => {
            const key = String(s.templateAssignmentId);
            if (!sigByAssignment.has(key))
                sigByAssignment.set(key, []);
            sigByAssignment.get(key).push(s);
        });
        // Compute signaturePeriodIds for selected year
        const sem1PeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(selectedYearId, 'sem1');
        const endOfYearPeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(selectedYearId, 'end_of_year');
        // Build student list
        const studentList = fromStudents.map(student => {
            const sid = String(student._id);
            const enrollment = enrollmentMap.get(sid);
            const cls = enrollment?.classId ? classMap.get(String(enrollment.classId)) : null;
            const assignment = assignmentMap.get(sid);
            const assignmentId = assignment ? String(assignment._id) : null;
            const sigs = assignmentId ? sigByAssignment.get(assignmentId) || [] : [];
            // Find sem1 and end_of_year signatures
            const sem1Sig = sigs.find(s => s.type !== 'end_of_year' &&
                (!s.signaturePeriodId || s.signaturePeriodId === sem1PeriodId));
            const sem2Sig = sigs.find(s => s.type === 'end_of_year' &&
                (!s.signaturePeriodId || s.signaturePeriodId === endOfYearPeriodId));
            // Check if promoted from this year
            const isPromoted = Array.isArray(student.promotions) &&
                student.promotions.some((p) => String(p.schoolYearId) === selectedYearId);
            const promotionInfo = isPromoted
                ? student.promotions?.find((p) => String(p.schoolYearId) === selectedYearId)
                : null;
            return {
                _id: sid,
                firstName: student.firstName,
                lastName: student.lastName,
                dateOfBirth: student.dateOfBirth,
                avatarUrl: student.avatarUrl,
                previousClassName: cls?.name || null,
                previousClassId: cls ? String(cls._id) : null,
                hasEnrollment: !!enrollment,
                assignmentId,
                isCompletedSem1: assignment?.isCompletedSem1 || assignment?.isCompleted || false,
                isCompletedSem2: assignment?.isCompletedSem2 || false,
                signatures: {
                    sem1: sem1Sig ? { signedAt: sem1Sig.signedAt, signedBy: sem1Sig.subAdminId } : null,
                    sem2: sem2Sig ? { signedAt: sem2Sig.signedAt, signedBy: sem2Sig.subAdminId } : null
                },
                isPromoted,
                promotedAt: promotionInfo?.date || null
            };
        });
        res.json({
            students: studentList,
            selectedYear: { _id: selectedYearId, name: selectedYear.name },
            activeYear: activeYear ? { _id: activeYearId, name: activeYear.name } : null,
            previousYearClasses: fromClasses.map(c => ({ _id: String(c._id), name: c.name, level: c.level })),
            promotionEligibility: {
                hasNextYear: !!nextYear,
                nextYearName: nextYear?.name || null,
                hasNextLevel: !!nextLevel,
                nextLevelName: nextLevel || null
            }
        });
    }
    catch (e) {
        console.error('ps-onboarding/students error:', e);
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// PS Onboarding: Assign a student to a PS class in the previous year
exports.adminExtrasRouter.post('/ps-onboarding/assign-class', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { studentId, classId, schoolYearId, fromLevel } = req.body;
        if (!studentId || !classId || !schoolYearId) {
            return res.status(400).json({ error: 'missing_params' });
        }
        const { classLevels } = getFromLevelConfig(fromLevel);
        // Verify class exists and matches requested level
        const cls = await Class_1.ClassModel.findById(classId).lean();
        if (!cls)
            return res.status(404).json({ error: 'class_not_found' });
        {
            const level = normalizeLevel(cls.level);
            if (!classLevels.includes(level)) {
                return res.status(400).json({ error: 'class_not_allowed', message: 'Class level not allowed for this onboarding' });
            }
        }
        // Check for existing enrollment
        let enrollment = await Enrollment_1.Enrollment.findOne({ studentId, schoolYearId }).lean();
        if (enrollment) {
            // Update existing enrollment
            await Enrollment_1.Enrollment.findByIdAndUpdate(enrollment._id, { classId, status: 'active' });
        }
        else {
            // Create new enrollment
            await Enrollment_1.Enrollment.create({ studentId, schoolYearId, classId, status: 'active' });
        }
        await (0, auditLogger_1.logAudit)({
            userId: adminId,
            action: 'PS_ONBOARDING_ASSIGN_CLASS',
            details: { studentId, classId, schoolYearId, className: cls.name, fromLevel: normalizeLevel(fromLevel || 'PS') },
            req
        });
        res.json({ success: true, className: cls.name });
    }
    catch (e) {
        console.error('ps-onboarding/assign-class error:', e);
        res.status(500).json({ error: 'assign_failed', message: e.message });
    }
});
// PS Onboarding: Upload a custom signature image
exports.adminExtrasRouter.post('/ps-onboarding/custom-signature/upload', (0, auth_1.requireAuth)(['ADMIN']), psSignatureUpload.single('file'), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'no_file' });
        const signatureUrl = `/uploads/ps-signatures/${req.file.filename}`;
        res.json({ signatureUrl });
    }
    catch (e) {
        console.error('ps-onboarding/custom-signature/upload error:', e);
        res.status(500).json({ error: 'upload_failed', message: e.message });
    }
});
// PS Onboarding: Batch sign gradebooks
exports.adminExtrasRouter.post('/ps-onboarding/batch-sign', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { scope, // 'student' | 'class' | 'all'
        studentIds = [], classId, signatureType, // 'sem1' | 'sem2' | 'both'
        signatureSource, // 'admin' | 'subadmin'
        subadminId, customSignatureUrl, schoolYearId, fromLevel, sem1SignedAt, // optional custom date for sem1
        sem2SignedAt // optional custom date for sem2
         } = req.body;
        if (!schoolYearId)
            return res.status(400).json({ error: 'missing_school_year' });
        if (!signatureType)
            return res.status(400).json({ error: 'missing_signature_type' });
        if (!signatureSource)
            return res.status(400).json({ error: 'missing_signature_source' });
        if (signatureSource === 'subadmin' && !subadminId) {
            return res.status(400).json({ error: 'missing_subadmin_id' });
        }
        if (signatureSource === 'custom' && !customSignatureUrl) {
            return res.status(400).json({ error: 'missing_custom_signature_url' });
        }
        // Get signer ID and signature URL
        const signerId = signatureSource === 'subadmin' ? subadminId : adminId;
        let signatureUrl;
        let signatureData;
        if (signatureSource === 'admin') {
            const adminSig = await AdminSignature_1.AdminSignature.findOne({ isActive: true }).lean();
            signatureUrl = adminSig?.dataUrl;
            signatureData = adminSig?.dataUrl;
        }
        else if (signatureSource === 'custom') {
            signatureUrl = String(customSignatureUrl);
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            signatureData = await (0, signatureSnapshot_1.buildSignatureSnapshot)(signatureUrl, baseUrl);
        }
        else {
            // Get subadmin signature
            let subadmin = await User_1.User.findById(subadminId).lean();
            if (!subadmin) {
                subadmin = await OutlookUser_1.OutlookUser.findById(subadminId).lean();
            }
            signatureUrl = subadmin?.signatureUrl ? String(subadmin.signatureUrl) : undefined;
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            signatureData = await (0, signatureSnapshot_1.buildSignatureSnapshot)(signatureUrl, baseUrl);
        }
        const { fromLevel: normalizedFromLevel, classLevels } = getFromLevelConfig(fromLevel);
        // Get classes for the school year (robust to casing)
        const allClasses = await Class_1.ClassModel.find({ schoolYearId }).lean();
        const fromClasses = allClasses.filter(c => classLevels.includes(normalizeLevel(c.level)));
        const fromClassIds = fromClasses.map(c => String(c._id));
        // Get enrollments
        let targetEnrollments;
        if (scope === 'student' && studentIds.length > 0) {
            targetEnrollments = await Enrollment_1.Enrollment.find({
                studentId: { $in: studentIds },
                schoolYearId,
                classId: { $in: fromClassIds }
            }).lean();
        }
        else if (scope === 'class' && classId) {
            targetEnrollments = await Enrollment_1.Enrollment.find({ schoolYearId, classId }).lean();
        }
        else {
            // All PS students
            targetEnrollments = await Enrollment_1.Enrollment.find({
                schoolYearId,
                classId: { $in: fromClassIds }
            }).lean();
        }
        const targetStudentIds = targetEnrollments.map(e => String(e.studentId));
        // Get assignments for these students
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ studentId: { $in: targetStudentIds } }).lean();
        if (assignments.length === 0) {
            return res.status(400).json({
                error: 'no_target_assignments',
                message: 'Aucun carnet trouvé pour les élèves sélectionnés (vérifiez leur classe PS/TPS et leurs carnets)'
            });
        }
        // Get school year name for signature data
        const schoolYear = await SchoolYear_1.SchoolYear.findById(schoolYearId).lean();
        const schoolYearName = schoolYear?.name || '';
        // Compute signature period IDs
        const sem1PeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(schoolYearId, 'sem1');
        const endOfYearPeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(schoolYearId, 'end_of_year');
        const results = { success: 0, failed: 0, errors: [] };
        for (const assignment of assignments) {
            const assignmentId = String(assignment._id);
            // Get student to determine level and class
            const student = await Student_1.Student.findById(assignment.studentId).lean();
            const level = normalizedFromLevel;
            // Get student's enrollment to find class name
            const enrollment = targetEnrollments.find(e => String(e.studentId) === String(assignment.studentId));
            let className = '';
            if (enrollment?.classId) {
                const cls = fromClasses.find(c => String(c._id) === String(enrollment.classId));
                className = cls?.name || '';
            }
            const typesToSign = [];
            if (signatureType === 'sem1' || signatureType === 'both') {
                typesToSign.push({ type: 'standard', periodId: sem1PeriodId });
            }
            if (signatureType === 'sem2' || signatureType === 'both') {
                typesToSign.push({ type: 'end_of_year', periodId: endOfYearPeriodId });
            }
            let signedSuccessfully = false;
            for (const { type, periodId } of typesToSign) {
                try {
                    // Use custom date if provided, otherwise use current date
                    let signedAt;
                    if (type === 'standard' && sem1SignedAt) {
                        signedAt = new Date(sem1SignedAt);
                    }
                    else if (type === 'end_of_year' && sem2SignedAt) {
                        signedAt = new Date(sem2SignedAt);
                    }
                    else {
                        signedAt = new Date();
                    }
                    await (0, signatureService_1.signTemplateAssignment)({
                        templateAssignmentId: assignmentId,
                        signerId,
                        type,
                        signatureUrl,
                        signatureData,
                        level,
                        signaturePeriodId: periodId,
                        signatureSchoolYearId: schoolYearId,
                        signedAt,
                        skipCompletionCheck: true,
                        req
                    });
                    signedSuccessfully = true;
                    results.success++;
                    // Create SavedGradebook snapshot after S1 signing only
                    // S2/promotion snapshot is created during the promotion step
                    if (type === 'standard' && (signatureType === 'sem1' || signatureType === 'both')) {
                        try {
                            const snapshotReason = 'sem1';
                            // Re-fetch assignment to get updated data with signatures
                            const updatedAssignment = await TemplateAssignment_1.TemplateAssignment.findById(assignmentId).lean();
                            if (updatedAssignment) {
                                const statuses = await StudentCompetencyStatus_1.StudentCompetencyStatus.find({ studentId: assignment.studentId }).lean();
                                const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: assignmentId }).lean();
                                const snapshotSignatures = signatures;
                                const snapshotData = {
                                    student: student,
                                    enrollment: enrollment,
                                    statuses: statuses,
                                    assignment: updatedAssignment,
                                    className: className,
                                    signatures: snapshotSignatures,
                                    signature: snapshotSignatures.find((s) => s.type === 'standard') || null,
                                    finalSignature: snapshotSignatures.find((s) => s.type === 'end_of_year') || null
                                };
                                await (0, rolloverService_1.createAssignmentSnapshot)(updatedAssignment, snapshotReason, {
                                    schoolYearId,
                                    level: level || 'Sans niveau',
                                    classId: enrollment?.classId || undefined,
                                    data: snapshotData
                                });
                            }
                        }
                        catch (snapshotError) {
                            console.error('Failed to create snapshot for student', assignment.studentId, snapshotError);
                        }
                    }
                }
                catch (signError) {
                    const msg = String(signError?.message || '');
                    if (msg.includes('already_signed')) {
                        continue;
                    }
                    if (!msg.includes('E11000')) {
                        results.failed++;
                        results.errors.push({
                            studentId: assignment.studentId,
                            type,
                            error: msg
                        });
                    }
                }
            }
        }
        await (0, auditLogger_1.logAudit)({
            userId: adminId,
            action: 'PS_ONBOARDING_BATCH_SIGN',
            details: {
                scope,
                signatureType,
                signatureSource,
                subadminId: signatureSource === 'subadmin' ? subadminId : undefined,
                schoolYearId,
                fromLevel: normalizedFromLevel,
                success: results.success,
                failed: results.failed
            },
            req
        });
        res.json(results);
    }
    catch (e) {
        console.error('ps-onboarding/batch-sign error:', e);
        res.status(500).json({ error: 'batch_sign_failed', message: e.message });
    }
});
// PS Onboarding: Batch unsign gradebooks (undo)
exports.adminExtrasRouter.post('/ps-onboarding/batch-unsign', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { scope, studentIds = [], classId, signatureType, schoolYearId, fromLevel } = req.body;
        if (!schoolYearId)
            return res.status(400).json({ error: 'missing_school_year' });
        if (!signatureType)
            return res.status(400).json({ error: 'missing_signature_type' });
        const { fromLevel: normalizedFromLevel, classLevels } = getFromLevelConfig(fromLevel);
        // Get classes for the school year (robust to casing)
        const allClasses = await Class_1.ClassModel.find({ schoolYearId }).lean();
        const fromClasses = allClasses.filter(c => classLevels.includes(normalizeLevel(c.level)));
        const fromClassIds = fromClasses.map(c => String(c._id));
        // Get enrollments
        let targetEnrollments;
        if (scope === 'student' && studentIds.length > 0) {
            targetEnrollments = await Enrollment_1.Enrollment.find({
                studentId: { $in: studentIds },
                schoolYearId,
                classId: { $in: fromClassIds }
            }).lean();
        }
        else if (scope === 'class' && classId) {
            targetEnrollments = await Enrollment_1.Enrollment.find({ schoolYearId, classId }).lean();
        }
        else {
            targetEnrollments = await Enrollment_1.Enrollment.find({
                schoolYearId,
                classId: { $in: fromClassIds }
            }).lean();
        }
        const targetStudentIds = targetEnrollments.map(e => String(e.studentId));
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ studentId: { $in: targetStudentIds } }).lean();
        const assignmentIds = assignments.map(a => String(a._id));
        // Build query for deletion
        const deleteQuery = { templateAssignmentId: { $in: assignmentIds } };
        if (signatureType === 'sem1') {
            deleteQuery.type = { $ne: 'end_of_year' };
        }
        else if (signatureType === 'sem2') {
            deleteQuery.type = 'end_of_year';
        }
        // 'both' = delete all
        const result = await TemplateSignature_1.TemplateSignature.deleteMany(deleteQuery);
        await (0, auditLogger_1.logAudit)({
            userId: adminId,
            action: 'PS_ONBOARDING_BATCH_UNSIGN',
            details: { scope, signatureType, schoolYearId, deleted: result.deletedCount, fromLevel: normalizedFromLevel },
            req
        });
        res.json({ success: true, deleted: result.deletedCount });
    }
    catch (e) {
        console.error('ps-onboarding/batch-unsign error:', e);
        res.status(500).json({ error: 'batch_unsign_failed', message: e.message });
    }
});
// PS Onboarding: Batch promote students from PS to MS
exports.adminExtrasRouter.post('/ps-onboarding/batch-promote', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { scope, studentIds = [], classId, schoolYearId, // Promote FROM this school year TO the next school year
        fromLevel } = req.body;
        if (!schoolYearId)
            return res.status(400).json({ error: 'missing_school_year' });
        // Determine next school year from the selected school year (like subadmin promotion)
        const currentSy = await SchoolYear_1.SchoolYear.findById(schoolYearId).lean();
        if (!currentSy)
            return res.status(404).json({ error: 'school_year_not_found' });
        let nextSy = null;
        if (currentSy.sequence) {
            nextSy = await SchoolYear_1.SchoolYear.findOne({ sequence: currentSy.sequence + 1 }).lean();
        }
        if (!nextSy && currentSy.name) {
            const match = String(currentSy.name).match(/(\d{4})([-/.])(\d{4})/);
            if (match) {
                const startYear = parseInt(match[1], 10);
                const sep = match[2];
                const endYear = parseInt(match[3], 10);
                const nextName = `${startYear + 1}${sep}${endYear + 1}`;
                nextSy = await SchoolYear_1.SchoolYear.findOne({ name: nextName }).lean();
            }
        }
        if (!nextSy && currentSy.endDate) {
            nextSy = await SchoolYear_1.SchoolYear.findOne({ startDate: { $gte: currentSy.endDate } }).sort({ startDate: 1 }).lean();
        }
        if (!nextSy && currentSy.startDate) {
            nextSy = await SchoolYear_1.SchoolYear.findOne({ startDate: { $gt: currentSy.startDate } }).sort({ startDate: 1 }).lean();
        }
        if (!nextSy?._id) {
            return res.status(400).json({ error: 'no_next_year', message: 'Next school year not found' });
        }
        const nextSchoolYearId = String(nextSy._id);
        const { fromLevel: normalizedFromLevel, classLevels } = getFromLevelConfig(fromLevel);
        // Get next level for requested level
        const nextLevel = await getNextLevelName(normalizedFromLevel);
        if (!nextLevel) {
            return res.status(400).json({ error: 'no_next_level', message: `Cannot determine next level from ${normalizedFromLevel}` });
        }
        // Get classes for the previous year (robust to casing)
        const allClasses = await Class_1.ClassModel.find({ schoolYearId }).lean();
        const fromClasses = allClasses.filter(c => classLevels.includes(normalizeLevel(c.level)));
        const fromClassIds = fromClasses.map(c => String(c._id));
        // Get target enrollments
        let targetEnrollments;
        if (scope === 'student' && studentIds.length > 0) {
            targetEnrollments = await Enrollment_1.Enrollment.find({
                studentId: { $in: studentIds },
                schoolYearId,
                classId: { $in: fromClassIds }
            }).lean();
        }
        else if (scope === 'class' && classId) {
            targetEnrollments = await Enrollment_1.Enrollment.find({ schoolYearId, classId }).lean();
        }
        else {
            targetEnrollments = await Enrollment_1.Enrollment.find({
                schoolYearId,
                classId: { $in: fromClassIds }
            }).lean();
        }
        const targetStudentIds = targetEnrollments.map(e => e.studentId);
        // Get school year name for promotion data
        const prevSchoolYear = await SchoolYear_1.SchoolYear.findById(schoolYearId).lean();
        const prevSchoolYearName = prevSchoolYear?.name || '';
        // Get assignments
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ studentId: { $in: targetStudentIds } }).lean();
        const assignmentMap = new Map(assignments.map(a => [String(a.studentId), a]));
        // Get signatures to verify end-of-year signing
        const assignmentIds = assignments.map(a => String(a._id));
        const sem1PeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(schoolYearId, 'sem1');
        const endOfYearPeriodId = (0, readinessUtils_1.computeSignaturePeriodId)(schoolYearId, 'end_of_year');
        const signatures = await TemplateSignature_1.TemplateSignature.find({
            templateAssignmentId: { $in: assignmentIds },
            $or: [
                { type: 'end_of_year', signaturePeriodId: endOfYearPeriodId },
                { type: 'standard', signaturePeriodId: sem1PeriodId },
                // Backward-compatible: older standard signatures may have no explicit type
                { type: { $exists: false }, signaturePeriodId: sem1PeriodId }
            ]
        }).lean();
        const signedSem1 = new Set(signatures
            .filter(s => s.type !== 'end_of_year' && String(s.signaturePeriodId || '') === sem1PeriodId)
            .map(s => String(s.templateAssignmentId)));
        const signedSem2 = new Set(signatures
            .filter(s => s.type === 'end_of_year' && String(s.signaturePeriodId || '') === endOfYearPeriodId)
            .map(s => String(s.templateAssignmentId)));
        const results = { success: 0, failed: 0, errors: [], skipped: 0 };
        for (const studentId of targetStudentIds) {
            const sid = String(studentId);
            // Check if already promoted
            const student = await Student_1.Student.findById(sid).lean();
            if (!student) {
                results.failed++;
                results.errors.push({ studentId: sid, error: 'student_not_found' });
                continue;
            }
            const alreadyPromoted = Array.isArray(student.promotions) &&
                student.promotions.some((p) => String(p.schoolYearId) === schoolYearId);
            if (alreadyPromoted) {
                results.skipped++;
                continue;
            }
            // Check if signed (Sem1 + Sem2)
            const assignment = assignmentMap.get(sid);
            if (!assignment) {
                results.failed++;
                results.errors.push({ studentId: sid, error: 'no_assignment' });
                continue;
            }
            if (!signedSem1.has(String(assignment._id))) {
                results.failed++;
                results.errors.push({ studentId: sid, error: 'not_signed_sem1' });
                continue;
            }
            if (!signedSem2.has(String(assignment._id))) {
                results.failed++;
                results.errors.push({ studentId: sid, error: 'not_signed_end_of_year' });
                continue;
            }
            try {
                // Create promotion record
                const promotion = {
                    schoolYearId,
                    date: new Date(),
                    fromLevel: normalizedFromLevel,
                    toLevel: nextLevel,
                    promotedBy: adminId
                };
                await Student_1.Student.findByIdAndUpdate(sid, {
                    $push: { promotions: promotion },
                    $set: { level: nextLevel, nextLevel: null }
                });
                // Update old enrollment to promoted status
                const oldEnrollment = targetEnrollments.find(e => String(e.studentId) === sid);
                if (oldEnrollment) {
                    await Enrollment_1.Enrollment.findByIdAndUpdate(oldEnrollment._id, { status: 'promoted' });
                }
                // Create new enrollment in next school year (without class assignment)
                const existingNextEnrollment = await Enrollment_1.Enrollment.findOne({ studentId: sid, schoolYearId: nextSchoolYearId }).lean();
                if (!existingNextEnrollment) {
                    await Enrollment_1.Enrollment.create({ studentId: sid, schoolYearId: nextSchoolYearId, status: 'active', classId: null });
                }
                // Get student's class name from enrollment
                const enrollment = targetEnrollments.find(e => String(e.studentId) === sid);
                let className = '';
                if (enrollment?.classId) {
                    const cls = fromClasses.find(c => String(c._id) === String(enrollment.classId));
                    className = cls?.name || '';
                }
                // Add promotion to assignment data for history
                const assignmentForUpdate = await TemplateAssignment_1.TemplateAssignment.findById(assignment._id);
                if (assignmentForUpdate) {
                    if (!assignmentForUpdate.data)
                        assignmentForUpdate.data = {};
                    if (!assignmentForUpdate.data.promotions)
                        assignmentForUpdate.data.promotions = [];
                    assignmentForUpdate.data.promotions.push({
                        from: normalizedFromLevel,
                        to: nextLevel,
                        date: new Date(),
                        by: adminId,
                        year: prevSchoolYearName,
                        class: className,
                        schoolYearId
                    });
                    assignmentForUpdate.markModified('data');
                    await assignmentForUpdate.save();
                    // Create SavedGradebook snapshot after promotion
                    try {
                        const updatedAssignment = await TemplateAssignment_1.TemplateAssignment.findById(assignment._id).lean();
                        if (updatedAssignment) {
                            const statuses = await StudentCompetencyStatus_1.StudentCompetencyStatus.find({ studentId: sid }).lean();
                            const allSignatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: String(assignment._id) }).lean();
                            const snapshotData = {
                                student: student,
                                enrollment: oldEnrollment,
                                statuses: statuses,
                                assignment: updatedAssignment,
                                className: className,
                                signatures: allSignatures,
                                signature: allSignatures.find((s) => s.type === 'standard') || null,
                                finalSignature: allSignatures.find((s) => s.type === 'end_of_year') || null,
                            };
                            await (0, rolloverService_1.createAssignmentSnapshot)(updatedAssignment, 'promotion', {
                                schoolYearId,
                                level: normalizedFromLevel || 'Sans niveau',
                                classId: oldEnrollment?.classId || undefined,
                                data: snapshotData
                            });
                        }
                    }
                    catch (snapshotError) {
                        console.error('Failed to create promotion snapshot for student', sid, snapshotError);
                    }
                }
                results.success++;
            }
            catch (promoteError) {
                results.failed++;
                results.errors.push({ studentId: sid, error: promoteError.message });
            }
        }
        await (0, auditLogger_1.logAudit)({
            userId: adminId,
            action: 'PS_ONBOARDING_BATCH_PROMOTE',
            details: {
                scope,
                schoolYearId,
                fromLevel: normalizedFromLevel,
                toLevel: nextLevel,
                success: results.success,
                failed: results.failed,
                skipped: results.skipped
            },
            req
        });
        res.json(results);
    }
    catch (e) {
        console.error('ps-onboarding/batch-promote error:', e);
        res.status(500).json({ error: 'batch_promote_failed', message: e.message });
    }
});
// PS Onboarding: Batch unpromote students (undo PS -> MS promotion)
exports.adminExtrasRouter.post('/ps-onboarding/batch-unpromote', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { scope, studentIds = [], classId, schoolYearId, // Undo promotion for this school year (remove next-year enrollment)
        fromLevel } = req.body;
        if (!schoolYearId)
            return res.status(400).json({ error: 'missing_school_year' });
        // Determine next school year from the selected school year
        const currentSy = await SchoolYear_1.SchoolYear.findById(schoolYearId).lean();
        if (!currentSy)
            return res.status(404).json({ error: 'school_year_not_found' });
        let nextSy = null;
        if (currentSy.sequence) {
            nextSy = await SchoolYear_1.SchoolYear.findOne({ sequence: currentSy.sequence + 1 }).lean();
        }
        if (!nextSy && currentSy.name) {
            const match = String(currentSy.name).match(/(\d{4})([-/.])(\d{4})/);
            if (match) {
                const startYear = parseInt(match[1], 10);
                const sep = match[2];
                const endYear = parseInt(match[3], 10);
                const nextName = `${startYear + 1}${sep}${endYear + 1}`;
                nextSy = await SchoolYear_1.SchoolYear.findOne({ name: nextName }).lean();
            }
        }
        if (!nextSy && currentSy.endDate) {
            nextSy = await SchoolYear_1.SchoolYear.findOne({ startDate: { $gte: currentSy.endDate } }).sort({ startDate: 1 }).lean();
        }
        if (!nextSy && currentSy.startDate) {
            nextSy = await SchoolYear_1.SchoolYear.findOne({ startDate: { $gt: currentSy.startDate } }).sort({ startDate: 1 }).lean();
        }
        if (!nextSy?._id) {
            return res.status(400).json({ error: 'no_next_year', message: 'Next school year not found' });
        }
        const nextSchoolYearId = String(nextSy._id);
        const { fromLevel: normalizedFromLevel, classLevels } = getFromLevelConfig(fromLevel);
        // Get classes for the previous year (robust to casing)
        const allClasses = await Class_1.ClassModel.find({ schoolYearId }).lean();
        const fromClasses = allClasses.filter(c => classLevels.includes(normalizeLevel(c.level)));
        const fromClassIds = fromClasses.map(c => String(c._id));
        // Get target enrollments (previous year)
        let targetEnrollments;
        if (scope === 'student' && studentIds.length > 0) {
            targetEnrollments = await Enrollment_1.Enrollment.find({
                studentId: { $in: studentIds },
                schoolYearId,
                classId: { $in: fromClassIds }
            }).lean();
        }
        else if (scope === 'class' && classId) {
            targetEnrollments = await Enrollment_1.Enrollment.find({ schoolYearId, classId }).lean();
        }
        else {
            targetEnrollments = await Enrollment_1.Enrollment.find({
                schoolYearId,
                classId: { $in: fromClassIds }
            }).lean();
        }
        const targetStudentIds = targetEnrollments.map(e => String(e.studentId));
        // Get assignments
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ studentId: { $in: targetStudentIds } }).lean();
        const assignmentMap = new Map(assignments.map(a => [String(a.studentId), a]));
        const results = { success: 0, failed: 0, skipped: 0, errors: [] };
        for (const sid of targetStudentIds) {
            try {
                const student = await Student_1.Student.findById(sid).lean();
                if (!student) {
                    results.failed++;
                    results.errors.push({ studentId: sid, error: 'student_not_found' });
                    continue;
                }
                const promotions = Array.isArray(student.promotions) ? student.promotions : [];
                const promotion = promotions.find((p) => String(p.schoolYearId) === String(schoolYearId));
                if (!promotion) {
                    results.skipped++;
                    continue;
                }
                // Only delete next-year enrollment if still unassigned (classId null/empty)
                const nextEnrollment = await Enrollment_1.Enrollment.findOne({ studentId: sid, schoolYearId: nextSchoolYearId }).lean();
                if (nextEnrollment && nextEnrollment.classId) {
                    results.failed++;
                    results.errors.push({ studentId: sid, error: 'already_assigned_next_year' });
                    continue;
                }
                // Revert student promotions + level
                const fromLevel = String(promotion.fromLevel || normalizedFromLevel);
                await Student_1.Student.findByIdAndUpdate(sid, {
                    $pull: { promotions: { schoolYearId: String(schoolYearId) } },
                    $set: { level: fromLevel, nextLevel: null }
                });
                // Revert previous-year enrollment status back to active
                const oldEnrollment = targetEnrollments.find(e => String(e.studentId) === sid);
                if (oldEnrollment?._id) {
                    await Enrollment_1.Enrollment.findByIdAndUpdate(oldEnrollment._id, { status: 'active' });
                }
                // Remove next-year enrollment if it exists and is unassigned
                if (nextEnrollment && !nextEnrollment.classId) {
                    await Enrollment_1.Enrollment.findByIdAndDelete(String(nextEnrollment._id));
                }
                // Remove promotion entries from assignment history for this school year
                const assignment = assignmentMap.get(sid);
                if (assignment?._id) {
                    await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(String(assignment._id), {
                        $pull: { 'data.promotions': { schoolYearId: String(schoolYearId) } },
                        $inc: { dataVersion: 1 }
                    });
                }
                results.success++;
            }
            catch (err) {
                results.failed++;
                results.errors.push({ studentId: sid, error: err.message });
            }
        }
        await (0, auditLogger_1.logAudit)({
            userId: adminId,
            action: 'PS_ONBOARDING_BATCH_UNPROMOTE',
            details: { scope, schoolYearId, success: results.success, failed: results.failed, skipped: results.skipped, fromLevel: normalizedFromLevel },
            req
        });
        res.json(results);
    }
    catch (e) {
        console.error('ps-onboarding/batch-unpromote error:', e);
        res.status(500).json({ error: 'batch_unpromote_failed', message: e.message });
    }
});
// PS Onboarding: Get available subadmins for signature selection
exports.adminExtrasRouter.get('/ps-onboarding/subadmins', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        // Get all subadmins with signatures
        const [users, outlookUsers] = await Promise.all([
            User_1.User.find({ role: 'SUBADMIN', signatureUrl: { $exists: true, $ne: '' } })
                .select('displayName email signatureUrl').lean(),
            OutlookUser_1.OutlookUser.find({ role: 'SUBADMIN', signatureUrl: { $exists: true, $ne: '' } })
                .select('displayName email signatureUrl').lean()
        ]);
        const subadmins = [...users, ...outlookUsers].map(u => ({
            _id: String(u._id),
            displayName: u.displayName || u.email,
            hasSignature: !!u.signatureUrl,
            signatureUrl: u.signatureUrl || null
        }));
        res.json(subadmins);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// PS Onboarding: Batch export PDFs (without signature blocks)
exports.adminExtrasRouter.post('/ps-onboarding/batch-export', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { scope, // 'student' | 'class' | 'all'
        studentIds = [], classId, schoolYearId, fromLevel } = req.body;
        if (!schoolYearId)
            return res.status(400).json({ error: 'missing_school_year' });
        const { fromLevel: normalizedFromLevel, classLevels } = getFromLevelConfig(fromLevel);
        // Get classes for the school year (robust to casing)
        const allClasses = await Class_1.ClassModel.find({ schoolYearId }).lean();
        const fromClasses = allClasses.filter(c => classLevels.includes(normalizeLevel(c.level)));
        const fromClassIds = fromClasses.map(c => String(c._id));
        // Get target enrollments
        let targetEnrollments;
        if (scope === 'student' && studentIds.length > 0) {
            targetEnrollments = await Enrollment_1.Enrollment.find({
                studentId: { $in: studentIds },
                schoolYearId,
                classId: { $in: fromClassIds }
            }).lean();
        }
        else if (scope === 'class' && classId) {
            targetEnrollments = await Enrollment_1.Enrollment.find({ schoolYearId, classId }).lean();
        }
        else {
            targetEnrollments = await Enrollment_1.Enrollment.find({
                schoolYearId,
                classId: { $in: fromClassIds }
            }).lean();
        }
        const targetStudentIds = targetEnrollments.map(e => String(e.studentId));
        // Get assignments for these students
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ studentId: { $in: targetStudentIds } }).lean();
        // Return assignment IDs for the frontend to use with the existing batch export
        // Frontend will add hideSignatures=true to the print URLs
        const assignmentIds = assignments.map(a => String(a._id));
        // Get class name for groupLabel
        let groupLabel = normalizedFromLevel;
        if (scope === 'class' && classId) {
            const cls = fromClasses.find(c => String(c._id) === classId);
            groupLabel = cls?.name || normalizedFromLevel;
        }
        else if (scope === 'student' && studentIds.length === 1) {
            const student = await Student_1.Student.findById(studentIds[0]).lean();
            groupLabel = student ? `${student.lastName}-${student.firstName}` : normalizedFromLevel;
        }
        res.json({
            assignmentIds,
            groupLabel,
            count: assignmentIds.length
        });
    }
    catch (e) {
        console.error('ps-onboarding/batch-export error:', e);
        res.status(500).json({ error: 'batch_export_failed', message: e.message });
    }
});
// ============================================================================
// END PS-TO-MS ONBOARDING ENDPOINTS
// ============================================================================
// --- Server tests: list available test files (recursive) ---
exports.adminExtrasRouter.get('/run-tests/list', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        // Search recursively under server `src` for test files so we include nested suites
        const startDir = path_1.default.join(__dirname, '..'); // server/src
        const matches = [];
        async function walk(dir) {
            const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
            for (const ent of entries) {
                const p = path_1.default.join(dir, ent.name);
                if (ent.isDirectory()) {
                    await walk(p);
                }
                else if (ent.isFile() && (/\.(?:test|spec)\.[tj]s$/).test(ent.name)) {
                    // return paths relative to server/src for client-friendly display
                    matches.push(path_1.default.relative(startDir, p));
                }
            }
        }
        await walk(startDir);
        matches.sort();
        res.json({ tests: matches });
    }
    catch (e) {
        console.error('run-tests/list error', e);
        res.status(500).json({ error: 'failed' });
    }
});
// --- Server tests: run tests (admin only) ---
exports.adminExtrasRouter.post('/run-tests', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { pattern, patterns } = req.body || {};
    try {
        const argsBase = ['--json', '--runInBand'];
        const patternArgs = [];
        const addPatterns = (p) => {
            if (Array.isArray(p)) {
                for (const it of p)
                    if (typeof it === 'string' && it.trim())
                        patternArgs.push(it);
            }
            else if (typeof p === 'string' && p.trim())
                patternArgs.push(p);
        };
        addPatterns(patterns);
        addPatterns(pattern);
        const cwd = path_1.default.join(__dirname, '..', '..'); // server root
        // Try to prefer local node_modules binary if available, otherwise fallback to npx
        let cmd = 'npx';
        let cmdArgs = ['jest', ...argsBase, ...patternArgs];
        try {
            const jestPath = path_1.default.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'jest.cmd' : 'jest');
            await promises_1.default.access(jestPath);
            cmd = jestPath;
            cmdArgs = [...argsBase, ...patternArgs];
        }
        catch (e) {
            // fallback stays as npx with args
        }
        // If we are still set to use 'npx' and it's not available on the system, return 501 with clear message
        if (cmd === 'npx') {
            try {
                const childProc = require('child_process').spawnSync(process.platform === 'win32' ? 'where' : 'which', ['npx']);
                if (childProc.status !== 0) {
                    return res.status(501).json({ error: 'npx_not_found', message: 'npx is not available on PATH and local jest binary not found' });
                }
            }
            catch (e) {
                return res.status(501).json({ error: 'npx_check_failed', message: String(e) });
            }
        }
        let responded = false;
        const proc = (0, child_process_1.spawn)(cmd, cmdArgs, { cwd, env: { ...process.env, CI: 'true' }, shell: process.platform === 'win32' });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += String(d); });
        proc.stderr.on('data', (d) => { stderr += String(d); });
        proc.on('error', (err) => {
            console.error('run-tests spawn error', err);
            // return a helpful error to client
            if (responded || res.headersSent)
                return;
            responded = true;
            return res.status(500).json({ error: 'spawn_failed', message: String(err) });
        });
        proc.on('close', (code) => {
            if (responded || res.headersSent)
                return;
            responded = true;
            try {
                const parsed = JSON.parse(stdout);
                return res.json({ ok: true, code, results: parsed, stdout, stderr });
            }
            catch (e) {
                return res.json({ ok: code === 0, code, stdout, stderr, parseError: String(e) });
            }
        });
    }
    catch (e) {
        console.error('run-tests error', e);
        res.status(500).json({ error: 'run_failed', message: e.message });
    }
});
