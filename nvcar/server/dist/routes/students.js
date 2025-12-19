"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentsRouter = void 0;
const express_1 = require("express");
const sync_1 = require("csv-parse/sync");
const Student_1 = require("../models/Student");
const Enrollment_1 = require("../models/Enrollment");
const Class_1 = require("../models/Class");
const SchoolYear_1 = require("../models/SchoolYear");
const StudentCompetencyStatus_1 = require("../models/StudentCompetencyStatus");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const SavedGradebook_1 = require("../models/SavedGradebook");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const TemplateSignature_1 = require("../models/TemplateSignature");
const Level_1 = require("../models/Level");
const auditLogger_1 = require("../utils/auditLogger");
const auth_1 = require("../auth");
const templateUtils_1 = require("../utils/templateUtils");
const cache_1 = require("../utils/cache");
exports.studentsRouter = (0, express_1.Router)();
exports.studentsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const { schoolYearId } = req.query;
    const students = await Student_1.Student.find({}).lean();
    const ids = students.map(s => String(s._id));
    const query = { studentId: { $in: ids } };
    if (schoolYearId) {
        query.schoolYearId = schoolYearId;
    }
    else {
        const activeYear = await (0, cache_1.withCache)('school-years-active', () => SchoolYear_1.SchoolYear.findOne({ active: true }).lean());
        if (activeYear)
            query.schoolYearId = String(activeYear._id);
    }
    const enrolls = await Enrollment_1.Enrollment.find(query).lean();
    const enrollByStudent = {};
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
    for (const e of enrolls) {
        const cur = enrollByStudent[e.studentId];
        if (isBetterEnrollment(e, cur))
            enrollByStudent[e.studentId] = e;
    }
    const classIds = enrolls.map(e => e.classId).filter(Boolean);
    const classes = await Class_1.ClassModel.find({ _id: { $in: classIds } }).lean();
    const classMap = {};
    for (const c of classes)
        classMap[String(c._id)] = c;
    const out = students.map(s => {
        const enr = enrollByStudent[String(s._id)];
        const cls = enr && enr.classId ? classMap[enr.classId] : null;
        return {
            ...s,
            classId: enr ? enr.classId : undefined,
            className: cls ? cls.name : undefined,
            level: cls ? cls.level : s.level
        };
    });
    res.json(out);
});
exports.studentsRouter.get('/unassigned/export/:schoolYearId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { schoolYearId } = req.params;
    const result = await fetchUnassignedStudents(schoolYearId);
    const headers = ['StudentId', 'FirstName', 'LastName', 'PreviousClass', 'TargetLevel', 'NextClass'];
    const rows = result.map(s => [
        s._id,
        s.firstName,
        s.lastName,
        s.previousClassName || '',
        s.level || '',
        ''
    ]);
    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="students_to_assign.csv"`);
    res.send(csvContent);
});
exports.studentsRouter.post('/bulk-assign-section', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { csv, schoolYearId } = req.body;
    if (!csv || !schoolYearId)
        return res.status(400).json({ error: 'missing_params' });
    try {
        const records = (0, sync_1.parse)(csv, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });
        const results = {
            success: 0,
            errors: []
        };
        const normalized = [];
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const studentId = record.StudentId;
            const nextClass = record.NextClass;
            if (!studentId || !nextClass) {
                results.errors.push({ studentId, error: 'missing_id_or_class' });
                continue;
            }
            const parts = String(nextClass).trim().split(' ');
            let level;
            let section;
            if (parts.length >= 2) {
                level = parts[0];
                section = parts.slice(1).join(' ');
            }
            else if (record.TargetLevel) {
                level = record.TargetLevel;
                section = nextClass;
            }
            if (!level || !section) {
                results.errors.push({ studentId, error: 'invalid_class_format' });
                continue;
            }
            const className = `${level} ${section}`.trim();
            normalized.push({ index: i, studentId: String(studentId), level: String(level), className });
        }
        const uniqueClassNames = Array.from(new Set(normalized.map(r => r.className)));
        const existingClasses = await Class_1.ClassModel.find({ schoolYearId, name: { $in: uniqueClassNames } }).lean();
        const classByName = new Map(existingClasses.map(c => [String(c.name), c]));
        const missingNames = uniqueClassNames.filter(n => !classByName.has(n));
        if (missingNames.length) {
            const nameToLevel = new Map();
            for (const r of normalized)
                if (!nameToLevel.has(r.className))
                    nameToLevel.set(r.className, r.level);
            const toInsert = missingNames.map(name => ({ name, level: nameToLevel.get(name) || '', schoolYearId }));
            try {
                const inserted = await Class_1.ClassModel.insertMany(toInsert, { ordered: false });
                for (const c of inserted)
                    classByName.set(String(c.name), c);
            }
            catch (e) {
                const refreshed = await Class_1.ClassModel.find({ schoolYearId, name: { $in: missingNames } }).lean();
                for (const c of refreshed)
                    classByName.set(String(c.name), c);
            }
        }
        const assignments = normalized
            .map(r => {
            const cls = classByName.get(r.className);
            if (!cls) {
                results.errors.push({ studentId: r.studentId, error: 'class_not_found_or_create_failed' });
                return null;
            }
            return { studentId: r.studentId, level: r.level, classId: String(cls._id) };
        })
            .filter(Boolean);
        const enrollmentOps = assignments.map(a => ({
            updateOne: {
                filter: { studentId: a.studentId, schoolYearId },
                update: {
                    $set: { classId: a.classId, status: 'active' },
                    $setOnInsert: { studentId: a.studentId, schoolYearId, status: 'active' },
                },
                upsert: true,
            },
        }));
        const failedOpIndexes = new Set();
        const chunkSize = 1000;
        for (let i = 0; i < enrollmentOps.length; i += chunkSize) {
            const chunk = enrollmentOps.slice(i, i + chunkSize);
            try {
                if (chunk.length)
                    await Enrollment_1.Enrollment.bulkWrite(chunk, { ordered: false });
            }
            catch (e) {
                const writeErrors = e?.writeErrors || [];
                for (const we of writeErrors) {
                    const localIndex = typeof we?.index === 'number' ? we.index : -1;
                    if (localIndex >= 0)
                        failedOpIndexes.add(i + localIndex);
                }
                if (writeErrors.length === 0)
                    throw e;
            }
        }
        const tasks = assignments
            .map((a, idx) => ({ ...a, idx }))
            .filter(a => !failedOpIndexes.has(a.idx));
        const concurrency = 10;
        let cursor = 0;
        const workers = Array.from({ length: Math.min(concurrency, tasks.length) }).map(async () => {
            while (cursor < tasks.length) {
                const current = tasks[cursor++];
                try {
                    await (0, templateUtils_1.checkAndAssignTemplates)(current.studentId, current.level, schoolYearId, current.classId, req.user.userId);
                    results.success++;
                }
                catch (e) {
                    results.errors.push({ studentId: current.studentId, error: e.message });
                }
            }
        });
        await Promise.all(workers);
        for (const idx of failedOpIndexes) {
            const a = assignments[idx];
            if (a)
                results.errors.push({ studentId: a.studentId, error: 'enrollment_write_failed' });
        }
        res.json(results);
    }
    catch (e) {
        res.status(400).json({ error: 'csv_parse_error', details: e.message });
    }
});
exports.studentsRouter.get('/unassigned/:schoolYearId', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { schoolYearId } = req.params;
    const result = await fetchUnassignedStudents(schoolYearId);
    res.json(result);
});
exports.studentsRouter.post('/:id/assign-section', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    const { schoolYearId, level, section } = req.body;
    if (!schoolYearId || !level || !section)
        return res.status(400).json({ error: 'missing_params' });
    const className = `${level} ${section}`;
    let cls = await Class_1.ClassModel.findOne({ schoolYearId, name: className }).lean();
    if (!cls) {
        cls = await Class_1.ClassModel.create({
            name: className,
            level,
            schoolYearId
        });
    }
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
    await (0, templateUtils_1.checkAndAssignTemplates)(id, level, schoolYearId, String(cls._id), req.user.userId);
    res.json({ ok: true });
});
exports.studentsRouter.get('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const { id } = req.params;
    const student = await Student_1.Student.findById(id).lean();
    if (!student)
        return res.status(404).json({ error: 'not_found' });
    const enrollments = await Enrollment_1.Enrollment.find({ studentId: id }).lean();
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
        if (clsDoc && clsDoc.level) {
            await (0, templateUtils_1.checkAndAssignTemplates)(String(student._id), clsDoc.level, clsDoc.schoolYearId, classId, req.user.userId);
        }
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
        const clsDoc = await Class_1.ClassModel.findById(classId).lean();
        if (!clsDoc)
            return res.status(404).json({ error: 'class_not_found' });
        let enr = await Enrollment_1.Enrollment.findOne({
            studentId: id,
            schoolYearId: clsDoc.schoolYearId,
            status: { $ne: 'promoted' }
        });
        if (enr) {
            if (enr.classId !== classId) {
                enr.classId = classId;
                await enr.save();
                if (clsDoc.level) {
                    await (0, templateUtils_1.checkAndAssignTemplates)(id, clsDoc.level, clsDoc.schoolYearId, classId, req.user.userId);
                }
            }
        }
        else {
            await Enrollment_1.Enrollment.create({ studentId: id, classId, schoolYearId: clsDoc.schoolYearId, status: 'active' });
            if (clsDoc.level) {
                await (0, templateUtils_1.checkAndAssignTemplates)(id, clsDoc.level, clsDoc.schoolYearId, classId, req.user.userId);
            }
        }
    }
    res.json(updated);
});
exports.studentsRouter.post('/:studentId/promote', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { studentId } = req.params;
        const { nextLevel } = req.body;
        const student = await Student_1.Student.findById(studentId);
        if (!student)
            return res.status(404).json({ error: 'student_not_found' });
        const enrollment = await Enrollment_1.Enrollment.findOne({
            studentId,
            $or: [{ status: 'active' }, { status: { $exists: false } }]
        }).lean();
        let currentLevel = student.level || '';
        let currentSchoolYearId = '';
        let currentSchoolYearSequence = 0;
        let yearName = new Date().getFullYear().toString();
        if (enrollment) {
            if (enrollment.classId) {
                const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
                if (cls) {
                    currentLevel = cls.level || '';
                    currentSchoolYearId = cls.schoolYearId;
                }
            }
            if (!currentSchoolYearId && enrollment.schoolYearId) {
                currentSchoolYearId = enrollment.schoolYearId;
            }
            if (currentSchoolYearId) {
                const sy = await SchoolYear_1.SchoolYear.findById(currentSchoolYearId).lean();
                if (sy) {
                    yearName = sy.name;
                    currentSchoolYearSequence = sy.sequence || 0;
                }
            }
        }
        if (currentSchoolYearId) {
            const alreadyPromoted = student.promotions?.some((p) => p.schoolYearId === currentSchoolYearId);
            if (alreadyPromoted) {
                return res.status(400).json({ error: 'already_promoted', message: 'Student already promoted this year' });
            }
        }
        let calculatedNextLevel = nextLevel;
        if (!calculatedNextLevel) {
            const currentLevelDoc = await (0, cache_1.withCache)(`level-name-${currentLevel}`, () => Level_1.Level.findOne({ name: currentLevel }).lean());
            if (currentLevelDoc) {
                const nextLevelDoc = await (0, cache_1.withCache)(`level-order-${currentLevelDoc.order + 1}`, () => Level_1.Level.findOne({ order: currentLevelDoc.order + 1 }).lean());
                if (nextLevelDoc) {
                    calculatedNextLevel = nextLevelDoc.name;
                }
            }
        }
        if (!calculatedNextLevel)
            return res.status(400).json({ error: 'cannot_determine_next_level' });
        let nextSchoolYearId = '';
        if (currentSchoolYearSequence > 0) {
            const nextSy = await SchoolYear_1.SchoolYear.findOne({ sequence: currentSchoolYearSequence + 1 }).lean();
            if (nextSy) {
                nextSchoolYearId = String(nextSy._id);
            }
        }
        else {
            const allYears = await SchoolYear_1.SchoolYear.find({}).sort({ startDate: 1 }).lean();
            const idx = allYears.findIndex(y => String(y._id) === currentSchoolYearId);
            if (idx >= 0 && idx < allYears.length - 1) {
                nextSchoolYearId = String(allYears[idx + 1]._id);
            }
        }
        if (!nextSchoolYearId && currentSchoolYearId) {
            const currentSy = await SchoolYear_1.SchoolYear.findById(currentSchoolYearId).lean();
            if (currentSy && currentSy.name) {
                const match = currentSy.name.match(/(\d{4})([-/.])(\d{4})/);
                if (match) {
                    const startYear = parseInt(match[1]);
                    const separator = match[2];
                    const endYear = parseInt(match[3]);
                    const nextName = `${startYear + 1}${separator}${endYear + 1}`;
                    const nextSy = await SchoolYear_1.SchoolYear.findOne({ name: nextName }).lean();
                    if (nextSy)
                        nextSchoolYearId = String(nextSy._id);
                }
            }
        }
        if (!nextSchoolYearId) {
            return res.status(400).json({ error: 'no_next_year', message: 'Next school year not found' });
        }
        const assignment = await TemplateAssignment_1.TemplateAssignment.findOne({
            studentId: student._id,
            schoolYearId: currentSchoolYearId
        });
        if (currentSchoolYearId && enrollment) {
            const statuses = await StudentCompetencyStatus_1.StudentCompetencyStatus.find({ studentId: student._id }).lean();
            let signatures = [];
            let templateId = assignment?.templateId;
            let templateData = null;
            if (assignment) {
                signatures = await TemplateSignature_1.TemplateSignature.find({
                    templateAssignmentId: assignment._id
                }).lean();
                if (assignment.templateId) {
                    const template = await GradebookTemplate_1.GradebookTemplate.findById(assignment.templateId).lean();
                    if (template) {
                        templateData = template;
                        if (assignment.templateVersion && template.versionHistory) {
                            const version = template.versionHistory.find((v) => v.version === assignment.templateVersion);
                            if (version) {
                                templateData = {
                                    ...template,
                                    pages: version.pages,
                                    variables: version.variables || {},
                                    watermark: version.watermark
                                };
                            }
                        }
                    }
                }
            }
            const snapshotData = {
                student: student.toObject ? student.toObject() : student,
                enrollment: enrollment,
                statuses: statuses,
                assignment: assignment?.toObject ? assignment.toObject() : assignment,
                signatures: signatures,
                template: templateData
            };
            await SavedGradebook_1.SavedGradebook.create({
                studentId: student._id,
                schoolYearId: currentSchoolYearId,
                level: currentLevel || 'Sans niveau',
                classId: enrollment.classId,
                templateId: templateId,
                data: snapshotData
            });
        }
        const promotion = {
            schoolYearId: currentSchoolYearId,
            fromLevel: currentLevel,
            toLevel: calculatedNextLevel,
            date: new Date(),
            promotedBy: adminId,
            decision: 'promoted'
        };
        await Student_1.Student.findByIdAndUpdate(studentId, {
            $push: { promotions: promotion },
            nextLevel: calculatedNextLevel
        });
        if (enrollment) {
            await Enrollment_1.Enrollment.findByIdAndUpdate(enrollment._id, { promotionStatus: 'promoted', status: 'promoted' });
        }
        const nextLevelDoc = await Level_1.Level.findOne({ name: calculatedNextLevel }).lean();
        const isExit = nextLevelDoc?.isExitLevel || (calculatedNextLevel.toLowerCase() === 'eb1');
        if (!isExit) {
            await Enrollment_1.Enrollment.create({
                studentId: studentId,
                schoolYearId: nextSchoolYearId,
                status: 'active',
            });
        }
        if (assignment) {
            let className = '';
            if (enrollment && enrollment.classId) {
                const cls = await Class_1.ClassModel.findById(enrollment.classId);
                if (cls)
                    className = cls.name;
            }
            const promotionData = {
                from: currentLevel,
                to: calculatedNextLevel,
                date: new Date(),
                year: yearName,
                class: className
            };
            const data = assignment.data || {};
            const promotions = Array.isArray(data.promotions) ? data.promotions : [];
            promotions.push(promotionData);
            data.promotions = promotions;
            assignment.data = data;
            assignment.markModified('data');
            await assignment.save();
        }
        await (0, auditLogger_1.logAudit)({
            userId: adminId,
            action: 'PROMOTE_STUDENT',
            details: { studentId, from: currentLevel, to: calculatedNextLevel },
            req
        });
        res.json({ success: true, promotion });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'internal_error' });
    }
});
async function fetchUnassignedStudents(schoolYearId) {
    const yearEnrollments = await Enrollment_1.Enrollment.find({ schoolYearId }).lean();
    const assignedStudentIds = new Set(yearEnrollments.filter(e => e.classId).map(e => e.studentId));
    const enrolledUnassignedIds = yearEnrollments
        .filter(e => !e.classId)
        .map(e => e.studentId);
    const taggedStudents = await Student_1.Student.find({ schoolYearId }).lean();
    const validTaggedStudents = taggedStudents.filter(s => !assignedStudentIds.has(String(s._id)));
    const taggedIds = new Set(validTaggedStudents.map(s => String(s._id)));
    const missingIds = enrolledUnassignedIds.filter(id => !taggedIds.has(id));
    let extraStudents = [];
    if (missingIds.length > 0) {
        extraStudents = await Student_1.Student.find({ _id: { $in: missingIds } }).lean();
    }
    const unassigned = [...validTaggedStudents, ...extraStudents];
    const unassignedIds = unassigned.map(s => String(s._id));
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
    return unassigned.map(s => {
        const promo = promotionMap[String(s._id)];
        const effectiveLevel = s.nextLevel || (promo ? promo.to : s.level);
        return {
            ...s,
            level: effectiveLevel,
            promotion: promo,
            previousClassName: previousClassMap[String(s._id)]
        };
    }).filter(s => {
        const lvl = s.level ? s.level.toLowerCase() : '';
        return lvl !== 'eb1';
    });
}
