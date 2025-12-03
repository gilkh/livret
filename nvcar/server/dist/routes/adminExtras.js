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
        const { message } = req.body;
        await SystemAlert_1.SystemAlert.updateMany({}, { active: false }); // Deactivate old alerts
        if (message) {
            await SystemAlert_1.SystemAlert.create({ message, createdBy: req.user.userId });
        }
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'failed' });
    }
});
exports.adminExtrasRouter.get('/alert', async (req, res) => {
    try {
        const alert = await SystemAlert_1.SystemAlert.findOne({ active: true }).sort({ createdAt: -1 }).lean();
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
