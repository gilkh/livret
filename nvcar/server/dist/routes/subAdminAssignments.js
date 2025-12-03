"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subAdminAssignmentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const SubAdminAssignment_1 = require("../models/SubAdminAssignment");
const User_1 = require("../models/User");
const OutlookUser_1 = require("../models/OutlookUser");
const Class_1 = require("../models/Class");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const RoleScope_1 = require("../models/RoleScope");
const SchoolYear_1 = require("../models/SchoolYear");
const Enrollment_1 = require("../models/Enrollment");
const Student_1 = require("../models/Student");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const Competency_1 = require("../models/Competency");
const Category_1 = require("../models/Category");
exports.subAdminAssignmentsRouter = (0, express_1.Router)();
// SubAdmin: Get student progress for assigned levels
exports.subAdminAssignmentsRouter.get('/progress', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        // Get assigned levels from RoleScope
        const scope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
        if (!scope || !scope.levels || scope.levels.length === 0) {
            return res.json([]);
        }
        const assignedLevels = scope.levels;
        // Get active school year
        const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!activeYear) {
            return res.status(400).json({ error: 'no_active_year' });
        }
        // Find classes in these levels for the active year
        const classes = await Class_1.ClassModel.find({
            level: { $in: assignedLevels },
            schoolYearId: String(activeYear._id)
        }).lean();
        const classIds = classes.map(c => String(c._id));
        if (classIds.length === 0) {
            return res.json([]);
        }
        // Find enrollments
        const enrollments = await Enrollment_1.Enrollment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        if (studentIds.length === 0) {
            return res.json([]);
        }
        // Find completed assignments (Carnet Done)
        const completedAssignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds },
            isCompleted: true
        }).lean();
        const completedStudentIds = new Set(completedAssignments.map(a => a.studentId));
        // Filter students
        const students = await Student_1.Student.find({ _id: { $in: Array.from(completedStudentIds) } }).lean();
        // Fetch templates used in assignments
        const templateIds = [...new Set(completedAssignments.map(a => a.templateId))];
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).lean();
        const templateMap = new Map(templates.map(t => [String(t._id), t]));
        const result = students.map(student => {
            const enrollment = enrollments.find(e => e.studentId === String(student._id));
            const cls = classes.find(c => String(c._id) === enrollment?.classId);
            const currentLevel = cls?.level || student.level || 'Unknown';
            // Find all assignments for this student
            const studentAssignments = completedAssignments.filter(a => a.studentId === String(student._id));
            // Structure to hold stats per level
            const statsByLevel = {};
            studentAssignments.forEach(assignment => {
                const template = templateMap.get(assignment.templateId);
                if (!template)
                    return;
                const assignmentData = assignment.data || {};
                // Iterate through all pages and blocks to find language_toggle
                template.pages.forEach((page, pageIdx) => {
                    (page.blocks || []).forEach((block, blockIdx) => {
                        if (block.type === 'language_toggle') {
                            const key = `language_toggle_${pageIdx}_${blockIdx}`;
                            const overrideItems = assignmentData[key];
                            const items = overrideItems || block.props.items || [];
                            items.forEach((item) => {
                                // Check which levels this item belongs to
                                if (item.levels && Array.isArray(item.levels)) {
                                    item.levels.forEach((lvl) => {
                                        // Only count if this level is assigned to the sub-admin
                                        if (assignedLevels.includes(lvl)) {
                                            if (!statsByLevel[lvl]) {
                                                statsByLevel[lvl] = {
                                                    total: 0,
                                                    filled: 0,
                                                    byCategory: {}
                                                };
                                            }
                                            const lang = item.type || item.label || 'Autre';
                                            if (!statsByLevel[lvl].byCategory[lang]) {
                                                statsByLevel[lvl].byCategory[lang] = { total: 0, filled: 0, name: lang };
                                            }
                                            statsByLevel[lvl].total++;
                                            statsByLevel[lvl].byCategory[lang].total++;
                                            if (item.active) {
                                                statsByLevel[lvl].filled++;
                                                statsByLevel[lvl].byCategory[lang].filled++;
                                            }
                                        }
                                    });
                                }
                            });
                        }
                    });
                });
            });
            // Format the output
            const levelsData = Object.keys(statsByLevel).map(lvl => {
                const stats = statsByLevel[lvl];
                return {
                    level: lvl,
                    activeCount: stats.filled,
                    totalAvailable: stats.total,
                    percentage: stats.total > 0 ? Math.round((stats.filled / stats.total) * 100) : 0,
                    byCategory: Object.values(stats.byCategory).map(cat => ({
                        name: cat.name,
                        total: cat.total,
                        filled: cat.filled,
                        percentage: cat.total > 0 ? Math.round((cat.filled / cat.total) * 100) : 0
                    }))
                };
            });
            return {
                _id: student._id,
                firstName: student.firstName,
                lastName: student.lastName,
                currentLevel,
                className: cls?.name,
                levelsData // New field containing stats per level
            };
        });
        res.json(result);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'fetch_progress_failed', message: e.message });
    }
});
// Admin: Assign sub-admin to all teachers in a level
exports.subAdminAssignmentsRouter.post('/bulk-level', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { subAdminId, level } = req.body;
        if (!subAdminId || !level)
            return res.status(400).json({ error: 'missing_payload' });
        // Verify sub-admin exists
        let subAdmin = await User_1.User.findById(subAdminId).lean();
        if (!subAdmin) {
            subAdmin = await OutlookUser_1.OutlookUser.findById(subAdminId).lean();
        }
        if (!subAdmin || (subAdmin.role !== 'SUBADMIN' && subAdmin.role !== 'AEFE')) {
            return res.status(400).json({ error: 'invalid_subadmin' });
        }
        // Find the active school year
        const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!activeYear)
            return res.status(400).json({ error: 'no_active_year' });
        // Find all classes in this level for the active school year
        const classes = await Class_1.ClassModel.find({ level, schoolYearId: String(activeYear._id) }).lean();
        const classIds = classes.map(c => String(c._id));
        if (classIds.length === 0) {
            return res.json({ count: 0, message: 'No classes found for this level in active year' });
        }
        // Find all teachers assigned to these classes
        const teacherAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: { $in: classIds } }).lean();
        const teacherIds = [...new Set(teacherAssignments.map(ta => ta.teacherId))];
        if (teacherIds.length === 0) {
            return res.json({ count: 0, message: 'No teachers found for this level' });
        }
        // Create assignments
        let count = 0;
        for (const teacherId of teacherIds) {
            await SubAdminAssignment_1.SubAdminAssignment.findOneAndUpdate({ subAdminId, teacherId }, {
                subAdminId,
                teacherId,
                assignedBy: req.user.userId,
                assignedAt: new Date(),
            }, { upsert: true });
            count++;
        }
        // Also update RoleScope to persist the level assignment
        await RoleScope_1.RoleScope.findOneAndUpdate({ userId: subAdminId }, { $addToSet: { levels: level } }, { upsert: true, new: true });
        res.json({ count, message: `Assigned ${count} teachers to sub-admin` });
    }
    catch (e) {
        res.status(500).json({ error: 'bulk_assign_failed', message: e.message });
    }
});
// Admin: Assign teachers to sub-admin
exports.subAdminAssignmentsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { subAdminId, teacherId } = req.body;
        if (!subAdminId || !teacherId)
            return res.status(400).json({ error: 'missing_payload' });
        // Verify sub-admin exists and has SUBADMIN role
        let subAdmin = await User_1.User.findById(subAdminId).lean();
        if (!subAdmin) {
            subAdmin = await OutlookUser_1.OutlookUser.findById(subAdminId).lean();
        }
        if (!subAdmin || subAdmin.role !== 'SUBADMIN') {
            return res.status(400).json({ error: 'invalid_subadmin' });
        }
        // Verify teacher exists and has TEACHER role
        let teacher = await User_1.User.findById(teacherId).lean();
        if (!teacher) {
            teacher = await OutlookUser_1.OutlookUser.findById(teacherId).lean();
        }
        if (!teacher || teacher.role !== 'TEACHER') {
            return res.status(400).json({ error: 'invalid_teacher' });
        }
        // Create or update assignment
        const assignment = await SubAdminAssignment_1.SubAdminAssignment.findOneAndUpdate({ subAdminId, teacherId }, {
            subAdminId,
            teacherId,
            assignedBy: req.user.userId,
            assignedAt: new Date(),
        }, { upsert: true, new: true });
        res.json(assignment);
    }
    catch (e) {
        res.status(500).json({ error: 'create_failed', message: e.message });
    }
});
// Get teachers for a sub-admin
exports.subAdminAssignmentsRouter.get('/subadmin/:subAdminId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const { subAdminId } = req.params;
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({ subAdminId }).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        const [teachers, outlookTeachers] = await Promise.all([
            User_1.User.find({ _id: { $in: teacherIds } }).lean(),
            OutlookUser_1.OutlookUser.find({ _id: { $in: teacherIds } }).lean()
        ]);
        const allTeachers = [...teachers, ...outlookTeachers];
        res.json(allTeachers);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Get all sub-admin level assignments
exports.subAdminAssignmentsRouter.get('/levels', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const scopes = await RoleScope_1.RoleScope.find({ levels: { $exists: true, $not: { $size: 0 } } }).lean();
        const userIds = scopes.map(s => s.userId);
        const [users, outlookUsers] = await Promise.all([
            User_1.User.find({ _id: { $in: userIds } }).lean(),
            OutlookUser_1.OutlookUser.find({ _id: { $in: userIds } }).lean()
        ]);
        const allUsers = [...users, ...outlookUsers];
        const result = scopes.map(scope => {
            const user = allUsers.find(u => String(u._id) === scope.userId);
            return {
                subAdminId: scope.userId,
                subAdminName: user ? (user.displayName || user.email) : 'Unknown',
                levels: scope.levels
            };
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Remove a level assignment from a sub-admin
exports.subAdminAssignmentsRouter.delete('/levels/:subAdminId/:level', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { subAdminId, level } = req.params;
        await RoleScope_1.RoleScope.findOneAndUpdate({ userId: subAdminId }, { $pull: { levels: level } });
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'delete_failed', message: e.message });
    }
});
// Admin: Delete assignment
exports.subAdminAssignmentsRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        await SubAdminAssignment_1.SubAdminAssignment.findByIdAndDelete(id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'delete_failed', message: e.message });
    }
});
// Admin: Get all assignments
exports.subAdminAssignmentsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const assignments = await SubAdminAssignment_1.SubAdminAssignment.find({}).lean();
        const subAdminIds = assignments.map(a => a.subAdminId);
        const teacherIds = assignments.map(a => a.teacherId);
        const allUserIds = [...new Set([...subAdminIds, ...teacherIds])];
        const [users, outlookUsers] = await Promise.all([
            User_1.User.find({ _id: { $in: allUserIds } }).lean(),
            OutlookUser_1.OutlookUser.find({ _id: { $in: allUserIds } }).lean()
        ]);
        const allUsers = [...users, ...outlookUsers];
        const result = assignments.map(a => {
            const subAdmin = allUsers.find(u => String(u._id) === a.subAdminId);
            const teacher = allUsers.find(u => String(u._id) === a.teacherId);
            return {
                ...a,
                subAdminName: subAdmin ? (subAdmin.displayName || subAdmin.email) : 'Unknown',
                teacherName: teacher ? (teacher.displayName || teacher.email) : 'Unknown'
            };
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// SubAdmin: Get teacher progress overview
exports.subAdminAssignmentsRouter.get('/teacher-progress', (0, auth_1.requireAuth)(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = req.user.userId;
        // Get assigned levels
        const scope = await RoleScope_1.RoleScope.findOne({ userId: subAdminId }).lean();
        if (!scope || !scope.levels || scope.levels.length === 0) {
            return res.json([]);
        }
        const levels = scope.levels;
        // Get active school year
        const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!activeYear) {
            return res.status(400).json({ error: 'no_active_year' });
        }
        // Find classes
        const classes = await Class_1.ClassModel.find({
            level: { $in: levels },
            schoolYearId: String(activeYear._id)
        }).lean();
        if (classes.length === 0)
            return res.json([]);
        const classIds = classes.map(c => String(c._id));
        // Find teachers for these classes
        const teacherAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean();
        const teacherIds = [...new Set(teacherAssignments.map(ta => ta.teacherId))];
        const teachers = await User_1.User.find({ _id: { $in: teacherIds } }).lean();
        const teacherMap = new Map(teachers.map(t => [String(t._id), t]));
        // Find enrollments
        const enrollments = await Enrollment_1.Enrollment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        // Find assignments
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds }
        }).lean();
        // Get Templates and Competencies info
        const templateIds = [...new Set(assignments.map(a => a.templateId))];
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).lean();
        const allCompetencies = await Competency_1.Competency.find({}).lean();
        const compMap = new Map(allCompetencies.map(c => [String(c._id), c]));
        const allCategories = await Category_1.Category.find({}).lean();
        const catMap = new Map(allCategories.map(c => [String(c._id), c]));
        // Helper to extract competencies from template
        // (Not used for language_toggle logic anymore, but kept if needed for other things)
        const getTemplateCompetencies = (template) => {
            // ...
            return new Set();
        };
        // Build result per class
        const result = classes.map(cls => {
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
                // Find student level for filtering
                const studentId = assignment.studentId;
                const enrollment = enrollments.find(e => e.studentId === studentId);
                // We don't have student object here easily, but we can try to find it or use class level
                // Assuming class level is sufficient or we can fetch students if needed.
                // For teacher progress, using class level is a reasonable approximation if student level is missing.
                const level = cls.level;
                template.pages.forEach((page, pageIdx) => {
                    (page.blocks || []).forEach((block, blockIdx) => {
                        if (block.type === 'language_toggle') {
                            const key = `language_toggle_${pageIdx}_${blockIdx}`;
                            const overrideItems = assignmentData[key];
                            const items = overrideItems || block.props.items || [];
                            items.forEach((item) => {
                                // Check level
                                let isAssigned = true;
                                if (item.levels && Array.isArray(item.levels) && item.levels.length > 0) {
                                    if (!level || !item.levels.includes(level)) {
                                        isAssigned = false;
                                    }
                                }
                                if (isAssigned) {
                                    const lang = item.type || item.label || 'Autre';
                                    if (!categoryStats[lang]) {
                                        categoryStats[lang] = { total: 0, filled: 0, name: lang };
                                    }
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
        res.json(result);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch teacher progress' });
    }
});
