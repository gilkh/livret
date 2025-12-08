"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const Class_1 = require("../models/Class");
const TeacherClassAssignment_1 = require("../models/TeacherClassAssignment");
const Enrollment_1 = require("../models/Enrollment");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const SchoolYear_1 = require("../models/SchoolYear");
exports.repairRouter = (0, express_1.Router)();
// Repair: Sync teacher assignments for a specific class
exports.repairRouter.post('/sync-class-teachers/:classId', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const { classId } = req.params;
        // 1. Get the class and verify it exists
        const classDoc = await Class_1.ClassModel.findById(classId).lean();
        if (!classDoc)
            return res.status(404).json({ error: 'class_not_found' });
        // 2. Get all teachers assigned to this class
        const teacherAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId }).lean();
        const teacherIds = teacherAssignments.map(ta => ta.teacherId);
        if (teacherIds.length === 0) {
            return res.json({ message: 'No teachers assigned to this class', count: 0 });
        }
        // 3. Get all students in this class (active)
        const enrollments = await Enrollment_1.Enrollment.find({
            classId,
            schoolYearId: classDoc.schoolYearId,
            status: 'active'
        }).select('studentId').lean();
        const studentIds = enrollments.map(e => e.studentId);
        if (studentIds.length === 0) {
            return res.json({ message: 'No students in this class', count: 0 });
        }
        // 4. Update ALL template assignments for these students to ensure all class teachers are assigned
        // We use $addToSet to avoid duplicates
        const result = await TemplateAssignment_1.TemplateAssignment.updateMany({
            studentId: { $in: studentIds }
            // We do NOT filter by status here, we want to fix ALL assignments including completed ones
        }, {
            $addToSet: { assignedTeachers: { $each: teacherIds } }
        });
        res.json({
            message: 'Synced teacher assignments',
            updatedCount: result.modifiedCount,
            matchedCount: result.matchedCount,
            teacherCount: teacherIds.length,
            studentCount: studentIds.length
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'repair_failed', message: e.message });
    }
});
// Repair: Sync ALL classes (use with caution, might be slow)
exports.repairRouter.post('/sync-all-classes', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (!activeYear)
            return res.status(400).json({ error: 'no_active_year' });
        const classes = await Class_1.ClassModel.find({ schoolYearId: String(activeYear._id) }).lean();
        const results = [];
        for (const cls of classes) {
            const classId = String(cls._id);
            // Get teachers
            const teacherAssignments = await TeacherClassAssignment_1.TeacherClassAssignment.find({ classId }).lean();
            const teacherIds = teacherAssignments.map(ta => ta.teacherId);
            if (teacherIds.length === 0)
                continue;
            // Get students
            const enrollments = await Enrollment_1.Enrollment.find({
                classId,
                schoolYearId: String(activeYear._id),
                status: 'active'
            }).select('studentId').lean();
            const studentIds = enrollments.map(e => e.studentId);
            if (studentIds.length === 0)
                continue;
            // Update
            const result = await TemplateAssignment_1.TemplateAssignment.updateMany({
                studentId: { $in: studentIds }
            }, {
                $addToSet: { assignedTeachers: { $each: teacherIds } }
            });
            results.push({
                classId,
                className: cls.name,
                updated: result.modifiedCount
            });
        }
        res.json({ results });
    }
    catch (e) {
        res.status(500).json({ error: 'repair_failed', message: e.message });
    }
});
