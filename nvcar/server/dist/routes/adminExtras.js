"use strict";
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
const TemplateSignature_1 = require("../models/TemplateSignature");
const Student_1 = require("../models/Student");
const AdminSignature_1 = require("../models/AdminSignature");
const signatureService_1 = require("../services/signatureService");
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
        const teachers = await User_1.User.find({ _id: { $in: teacherIds } }).lean();
        const teacherMap = new Map(teachers.map(t => [String(t._id), t]));
        const enrollments = await Enrollment_1.Enrollment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds }
        }).lean();
        const templateIds = [...new Set(assignments.map(a => a.templateId))];
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).lean();
        const classesResult = classes.map(cls => {
            const clsId = String(cls._id);
            const clsTeachers = teacherAssignments
                .filter(ta => ta.classId === clsId)
                .map(ta => teacherMap.get(ta.teacherId)?.displayName || 'Unknown');
            const clsEnrollments = enrollments.filter(e => e.classId === clsId);
            const clsStudentIds = new Set(clsEnrollments.map(e => e.studentId));
            const clsAssignments = assignments.filter(a => clsStudentIds.has(a.studentId));
            let totalCompetencies = 0;
            let filledCompetencies = 0;
            const categoryStats = {};
            clsAssignments.forEach(assignment => {
                const templateId = assignment.templateId;
                const template = templates.find(t => String(t._id) === templateId);
                if (!template)
                    return;
                const assignmentData = assignment.data || {};
                const level = cls.level;
                template.pages.forEach((page, pageIdx) => {
                    (page.blocks || []).forEach((block, blockIdx) => {
                        if (block.type === 'language_toggle') {
                            const key = `language_toggle_${pageIdx}_${blockIdx}`;
                            const overrideItems = assignmentData[key];
                            const items = overrideItems || block.props.items || [];
                            items.forEach((item) => {
                                let isAssigned = true;
                                if (item.levels && Array.isArray(item.levels) && item.levels.length > 0) {
                                    if (!level || !item.levels.includes(level)) {
                                        isAssigned = false;
                                    }
                                }
                                if (isAssigned) {
                                    const lang = item.type || item.label || 'Autre';
                                    if (!categoryStats[lang])
                                        categoryStats[lang] = { total: 0, filled: 0, name: lang };
                                    categoryStats[lang].total++;
                                    totalCompetencies++;
                                    if (item.active) {
                                        categoryStats[lang].filled++;
                                        filledCompetencies++;
                                    }
                                }
                            });
                        }
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
            const assignedTeacherIds = directAssignments.map(da => da.teacherId);
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
                schoolYearId: String(activeYear._id)
            }).lean();
            const saStudentIds = saEnrollments.map(e => e.studentId);
            // Find assignments for these students
            const saAssignments = await TemplateAssignment_1.TemplateAssignment.find({
                studentId: { $in: saStudentIds }
            }).lean();
            const totalAssignments = saAssignments.length;
            const signedAssignments = saAssignments.filter(a => {
                const anyA = a;
                return anyA.signatures && anyA.signatures.some((s) => s.signedBy === saId);
            }).length;
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
        const { type = 'standard' } = req.body;
        // Get active admin signature
        const activeSig = await AdminSignature_1.AdminSignature.findOne({ isActive: true }).lean();
        try {
            const signature = await (0, signatureService_1.signTemplateAssignment)({
                templateAssignmentId,
                signerId: adminId,
                type: type,
                signatureUrl: activeSig ? activeSig.dataUrl : undefined,
                req
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
            const key = `language_toggle_${pageIndex}_${blockIndex}`;
            // Update assignment data
            if (!assignment.data)
                assignment.data = {};
            assignment.data[key] = items;
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
        // Apply language toggles from assignment data
        const versionedTemplate = JSON.parse(JSON.stringify(template));
        if (assignment.data) {
            for (const [key, value] of Object.entries(assignment.data)) {
                if (key.startsWith('language_toggle_')) {
                    const parts = key.split('_');
                    if (parts.length >= 4) {
                        const pageIndex = parseInt(parts[2]);
                        const blockIndex = parseInt(parts[3]);
                        if (versionedTemplate.pages?.[pageIndex]?.blocks?.[blockIndex]?.props?.items) {
                            versionedTemplate.pages[pageIndex].blocks[blockIndex].props.items = value;
                        }
                    }
                }
            }
        }
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
