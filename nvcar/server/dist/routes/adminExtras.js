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
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
exports.adminExtrasRouter = (0, express_1.Router)();
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
        const users = await User_1.User.find({ lastActive: { $gte: fiveMinutesAgo } }).select('displayName role lastActive email').lean();
        res.json(users);
    }
    catch (e) {
        res.status(500).json({ error: 'failed' });
    }
});
// 3. Alerts
exports.adminExtrasRouter.post('/alert', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { message, duration } = req.body;
        await SystemAlert_1.SystemAlert.updateMany({}, { active: false }); // Deactivate old alerts
        if (message) {
            const alertData = {
                message,
                createdBy: req.user.userId,
                active: true
            };
            if (duration && !isNaN(Number(duration))) {
                alertData.expiresAt = new Date(Date.now() + Number(duration) * 60 * 1000);
            }
            await SystemAlert_1.SystemAlert.create(alertData);
        }
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'failed' });
    }
});
exports.adminExtrasRouter.post('/alert/stop', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        await SystemAlert_1.SystemAlert.updateMany({ active: true }, { active: false });
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
        try {
            const signature = await (0, signatureService_1.signTemplateAssignment)({
                templateAssignmentId,
                signerId: adminId,
                type: type,
                signatureUrl: activeSig ? activeSig.dataUrl : undefined,
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
        res.json({
            template: versionedTemplate,
            student: { ...student, level, className },
            assignment,
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
