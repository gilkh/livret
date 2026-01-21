"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.schoolYearsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth");
const SchoolYear_1 = require("../models/SchoolYear");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const Enrollment_1 = require("../models/Enrollment");
const Class_1 = require("../models/Class");
const TemplateSignature_1 = require("../models/TemplateSignature");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const Student_1 = require("../models/Student");
const StudentCompetencyStatus_1 = require("../models/StudentCompetencyStatus");
const cache_1 = require("../utils/cache");
exports.schoolYearsRouter = (0, express_1.Router)();
exports.schoolYearsRouter.get('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
    const list = await (0, cache_1.withCache)('school-years-all', () => SchoolYear_1.SchoolYear.find({}).sort({ startDate: -1 }).lean());
    res.json(list);
});
exports.schoolYearsRouter.post('/cleanup-test-year', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    (0, cache_1.clearCache)('school-years');
    const active = await SchoolYear_1.SchoolYear.findOne({ active: true }).lean();
    const activeName = String(active?.name || '');
    if (active && /test/i.test(activeName)) {
        await SchoolYear_1.SchoolYear.updateMany({ _id: active._id }, { $set: { active: false } });
    }
    // Pick the most recent non-test year and activate it
    const candidate = await SchoolYear_1.SchoolYear.findOne({ name: { $not: /test/i } }).sort({ startDate: -1 }).lean();
    if (candidate) {
        await SchoolYear_1.SchoolYear.updateMany({ _id: { $ne: candidate._id } }, { $set: { active: false } });
        await SchoolYear_1.SchoolYear.updateMany({ _id: candidate._id }, { $set: { active: true } });
    }
    const years = await SchoolYear_1.SchoolYear.find({}).sort({ startDate: -1 }).lean();
    res.json({ ok: true, before: activeName || null, activated: candidate ? String(candidate.name || '') : null, years });
});
exports.schoolYearsRouter.post('/', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { name, startDate, endDate, active } = req.body;
    if (!name || !startDate || !endDate)
        return res.status(400).json({ error: 'missing_payload' });
    if (active) {
        await SchoolYear_1.SchoolYear.updateMany({}, { $set: { active: false } });
    }
    (0, cache_1.clearCache)('school-years');
    const created = await SchoolYear_1.SchoolYear.create({
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        active: active ?? true,
    });
    const allYears = await SchoolYear_1.SchoolYear.find({}).sort({ startDate: 1 }).lean();
    if (allYears.length > 0) {
        await SchoolYear_1.SchoolYear.bulkWrite(allYears.map((y, index) => ({
            updateOne: {
                filter: { _id: y._id },
                update: { $set: { sequence: index + 1 } },
            },
        })));
    }
    const year = await SchoolYear_1.SchoolYear.findById(created._id).lean();
    res.json(year || created);
});
exports.schoolYearsRouter.patch('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    const data = { ...req.body };
    if (data.startDate)
        data.startDate = new Date(data.startDate);
    if (data.endDate)
        data.endDate = new Date(data.endDate);
    if (data.active) {
        await SchoolYear_1.SchoolYear.updateMany({ _id: { $ne: id } }, { $set: { active: false } });
    }
    (0, cache_1.clearCache)('school-years');
    const year = await SchoolYear_1.SchoolYear.findByIdAndUpdate(id, data, { new: true });
    res.json(year);
});
exports.schoolYearsRouter.delete('/:id', (0, auth_1.requireAuth)(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { id } = req.params;
    (0, cache_1.clearCache)('school-years');
    await SchoolYear_1.SchoolYear.findByIdAndDelete(id);
    res.json({ ok: true });
});
exports.schoolYearsRouter.post('/:id/archive', (0, auth_1.requireAuth)(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    const year = await SchoolYear_1.SchoolYear.findById(id);
    if (!year)
        return res.status(404).json({ error: 'not_found' });
    // 1. Deactivate year
    year.active = false;
    await year.save();
    // 2. Find all enrollments for this year
    const enrollments = await Enrollment_1.Enrollment.find({ schoolYearId: id }).lean();
    const studentIds = enrollments.map(e => e.studentId);
    const assignmentsForYear = await TemplateAssignment_1.TemplateAssignment.find({
        studentId: { $in: studentIds },
        completionSchoolYearId: id,
    }).lean();
    let assignments = assignmentsForYear;
    if (assignments.length === 0) {
        assignments = await TemplateAssignment_1.TemplateAssignment.find({
            studentId: { $in: studentIds },
            $or: [
                { completionSchoolYearId: id },
                { completionSchoolYearId: { $exists: false } },
                { completionSchoolYearId: null },
                { completionSchoolYearId: '' },
            ]
        }).lean();
    }
    // 4. Create SavedGradebooks
    let savedCount = 0;
    const allYears = await SchoolYear_1.SchoolYear.find({}).select('_id name').lean();
    const yearNameMap = new Map(allYears.map((y) => [String(y._id), String(y.name || '')]));
    // Pre-fetch students
    const students = await Student_1.Student.find({ _id: { $in: studentIds } }).lean();
    const studentMap = new Map(students.map(s => [String(s._id), s]));
    const templateCache = new Map();
    const getTemplateSnapshot = async (templateId, templateVersion) => {
        if (!templateId)
            return null;
        if (!templateCache.has(templateId)) {
            const tpl = await GradebookTemplate_1.GradebookTemplate.findById(templateId).lean();
            templateCache.set(templateId, tpl || null);
        }
        const tpl = templateCache.get(templateId);
        if (!tpl)
            return null;
        const version = templateVersion ?? tpl.currentVersion;
        let pages = tpl.pages;
        let variables = tpl.variables || {};
        let watermark = tpl.watermark;
        if (version && Array.isArray(tpl.versionHistory)) {
            const v = tpl.versionHistory.find((vh) => vh.version === version);
            if (v) {
                pages = v.pages || pages;
                variables = v.variables || variables;
                watermark = v.watermark;
            }
        }
        return {
            _id: tpl._id,
            name: tpl.name,
            pages,
            variables,
            watermark,
            currentVersion: tpl.currentVersion,
            version
        };
    };
    for (const assignment of assignments) {
        const enrollment = enrollments.find(e => e.studentId === assignment.studentId);
        if (!enrollment || !enrollment.classId)
            continue;
        const cls = await Class_1.ClassModel.findById(enrollment.classId).lean();
        if (!cls)
            continue;
        const student = studentMap.get(assignment.studentId);
        if (!student)
            continue;
        const statuses = await StudentCompetencyStatus_1.StudentCompetencyStatus.find({ studentId: assignment.studentId }).lean();
        const signatures = await TemplateSignature_1.TemplateSignature.find({ templateAssignmentId: String(assignment._id) }).lean();
        signatures.forEach((s) => {
            if (!s.schoolYearName && s.schoolYearId) {
                const name = yearNameMap.get(String(s.schoolYearId));
                if (name)
                    s.schoolYearName = name;
            }
        });
        // Import createAssignmentSnapshot for versioning
        const { createAssignmentSnapshot } = await Promise.resolve().then(() => __importStar(require('../services/rolloverService')));
        const templateSnapshot = await getTemplateSnapshot(assignment.templateId, assignment.templateVersion);
        const snapshotData = {
            student: student,
            enrollment: enrollment,
            statuses: statuses,
            assignment: assignment,
            className: cls.name,
            signatures: signatures,
            signature: signatures.find((s) => s.type === 'standard') || null,
            finalSignature: signatures.find((s) => s.type === 'end_of_year') || null,
            template: templateSnapshot
        };
        await createAssignmentSnapshot(assignment, 'year_end', {
            schoolYearId: id,
            level: cls.level || 'Sans niveau',
            classId: enrollment.classId,
            data: snapshotData
        });
        savedCount++;
    }
    // 5. Archive enrollments
    await Enrollment_1.Enrollment.updateMany({ schoolYearId: id }, { $set: { status: 'archived' } });
    res.json({ ok: true, savedCount });
});
