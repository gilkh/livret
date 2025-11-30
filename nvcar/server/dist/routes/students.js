"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentsRouter = void 0;
const express_1 = require("express");
const Student_1 = require("../models/Student");
const Enrollment_1 = require("../models/Enrollment");
const Class_1 = require("../models/Class");
const StudentCompetencyStatus_1 = require("../models/StudentCompetencyStatus");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const auth_1 = require("../auth");
exports.studentsRouter = (0, express_1.Router)();
exports.studentsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const students = await Student_1.Student.find({}).lean();
    const ids = students.map(s => String(s._id));
    const enrolls = await Enrollment_1.Enrollment.find({ studentId: { $in: ids } }).lean();
    const enrollByStudent = {};
    for (const e of enrolls)
        enrollByStudent[e.studentId] = e;
    const classIds = enrolls.map(e => e.classId);
    const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
    const classMap = {};
    for (const c of classes)
        classMap[String(c._id)] = c;
    const out = students.map(s => {
        const enr = enrollByStudent[String(s._id)];
        const cls = enr ? classMap[enr.classId] : null;
        return { ...s, classId: enr ? enr.classId : undefined, className: cls ? cls.name : undefined };
    });
    res.json(out);
});
exports.studentsRouter.get('/unassigned/:schoolYearId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { schoolYearId } = req.params;
    // Find students who are marked for this school year
    const students = await Student_1.Student.find({ schoolYearId }).lean();
    // Filter out those who already have an enrollment for this year
    const studentIds = students.map(s => String(s._id));
    const enrollments = await Enrollment_1.Enrollment.find({
        studentId: { $in: studentIds },
        schoolYearId
    }).lean();
    const enrolledStudentIds = new Set(enrollments.map(e => e.studentId));
    const unassigned = students.filter(s => !enrolledStudentIds.has(String(s._id)));
    // Find assignments with promotions for these students
    const unassignedIds = unassigned.map(s => String(s._id));
    const assignments = await TemplateAssignment_1.TemplateAssignment.find({
        studentId: { $in: unassignedIds },
        'data.promotions': { $exists: true, $not: { $size: 0 } }
    }).lean();
    const promotionMap = {};
    for (const a of assignments) {
        if (a.data && Array.isArray(a.data.promotions)) {
            const lastPromo = a.data.promotions[a.data.promotions.length - 1];
            const existing = promotionMap[a.studentId];
            if (!existing || new Date(lastPromo.date) > new Date(existing.date)) {
                promotionMap[a.studentId] = lastPromo;
            }
        }
    }
    const result = unassigned.map(s => ({
        ...s,
        promotion: promotionMap[String(s._id)]
    }));
    res.json(result);
});
exports.studentsRouter.post('/:id/assign-section', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    const { schoolYearId, level, section } = req.body; // section is 'A', 'B', etc.
    if (!schoolYearId || !level || !section)
        return res.status(400).json({ error: 'missing_params' });
    const className = `${level} ${section}`;
    // Find or create class
    let cls = await Class_1.ClassModel.findOne({ schoolYearId, name: className }).lean();
    if (!cls) {
        cls = await Class_1.ClassModel.create({
            name: className,
            level,
            schoolYearId
        });
    }
    // Create enrollment
    const existing = await Enrollment_1.Enrollment.findOne({ studentId: id, schoolYearId });
    if (existing) {
        existing.classId = String(cls._id);
        await existing.save();
    }
    else {
        await Enrollment_1.Enrollment.create({
            studentId: id,
            classId: String(cls._id),
            schoolYearId
        });
    }
    res.json({ ok: true });
});
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
    if (!firstName || !lastName || !classId)
        return res.status(400).json({ error: 'missing_payload' });
    const dob = dateOfBirth ? new Date(dateOfBirth) : new Date('2000-01-01');
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
exports.studentsRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    const data = { ...req.body };
    if (data.dateOfBirth)
        data.dateOfBirth = new Date(data.dateOfBirth);
    const updated = await Student_1.Student.findByIdAndUpdate(id, data, { new: true });
    if (req.body.classId) {
        const classId = String(req.body.classId);
        const enr = await Enrollment_1.Enrollment.findOne({ studentId: id });
        const clsDoc = await Class_1.ClassModel.findById(classId).lean();
        if (enr) {
            if (enr.classId !== classId) {
                enr.classId = classId;
                enr.schoolYearId = clsDoc ? clsDoc.schoolYearId : enr.schoolYearId;
                await enr.save();
            }
        }
        else {
            await Enrollment_1.Enrollment.create({ studentId: id, classId, schoolYearId: clsDoc ? clsDoc.schoolYearId : '' });
        }
    }
    res.json(updated);
});
