"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherAssignmentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const Class_1 = require("../models/Class");
const User_1 = require("../models/User");
const OutlookUser_1 = require("../models/OutlookUser");
const Enrollment_1 = require("../models/Enrollment");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
exports.teacherAssignmentsRouter = (0, express_1.Router)();
// Admin: Assign teacher to class
exports.teacherAssignmentsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { teacherId, classId, languages, isProfPolyvalent } = req.body;
        if (!teacherId || !classId)
            return res.status(400).json({ error: 'missing_payload' });
        // Verify teacher exists and has TEACHER role (check both User and OutlookUser)
        let teacher = await User_1.User.findById(teacherId).lean();
        if (!teacher) {
            teacher = await OutlookUser_1.OutlookUser.findById(teacherId).lean();
        }
        if (!teacher || teacher.role !== 'TEACHER') {
            return res.status(400).json({ error: 'invalid_teacher' });
        }
        // Verify class exists and get school year
        const classDoc = await Class_1.ClassModel.findById(classId).lean();
        if (!classDoc)
            return res.status(404).json({ error: 'class_not_found' });
        // Create or update assignment
        const assignment = await TeacherClassAssignment_1.TeacherClassAssignment.findOneAndUpdate({ teacherId, classId }, {
            teacherId,
            classId,
            schoolYearId: classDoc.schoolYearId,
            languages: languages || [],
            isProfPolyvalent: !!isProfPolyvalent,
            assignedBy: req.user.userId,
            assignedAt: new Date(),
        }, { upsert: true, new: true });
        // Update existing template assignments for students in this class
        // Find all active enrollments for this class
        const enrollments = await Enrollment_1.Enrollment.find({
            classId,
            schoolYearId: classDoc.schoolYearId,
            status: 'active'
        }).select('studentId').lean();
        if (enrollments.length > 0) {
            const studentIds = enrollments.map(e => e.studentId);
            // Add teacher to assignedTeachers for active templates
            await TemplateAssignment_1.TemplateAssignment.updateMany({
                studentId: { $in: studentIds },
                status: { $in: ['draft', 'in_progress'] }
            }, { $addToSet: { assignedTeachers: teacherId } });
        }
        res.json(assignment);
    }
    catch (e) {
        res.status(500).json({ error: 'create_failed', message: e.message });
    }
});
// Admin/SubAdmin: Get classes for a teacher
exports.teacherAssignmentsRouter.get('/teacher/:teacherId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const { teacherId } = req.params;
        const assignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ teacherId }).lean();
        const classIds = assignments.map(a => a.classId);
        const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
        res.json(classes);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Admin: Delete assignment
exports.teacherAssignmentsRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const assignment = await TeacherClassAssignment_1.TeacherClassAssignment.findById(id).lean();
        if (assignment) {
            await TeacherClassAssignment_1.TeacherClassAssignment.findByIdAndDelete(id);
            // Remove teacher from template assignments for students in this class
            const enrollments = await Enrollment_1.Enrollment.find({
                classId: assignment.classId,
                schoolYearId: assignment.schoolYearId,
                status: 'active'
            }).select('studentId').lean();
            if (enrollments.length > 0) {
                const studentIds = enrollments.map(e => e.studentId);
                // Remove teacher from assignedTeachers for active templates
                await TemplateAssignment_1.TemplateAssignment.updateMany({
                    studentId: { $in: studentIds },
                    status: { $in: ['draft', 'in_progress'] }
                }, { $pull: { assignedTeachers: assignment.teacherId } });
            }
        }
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'delete_failed', message: e.message });
    }
});
// Admin: Get all assignments
exports.teacherAssignmentsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const filter = {};
        if (req.query.schoolYearId) {
            filter.schoolYearId = req.query.schoolYearId;
        }
        const assignments = await TeacherClassAssignment_1.TeacherClassAssignment.find(filter).lean();
        const teacherIds = assignments.map(a => a.teacherId);
        const classIds = assignments.map(a => a.classId);
        const [teachers, outlookTeachers, classes] = await Promise.all([
            User_1.User.find({ _id: { $in: teacherIds } }).lean(),
            OutlookUser_1.OutlookUser.find({ _id: { $in: teacherIds } }).lean(),
            Class_1.ClassModel.find({ _id: { $in: classIds } }).lean()
        ]);
        const allTeachers = [...teachers, ...outlookTeachers];
        const result = assignments.map(a => {
            const teacher = allTeachers.find(t => String(t._id) === a.teacherId);
            const classDoc = classes.find(c => String(c._id) === a.classId);
            return {
                ...a,
                teacherName: teacher ? (teacher.displayName || teacher.email) : 'Unknown',
                className: classDoc ? classDoc.name : 'Unknown'
            };
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Admin: Import assignments from previous year
exports.teacherAssignmentsRouter.post('/import', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { sourceAssignments, targetYearId } = req.body;
        if (!sourceAssignments || !Array.isArray(sourceAssignments) || !targetYearId) {
            return res.status(400).json({ error: 'missing_payload' });
        }
        // Get all classes for target year to lookup by name
        const targetClasses = await Class_1.ClassModel.find({ schoolYearId: targetYearId }).lean();
        const classMap = new Map(targetClasses.map(c => [c.name, String(c._id)]));
        let importedCount = 0;
        const errors = [];
        for (const assignment of sourceAssignments) {
            // Skip if no class name provided
            if (!assignment.className)
                continue;
            const targetClassId = classMap.get(assignment.className);
            if (!targetClassId) {
                errors.push(`Classe '${assignment.className}' introuvable dans l'année sélectionnée`);
                continue;
            }
            // Create assignment
            try {
                await TeacherClassAssignment_1.TeacherClassAssignment.findOneAndUpdate({ teacherId: assignment.teacherId, classId: targetClassId }, {
                    teacherId: assignment.teacherId,
                    classId: targetClassId,
                    schoolYearId: targetYearId,
                    languages: assignment.languages || [],
                    isProfPolyvalent: !!assignment.isProfPolyvalent,
                    assignedBy: req.user.userId,
                    assignedAt: new Date(),
                }, { upsert: true, new: true });
                importedCount++;
            }
            catch (err) {
                console.error('Error importing assignment', err);
            }
        }
        res.json({ importedCount, errors });
    }
    catch (e) {
        res.status(500).json({ error: 'import_failed', message: e.message });
    }
});
