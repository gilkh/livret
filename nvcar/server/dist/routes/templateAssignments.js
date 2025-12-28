"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.templateAssignmentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const Student_1 = require("../models/Student");
const User_1 = require("../models/User");
const Enrollment_1 = require("../models/Enrollment");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const Class_1 = require("../models/Class");
const SchoolYear_1 = require("../models/SchoolYear");
const signatureService_1 = require("../services/signatureService");
const rolloverService_1 = require("../services/rolloverService");
const transactionUtils_1 = require("../utils/transactionUtils");
exports.templateAssignmentsRouter = (0, express_1.Router)();
// Admin: Assign template to all students in a level
exports.templateAssignmentsRouter.post('/bulk-level', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        console.log('[template-assignments] POST /bulk-level', { time: new Date().toISOString(), body: req.body, user: req.user });
        const { templateId, level, schoolYearId } = req.body;
        if (!templateId || !level)
            return res.status(400).json({ error: 'missing_payload' });
        // Verify template exists
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template)
            return res.status(404).json({ error: 'template_not_found' });
        let targetYearId = schoolYearId;
        if (!targetYearId) {
            // Find the active school year
            const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
            if (!activeYear)
                return res.status(400).json({ error: 'no_active_year' });
            targetYearId = String(activeYear._id);
        }
        // Find all classes in this level for the active school year
        const classes = await Class_1.ClassModel.find({ level, schoolYearId: targetYearId }).lean();
        const classIds = classes.map(c => String(c._id));
        if (classIds.length === 0) {
            return res.json({ count: 0, message: 'No classes found for this level in active year' });
        }
        // Find all students in these classes with active enrollments
        const enrollments = await Enrollment_1.Enrollment.find({
            classId: { $in: classIds },
            status: { $ne: 'archived' }
        }).lean();
        const studentIds = [...new Set(enrollments.map(e => e.studentId))];
        if (studentIds.length === 0) {
            return res.json({ count: 0, message: 'No students found for this level' });
        }
        // Pre-fetch teacher assignments for all classes involved
        const allTeacherAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: { $in: classIds } }).lean();
        const teacherMap = new Map(); // classId -> teacherIds[]
        for (const ta of allTeacherAssignments) {
            if (!teacherMap.has(ta.classId))
                teacherMap.set(ta.classId, []);
            teacherMap.get(ta.classId)?.push(ta.teacherId);
        }
        // Create assignments
        const enrollmentByStudent = new Map();
        const statusPriority = { active: 3, promoted: 2, archived: 1 };
        const isBetterEnrollment = (candidate, current) => {
            if (!current)
                return true;
            const candScore = (statusPriority[candidate?.status] ?? 0) - (candidate?.classId ? 0 : 1);
            const curScore = (statusPriority[current?.status] ?? 0) - (current?.classId ? 0 : 1);
            if (candScore !== curScore)
                return candScore > curScore;
            return String(candidate?._id || '') > String(current?._id || '');
        };
        for (const e of enrollments) {
            const sid = String(e.studentId);
            const cur = enrollmentByStudent.get(sid);
            if (isBetterEnrollment(e, cur))
                enrollmentByStudent.set(sid, e);
        }
        const selectedStudentIds = Array.from(enrollmentByStudent.keys());
        const now = new Date();
        const assignedBy = req.user.userId;
        const force = !!req.body.force;
        // Execute bulk assignment within a transaction
        const result = await (0, transactionUtils_1.withTransaction)(async (session) => {
            const ops = Array.from(enrollmentByStudent.values()).map((enrollment) => {
                const teachers = (enrollment.classId && teacherMap.get(enrollment.classId)) || [];
                const setOnInsert = {
                    templateId,
                    studentId: enrollment.studentId,
                    status: 'draft',
                    completionSchoolYearId: String(targetYearId),
                    isCompleted: false,
                    completedAt: null,
                    completedBy: null,
                    isCompletedSem1: false,
                    completedAtSem1: null,
                    isCompletedSem2: false,
                    completedAtSem2: null,
                    teacherCompletions: [],
                    createdAt: now,
                    assignedBy,
                    assignedAt: now,
                };
                const setFields = {
                    templateVersion: template.currentVersion || 1,
                    assignedTeachers: teachers,
                };
                if (force) {
                    // When force:true we intentionally reset progress/status fields
                    const rolloverUpdate = (0, rolloverService_1.getRolloverUpdate)(String(targetYearId), assignedBy);
                    Object.assign(setFields, rolloverUpdate);
                    // Remove colliding fields from setOnInsert
                    Object.keys(rolloverUpdate).forEach(key => {
                        delete setOnInsert[key];
                    });
                }
                const updateObj = { $setOnInsert: setOnInsert, $set: setFields };
                return {
                    updateOne: {
                        filter: { templateId, studentId: enrollment.studentId },
                        update: updateObj,
                        upsert: true,
                    },
                };
            });
            const chunkSize = 1000;
            let totalProcessed = 0;
            for (let i = 0; i < ops.length; i += chunkSize) {
                const chunk = ops.slice(i, i + chunkSize);
                if (!chunk.length)
                    continue;
                try {
                    await TemplateAssignment_1.TemplateAssignment.bulkWrite(chunk, { ordered: false, session });
                    totalProcessed += chunk.length;
                }
                catch (e) {
                    const writeErrors = e?.writeErrors || [];
                    const hasNonDup = writeErrors.some((we) => (we?.code !== 11000));
                    // With a unique (templateId, studentId) index, concurrent upserts can produce
                    // duplicate-key errors; treat those as benign.
                    if (writeErrors.length > 0 && !hasNonDup) {
                        totalProcessed += chunk.length - writeErrors.length;
                    }
                    else {
                        throw e;
                    }
                }
            }
            // If the carnet already exists from a previous year, roll it over to this year
            // by stamping completionSchoolYearId and resetting year-bound workflow fields.
            await TemplateAssignment_1.TemplateAssignment.updateMany({
                templateId,
                studentId: { $in: selectedStudentIds },
                completionSchoolYearId: { $ne: String(targetYearId) }
            }, {
                $set: (0, rolloverService_1.getRolloverUpdate)(String(targetYearId), assignedBy),
                $inc: { dataVersion: 1 }
            }, { session });
            return { count: ops.length, totalProcessed };
        });
        if (!result.success) {
            return res.status(500).json({
                error: 'bulk_assign_failed',
                message: result.error,
                transactionUsed: result.usedTransaction
            });
        }
        const { count } = result.data;
        res.json({
            count,
            message: `Assigned template to ${count} students`,
            transactionUsed: result.usedTransaction
        });
    }
    catch (e) {
        res.status(500).json({ error: 'bulk_assign_failed', message: e.message });
    }
});
// Admin: Delete bulk level assignments
exports.templateAssignmentsRouter.delete('/bulk-level/:templateId/:level', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { templateId, level } = req.params;
        const { schoolYearId } = req.query;
        let targetYearId = schoolYearId;
        if (!targetYearId) {
            // Find students in this level for active year
            const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
            if (!activeYear)
                return res.status(400).json({ error: 'no_active_year' });
            targetYearId = String(activeYear._id);
        }
        const classes = await Class_1.ClassModel.find({ level, schoolYearId: targetYearId }).lean();
        const classIds = classes.map(c => String(c._id));
        if (classIds.length === 0)
            return res.json({ ok: true, count: 0 });
        const enrollments = await Enrollment_1.Enrollment.find({ classId: { $in: classIds } }).lean();
        const studentIds = enrollments.map(e => e.studentId);
        if (studentIds.length === 0)
            return res.json({ ok: true, count: 0 });
        const result = await TemplateAssignment_1.TemplateAssignment.deleteMany({
            templateId,
            studentId: { $in: studentIds }
        });
        res.json({ ok: true, count: result.deletedCount });
    }
    catch (e) {
        res.status(500).json({ error: 'delete_failed', message: e.message });
    }
});
// Admin: Assign template to student with teachers
exports.templateAssignmentsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { templateId, studentId, assignedTeachers, schoolYearId } = req.body;
        if (!templateId || !studentId)
            return res.status(400).json({ error: 'missing_payload' });
        // Verify template exists
        const template = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
        if (!template)
            return res.status(404).json({ error: 'template_not_found' });
        // Verify student exists
        const student = await Student_1.Student.findById(studentId).lean();
        if (!student)
            return res.status(404).json({ error: 'student_not_found' });
        // Verify all assigned teachers exist and have TEACHER role
        let teachersToAssign = assignedTeachers || [];
        // If no teachers are explicitly assigned, try to auto-assign teachers from the student's class
        if (!teachersToAssign || teachersToAssign.length === 0) {
            // Find student's enrollment to get their class
            const enrollment = await Enrollment_1.Enrollment.findOne({ studentId }).lean();
            if (enrollment && enrollment.classId) {
                // Find teachers assigned to this class
                const teacherAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId: enrollment.classId }).lean();
                teachersToAssign = teacherAssignments.map(ta => ta.teacherId);
            }
        }
        // Verify all assigned teachers exist and have TEACHER role
        if (teachersToAssign && Array.isArray(teachersToAssign) && teachersToAssign.length > 0) {
            for (const teacherId of teachersToAssign) {
                const teacher = await User_1.User.findById(teacherId).lean();
                if (!teacher || teacher.role !== 'TEACHER') {
                    return res.status(400).json({ error: 'invalid_teacher', teacherId });
                }
            }
        }
        let targetYearId = schoolYearId;
        if (!targetYearId) {
            const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
            if (!activeYear)
                return res.status(400).json({ error: 'no_active_year' });
            targetYearId = String(activeYear._id);
        }
        const existing = await TemplateAssignment_1.TemplateAssignment.findOne({ templateId, studentId })
            .select('completionSchoolYearId')
            .lean();
        const yearChanged = !!existing && String(existing.completionSchoolYearId || '') !== String(targetYearId);
        // Create or update assignment (respect existing progress unless force:true)
        const forceSingle = !!req.body.force;
        const assignedAt = new Date();
        const setOnInsertSingle = {
            templateId,
            studentId,
            status: 'draft',
            completionSchoolYearId: String(targetYearId),
            isCompleted: false,
            completedAt: null,
            completedBy: null,
            isCompletedSem1: false,
            completedAtSem1: null,
            isCompletedSem2: false,
            completedAtSem2: null,
            teacherCompletions: [],
            createdAt: assignedAt,
            assignedBy: req.user.userId,
            assignedAt: assignedAt,
        };
        const setFieldsSingle = {
            templateVersion: template.currentVersion || 1,
            assignedTeachers: teachersToAssign,
        };
        const assignedBy = req.user.userId;
        if (yearChanged && !forceSingle) {
            Object.assign(setFieldsSingle, (0, rolloverService_1.getRolloverUpdate)(String(targetYearId), assignedBy));
        }
        if (forceSingle) {
            const rolloverUpdate = (0, rolloverService_1.getRolloverUpdate)(String(targetYearId), assignedBy);
            Object.assign(setFieldsSingle, rolloverUpdate);
            // Remove colliding fields from setOnInsert
            Object.keys(rolloverUpdate).forEach(key => {
                delete setOnInsertSingle[key];
            });
        }
        const assignment = await TemplateAssignment_1.TemplateAssignment.findOneAndUpdate({ templateId, studentId }, { $setOnInsert: setOnInsertSingle, $set: setFieldsSingle }, { upsert: true, new: true });
        res.json(await (0, signatureService_1.populateSignatures)(assignment));
    }
    catch (e) {
        res.status(500).json({ error: 'create_failed', message: e.message });
    }
});
// Get templates for a student
exports.templateAssignmentsRouter.get('/student/:studentId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { studentId } = req.params;
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ studentId }).lean();
        // Fetch template details
        const templateIds = assignments.map(a => a.templateId);
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).lean();
        // Combine assignment data with template data
        const result = assignments.map(assignment => {
            const template = templates.find(t => String(t._id) === assignment.templateId);
            return {
                ...assignment,
                template,
            };
        });
        res.json(await (0, signatureService_1.populateSignatures)(result));
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Get all template assignments for a teacher
exports.templateAssignmentsRouter.get('/teacher/:teacherId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { teacherId } = req.params;
        const assignments = await TemplateAssignment_1.TemplateAssignment.find({ assignedTeachers: teacherId }).lean();
        // Fetch template and student details
        const templateIds = assignments.map(a => a.templateId);
        const studentIds = assignments.map(a => a.studentId);
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).lean();
        const students = await Student_1.Student.find({ _id: { $in: studentIds } }).lean();
        // Combine data
        const result = assignments.map(assignment => {
            const template = templates.find(t => String(t._id) === assignment.templateId);
            const student = students.find(s => String(s._id) === assignment.studentId);
            return {
                ...assignment,
                template,
                student,
            };
        });
        res.json(await (0, signatureService_1.populateSignatures)(result));
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
// Update assignment status
exports.templateAssignmentsRouter.patch('/:id/status', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const user = req.user;
        if (!['draft', 'in_progress', 'completed', 'signed'].includes(status)) {
            return res.status(400).json({ error: 'invalid_status' });
        }
        // Retrieve existing assignment to check current state
        const assignment = await TemplateAssignment_1.TemplateAssignment.findById(id).lean();
        if (!assignment)
            return res.status(404).json({ error: 'not_found' });
        const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        const activeSemester = activeYear?.activeSemester || 1;
        let newStatus = status;
        let teacherCompletions = assignment.teacherCompletions || [];
        let isCompleted = assignment.isCompleted;
        let completedAt = assignment.completedAt;
        let completedBy = assignment.completedBy;
        let isCompletedSem1 = assignment.isCompletedSem1;
        let completedAtSem1 = assignment.completedAtSem1;
        let isCompletedSem2 = assignment.isCompletedSem2;
        let completedAtSem2 = assignment.completedAtSem2;
        const now = new Date();
        // Special handling for TEACHER role: only update their part
        if (user.role === 'TEACHER') {
            // Verify teacher is assigned
            if (assignment.assignedTeachers && assignment.assignedTeachers.includes(user.userId)) {
                const isMarkingDone = status === 'completed';
                // Update this teacher's completion status
                teacherCompletions = teacherCompletions.filter((tc) => tc.teacherId !== user.userId);
                // Find previous completion entry to preserve other semester data if needed
                const prevTc = (assignment.teacherCompletions || []).find((tc) => tc.teacherId === user.userId);
                const newTc = {
                    teacherId: user.userId,
                    completed: isMarkingDone,
                    completedAt: isMarkingDone ? now : undefined,
                    completedSem1: prevTc?.completedSem1,
                    completedAtSem1: prevTc?.completedAtSem1,
                    completedSem2: prevTc?.completedSem2,
                    completedAtSem2: prevTc?.completedAtSem2
                };
                if (activeSemester === 1) {
                    newTc.completedSem1 = isMarkingDone;
                    newTc.completedAtSem1 = isMarkingDone ? now : undefined;
                }
                else {
                    newTc.completedSem2 = isMarkingDone;
                    newTc.completedAtSem2 = isMarkingDone ? now : undefined;
                }
                teacherCompletions.push(newTc);
                // Check if ALL assigned teachers are done
                const assignedTeachers = assignment.assignedTeachers || [];
                const allDone = assignedTeachers.every((tid) => teacherCompletions.some((tc) => tc.teacherId === tid && tc.completed));
                const allDoneSem1 = assignedTeachers.every((tid) => teacherCompletions.some((tc) => tc.teacherId === tid && tc.completedSem1));
                const allDoneSem2 = assignedTeachers.every((tid) => teacherCompletions.some((tc) => tc.teacherId === tid && tc.completedSem2));
                isCompletedSem1 = allDoneSem1;
                if (allDoneSem1 && !completedAtSem1)
                    completedAtSem1 = now;
                if (!allDoneSem1)
                    completedAtSem1 = undefined;
                isCompletedSem2 = allDoneSem2;
                if (allDoneSem2 && !completedAtSem2)
                    completedAtSem2 = now;
                if (!allDoneSem2)
                    completedAtSem2 = undefined;
                if (allDone) {
                    newStatus = 'completed';
                    isCompleted = true;
                    completedAt = now;
                    completedBy = user.userId; // Last one to complete
                }
                else {
                    newStatus = 'in_progress';
                    isCompleted = false;
                    completedAt = undefined;
                    completedBy = undefined;
                }
            }
        }
        else {
            // Admin override
            if (status === 'completed') {
                isCompleted = true;
                completedAt = now;
                completedBy = user.userId;
                if (activeSemester === 1) {
                    isCompletedSem1 = true;
                    completedAtSem1 = now;
                }
                else {
                    isCompletedSem2 = true;
                    completedAtSem2 = now;
                }
            }
            else if (status === 'in_progress' || status === 'draft') {
                isCompleted = false;
                completedAt = null;
                completedBy = null;
            }
        }
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(id, {
            status: newStatus,
            teacherCompletions,
            isCompleted,
            completedAt,
            completedBy,
            isCompletedSem1,
            completedAtSem1,
            isCompletedSem2,
            completedAtSem2
        }, { new: true });
        res.json(await (0, signatureService_1.populateSignatures)(updated));
    }
    catch (e) {
        res.status(500).json({ error: 'update_failed', message: e.message });
    }
});
// Admin: Delete assignment
exports.templateAssignmentsRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        await TemplateAssignment_1.TemplateAssignment.findByIdAndDelete(id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'delete_failed', message: e.message });
    }
});
// Admin: Get all assignments
exports.templateAssignmentsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { schoolYearId } = req.query;
        let dateFilter = {};
        let studentIds = [];
        let enrollments = [];
        if (schoolYearId) {
            // We don't filter by date because assignments might be created before the school year starts (during setup)
            /*
            const sy = await SchoolYear.findById(schoolYearId).lean()
            if (sy) {
                dateFilter = {
                    assignedAt: {
                        $gte: sy.startDate,
                        $lte: sy.endDate
                    }
                }
            }
            */
            enrollments = await Enrollment_1.Enrollment.find({ schoolYearId }).lean();
            studentIds = enrollments.map(e => e.studentId);
        }
        else {
            // Fallback: get all enrollments (might be slow and incorrect for history)
            enrollments = await Enrollment_1.Enrollment.find({}).lean();
            // We don't filter assignments by date if no year specified
        }
        const query = { ...dateFilter };
        // Enforce "Current State Only" rule:
        // If a specific year is requested, we ONLY return assignments that are actively working on that year.
        // Historical data must be fetched from SavedGradebooks.
        if (schoolYearId) {
            query.completionSchoolYearId = schoolYearId;
        }
        if (studentIds.length > 0) {
            query.studentId = { $in: studentIds };
        }
        else if (schoolYearId) {
            // If year specified but no students found, return empty
            return res.json([]);
        }
        const assignments = await TemplateAssignment_1.TemplateAssignment.find(query).lean();
        const templateIds = assignments.map(a => a.templateId);
        const assignmentStudentIds = assignments.map(a => a.studentId);
        const templates = await GradebookTemplate_1.GradebookTemplate.find({ _id: { $in: templateIds } }).lean();
        const students = await Student_1.Student.find({ _id: { $in: assignmentStudentIds } }).lean();
        // We already have enrollments for the year if schoolYearId is present.
        // If not, we need to fetch them.
        if (!schoolYearId) {
            enrollments = await Enrollment_1.Enrollment.find({ studentId: { $in: assignmentStudentIds } }).lean();
        }
        const classIds = enrollments.map(e => e.classId).filter(Boolean);
        const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
        const result = assignments.map(a => {
            const template = templates.find(t => String(t._id) === a.templateId);
            const student = students.find(s => String(s._id) === a.studentId);
            // Find enrollment for this student
            // If schoolYearId is present, enrollments are already filtered by year.
            // If not, we might pick a random one.
            const enrollment = enrollments.find(e => e.studentId === a.studentId);
            const cls = enrollment ? classes.find(c => String(c._id) === enrollment.classId) : null;
            return {
                ...a,
                templateName: template ? template.name : 'Unknown',
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
                className: cls ? cls.name : '',
                classId: cls ? cls._id : '',
                level: cls ? cls.level : ''
            };
        });
        res.json(await (0, signatureService_1.populateSignatures)(result));
    }
    catch (e) {
        res.status(500).json({ error: 'fetch_failed', message: e.message });
    }
});
