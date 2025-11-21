"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentsRouter = void 0;
const express_1 = require("express");
const Student_1 = require("../models/Student");
const Enrollment_1 = require("../models/Enrollment");
const Class_1 = require("../models/Class");
const StudentCompetencyStatus_1 = require("../models/StudentCompetencyStatus");
const auth_1 = require("../auth");
exports.studentsRouter = (0, express_1.Router)();
exports.studentsRouter.get('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const { id } = req.params;
    const student = await Student_1.Student.findById(id).lean();
    if (!student)
        return res.status(404).json({ error: 'not_found' });
    const enrollments = await Enrollment_1.Enrollment.find({ studentId: id }).lean();
    res.json({ ...student, enrollments });
});
exports.studentsRouter.get('/:id/competencies', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const { id } = req.params;
    const statuses = await StudentCompetencyStatus_1.StudentCompetencyStatus.find({ studentId: id }).lean();
    res.json(statuses);
});
exports.studentsRouter.patch('/:id/competencies/:compId', (0, auth_1.requireAuth)(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id, compId } = req.params;
    const { en, fr, ar, note } = req.body;
    const now = new Date();
    const updated = await StudentCompetencyStatus_1.StudentCompetencyStatus.findOneAndUpdate({ studentId: id, competencyId: compId }, { en, fr, ar, note, updatedAt: now, updatedBy: req.user.userId }, { new: true });
    if (updated)
        return res.json(updated);
    const created = await StudentCompetencyStatus_1.StudentCompetencyStatus.create({ studentId: id, competencyId: compId, en: !!en, fr: !!fr, ar: !!ar, note: note ?? null, updatedAt: now, updatedBy: req.user.userId });
    res.json(created);
});
exports.studentsRouter.patch('/:id/competencies/bulk', (0, auth_1.requireAuth)(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    const items = req.body?.items ?? [];
    const userId = req.user.userId;
    const now = new Date();
    for (const i of items) {
        const updated = await StudentCompetencyStatus_1.StudentCompetencyStatus.findOneAndUpdate({ studentId: id, competencyId: i.competencyId }, { en: i.en, fr: i.fr, ar: i.ar, note: i.note ?? null, updatedAt: now, updatedBy: userId }, { new: true });
        if (!updated) {
            await StudentCompetencyStatus_1.StudentCompetencyStatus.create({ studentId: id, competencyId: i.competencyId, en: !!i.en, fr: !!i.fr, ar: !!i.ar, note: i.note ?? null, updatedAt: now, updatedBy: userId });
        }
    }
    res.json({ ok: true });
});
exports.studentsRouter.get('/by-class/:classId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const { classId } = req.params;
    const enrolls = await Enrollment_1.Enrollment.find({ classId }).lean();
    const ids = enrolls.map(e => e.studentId);
    const students = await Student_1.Student.find({ _id: { $in: ids } }).lean();
    res.json(students);
});
exports.studentsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { firstName, lastName, dateOfBirth, parentName, parentPhone, classId } = req.body;
    if (!firstName || !lastName || !dateOfBirth || !classId)
        return res.status(400).json({ error: 'missing_payload' });
    const dob = new Date(dateOfBirth);
    const key = `${String(firstName).toLowerCase()}_${String(lastName).toLowerCase()}_${dob.toISOString().slice(0, 10)}`;
    const existing = await Student_1.Student.findOne({ logicalKey: key });
    let student;
    if (existing) {
        student = await Student_1.Student.findByIdAndUpdate(existing._id, { firstName, lastName, dateOfBirth: dob, parentName, parentPhone }, { new: true });
    }
    else {
        student = await Student_1.Student.create({ logicalKey: key, firstName, lastName, dateOfBirth: dob, parentName, parentPhone });
    }
    const existsEnroll = await Enrollment_1.Enrollment.findOne({ studentId: String(student._id), classId });
    if (!existsEnroll) {
        const clsDoc = await Class_1.ClassModel.findById(classId).lean();
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId, schoolYearId: clsDoc ? clsDoc.schoolYearId : '' });
    }
    res.json(student);
});
