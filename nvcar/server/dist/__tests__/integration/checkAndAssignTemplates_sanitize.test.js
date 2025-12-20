"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="../../test/types.d.ts" />
// @ts-ignore: allow test-time import when @types not installed
const utils_1 = require("../../test/utils");
const templateUtils_1 = require("../../utils/templateUtils");
const SchoolYear_1 = require("../../models/SchoolYear");
const Class_1 = require("../../models/Class");
const Student_1 = require("../../models/Student");
const TemplateAssignment_1 = require("../../models/TemplateAssignment");
const GradebookTemplate_1 = require("../../models/GradebookTemplate");
const Enrollment_1 = require("../../models/Enrollment");
describe('checkAndAssignTemplates sanitization', () => {
    beforeAll(async () => {
        await (0, utils_1.connectTestDb)();
    });
    afterAll(async () => {
        await (0, utils_1.closeTestDb)();
    });
    beforeEach(async () => {
        await (0, utils_1.clearTestDb)();
    });
    it('copies previous data but strips year-specific progress markers', async () => {
        const active = await SchoolYear_1.SchoolYear.create({ name: '2026/2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-07-01'), active: true });
        const cls = await Class_1.ClassModel.create({ name: 'Class1', level: 'MS', schoolYearId: String(active._id) });
        const student = await Student_1.Student.create({ firstName: 'S', lastName: 'L', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S1' });
        // Template that is default for the level so checkAndAssignTemplates will try to assign it
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tpl', pages: [], currentVersion: 1, defaultForLevels: ['MS'] });
        // Create a previous assignment for the same student that contains active flags and signatures
        // Use a different template ID so checkAndAssignTemplates will CREATE a new assignment from the default template
        const prevData = {
            language_toggle_abc: [{ code: 'en', label: 'EN', active: true }],
            someTable: { rows: [{ active: true, val: 'x' }] },
            signatures: [{ signer: 'T' }],
            promotions: { promoted: true }
        };
        const otherTpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'other', pages: [], currentVersion: 1 });
        await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(otherTpl._id), studentId: String(student._id), completionSchoolYearId: String(active._id), assignedBy: 'u1', assignedAt: new Date('2025-10-01'), data: prevData });
        // Create another student (peer) and give them the template used for assignment creation
        const peer = await Student_1.Student.create({ firstName: 'Peer', lastName: 'P', dateOfBirth: new Date('2018-01-02'), logicalKey: 'P1' });
        await GradebookTemplate_1.GradebookTemplate.create({ name: 'tpl-peer', pages: [], currentVersion: 1 });
        // Give the peer the target template so it appears in templateIds
        await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(peer._id), completionSchoolYearId: String(active._id), assignedBy: 'u1', assignedAt: new Date('2025-10-01'), data: {} });
        await Enrollment_1.Enrollment.create({ studentId: String(peer._id), classId: cls._id, schoolYearId: String(active._id), status: 'active' });
        // Now call checkAndAssignTemplates which should create a new assignment for the active year for the original student
        await (0, templateUtils_1.checkAndAssignTemplates)(String(student._id), 'MS', String(active._id), String(cls._id), 'u1');
        const created = await TemplateAssignment_1.TemplateAssignment.findOne({ studentId: String(student._id), templateId: String(tpl._id) }).lean();
        const all = await TemplateAssignment_1.TemplateAssignment.find({ studentId: String(student._id) }).lean();
        expect(created).toBeTruthy();
        expect(created.completionSchoolYearId).toBe(String(active._id));
        // Data should exist but sanitized
        expect(created.data).toBeTruthy();
        // signatures and promotions removed
        expect(created.data.signatures).toBeUndefined();
        expect(created.data.promotions).toBeUndefined();
        // active flags should be reset (either false or null)
        const langItems = created.data.language_toggle_abc;
        expect(Array.isArray(langItems)).toBe(true);
        expect(langItems[0].active === false || langItems[0].active === null).toBe(true);
        // nested table row active should be reset
        expect(created.data.someTable.rows[0].active === false || created.data.someTable.rows[0].active === null).toBe(true);
    });
});
