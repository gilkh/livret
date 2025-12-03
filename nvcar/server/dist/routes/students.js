"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentsRouter = void 0;
const express_1 = require("express");
const Student_1 = require("../models/Student");
const Enrollment_1 = require("../models/Enrollment");
const Class_1 = require("../models/Class");
const SchoolYear_1 = require("../models/SchoolYear");
const StudentCompetencyStatus_1 = require("../models/StudentCompetencyStatus");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const auth_1 = require("../auth");
exports.studentsRouter = (0, express_1.Router)();
exports.studentsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const { schoolYearId } = req.query;
    const students = await Student_1.Student.find({}).lean();
    const ids = students.map(s => String(s._id));
    const query = { studentId: { $in: ids } };
    if (schoolYearId) {
        query.schoolYearId = schoolYearId;
        // If we are looking at a specific year, we want active or promoted enrollments for that year
        // But actually, an enrollment record is unique to a year.
    }
    else {
        // If no year specified, maybe default to active? Or return all?
        // For backward compatibility, if no year, we might get mixed results if we don't filter.
        // But the frontend should send it.
        // Let's try to find the active year if not provided?
        const activeYear = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
        if (activeYear)
            query.schoolYearId = String(activeYear._id);
    }
    const enrolls = await Enrollment_1.Enrollment.find(query).lean();
    const enrollByStudent = {};
    for (const e of enrolls)
        enrollByStudent[e.studentId] = e;
    const classIds = enrolls.map(e => e.classId).filter(Boolean); // Filter out undefined/null classIds
    const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
    const classMap = {};
    for (const c of classes)
        classMap[String(c._id)] = c;
    const out = students.map(s => {
        const enr = enrollByStudent[String(s._id)];
        const cls = enr && enr.classId ? classMap[enr.classId] : null;
        return { ...s, classId: enr ? enr.classId : undefined, className: cls ? cls.name : undefined, level: cls ? cls.level : s.level };
    });
    res.json(out);
});
exports.studentsRouter.get('/unassigned/:schoolYearId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { schoolYearId } = req.params;
    // 1. Get all enrollments for this year
    const yearEnrollments = await Enrollment_1.Enrollment.find({ schoolYearId }).lean();
    // 2. Identify students assigned to a class
    const assignedStudentIds = new Set(yearEnrollments.filter(e => e.classId).map(e => e.studentId));
    // 3. Identify students enrolled but NOT assigned (e.g. promoted)
    const enrolledUnassignedIds = yearEnrollments
        .filter(e => !e.classId)
        .map(e => e.studentId);
    // 4. Get students tagged with this schoolYearId (Legacy/Import)
    const taggedStudents = await Student_1.Student.find({ schoolYearId }).lean();
    // 5. Filter tagged students: Exclude those who are already assigned to a class
    const validTaggedStudents = taggedStudents.filter(s => !assignedStudentIds.has(String(s._id)));
    // 6. Fetch students from step 3 who were not in step 4
    const taggedIds = new Set(validTaggedStudents.map(s => String(s._id)));
    const missingIds = enrolledUnassignedIds.filter(id => !taggedIds.has(id));
    let extraStudents = [];
    if (missingIds.length > 0) {
        extraStudents = await Student_1.Student.find({ _id: { $in: missingIds } }).lean();
    }
    const unassigned = [...validTaggedStudents, ...extraStudents];
    // Find assignments with promotions for these students
    const unassignedIds = unassigned.map(s => String(s._id));
    // Find previous school year to get previous class
    const allYears = await SchoolYear_1.SchoolYear.find({}).sort({ startDate: 1 }).lean();
    const currentIndex = allYears.findIndex(y => String(y._id) === schoolYearId);
    let previousYearId = null;
    if (currentIndex > 0) {
        previousYearId = String(allYears[currentIndex - 1]._id);
    }
    const previousClassMap = {};
    if (previousYearId) {
        const prevEnrollments = await Enrollment_1.Enrollment.find({
            studentId: { $in: unassignedIds },
            schoolYearId: previousYearId
        }).lean();
        const prevClassIds = prevEnrollments.map(e => e.classId).filter(Boolean);
        const prevClasses = await Class_1.ClassModel.find({ _id: { $in: prevClassIds } }).lean();
        const prevClassIdToName = {};
        for (const c of prevClasses)
            prevClassIdToName[String(c._id)] = c.name;
        for (const e of prevEnrollments) {
            if (e.classId && prevClassIdToName[e.classId]) {
                previousClassMap[e.studentId] = prevClassIdToName[e.classId];
            }
        }
    }
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
    const result = unassigned.map(s => {
        const promo = promotionMap[String(s._id)];
        // Use nextLevel if available (staging), otherwise try promo.to (history), otherwise fallback to current level
        const effectiveLevel = s.nextLevel || (promo ? promo.to : s.level);
        return {
            ...s,
            level: effectiveLevel,
            promotion: promo,
            previousClassName: previousClassMap[String(s._id)]
        };
    });
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
    // Populate class names
    const classIds = enrollments.map(e => e.classId).filter(Boolean);
    const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
    const classMap = new Map(classes.map(c => [String(c._id), c.name]));
    const enrichedEnrollments = enrollments.map(e => ({
        ...e,
        className: e.classId ? classMap.get(e.classId) : 'Unknown'
    }));
    res.json({ ...student, enrollments: enrichedEnrollments });
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
