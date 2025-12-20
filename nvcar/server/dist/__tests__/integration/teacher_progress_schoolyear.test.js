"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="../../test/types.d.ts" />
// @ts-ignore: allow test-time import when @types not installed
const request = require('supertest');
const utils_1 = require("../../test/utils");
const auth_1 = require("../../auth");
const app_1 = require("../../app");
const User_1 = require("../../models/User");
const Class_1 = require("../../models/Class");
const SchoolYear_1 = require("../../models/SchoolYear");
const Student_1 = require("../../models/Student");
const Enrollment_1 = require("../../models/Enrollment");
const TeacherClassAssignment_1 = require("../../models/TeacherClassAssignment");
const GradebookTemplate_1 = require("../../models/GradebookTemplate");
const TemplateAssignment_1 = require("../../models/TemplateAssignment");
const RoleScope_1 = require("../../models/RoleScope");
let app;
describe('teacher progress and school year filtering', () => {
    beforeAll(async () => {
        await (0, utils_1.connectTestDb)();
        app = (0, app_1.createApp)();
    });
    afterAll(async () => {
        await (0, utils_1.closeTestDb)();
    });
    beforeEach(async () => {
        await (0, utils_1.clearTestDb)();
    });
    it('does not count previous year completions in current year progress', async () => {
        // Create years
        const prev = await SchoolYear_1.SchoolYear.create({ name: '2023/2024', startDate: new Date('2023-09-01'), endDate: new Date('2024-07-01'), active: false });
        const active = await SchoolYear_1.SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
        // Create classes
        const clsPrev = await Class_1.ClassModel.create({ name: 'ClassPrev', level: 'MS', schoolYearId: String(prev._id) });
        const clsActive = await Class_1.ClassModel.create({ name: 'ClassActive', level: 'MS', schoolYearId: String(active._id) });
        // Teacher assigned to active class
        const t = await User_1.User.create({ email: 't', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' });
        await TeacherClassAssignment_1.TeacherClassAssignment.create({ teacherId: String(t._id), classId: String(clsActive._id), schoolYearId: String(active._id), assignedBy: String(t._id) });
        // SubAdmin and RoleScope to allow access
        const sub = await User_1.User.create({ email: 'sub', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' });
        await RoleScope_1.RoleScope.create({ userId: String(sub._id), levels: ['MS'] });
        // Student promoted from prev to active
        const student = await Student_1.Student.create({ firstName: 'S', lastName: 'L', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S1' });
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(clsPrev._id), schoolYearId: String(prev._id), status: 'active' });
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(clsActive._id), schoolYearId: String(active._id), status: 'active' });
        // Templates for prev and active years
        const tplPrev = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tplPrev', pages: [{ blocks: [{ type: 'language_toggle', props: { items: [{ code: 'fr', label: 'Français', active: false }], blockId: 'b1' } }] }], currentVersion: 1 });
        const tplActive = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tplActive', pages: [{ blocks: [{ type: 'language_toggle', props: { items: [{ code: 'fr', label: 'Français', active: false }], blockId: 'b1' } }] }], currentVersion: 1 });
        const activeDb = await SchoolYear_1.SchoolYear.findOne({ active: true });
        console.log('ACTIVE_DB', String(activeDb?._id), activeDb?.name);
        // Assignment in previous year: completed by teacher (using tplPrev)
        await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tplPrev._id), studentId: String(student._id), completionSchoolYearId: String(prev._id), assignedTeachers: [String(t._id)], assignedBy: String(t._id), status: 'completed', isCompleted: true, teacherCompletions: [{ teacherId: String(t._id), completed: true, completedAt: new Date() }] });
        // Assignment in current year: not completed (using tplActive)
        await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tplActive._id), studentId: String(student._id), completionSchoolYearId: String(active._id), assignedTeachers: [String(t._id)], assignedBy: String(t._id), status: 'draft', isCompleted: false });
        const subToken = (0, auth_1.signToken)({ userId: String(sub._id), role: 'SUBADMIN' });
        const res = await request(app).get('/subadmin-assignments/teacher-progress').set('Authorization', `Bearer ${subToken}`);
        expect(res.status).toBe(200);
        console.log('PROG RES', JSON.stringify(res.body, null, 2));
        const clsRow = res.body.find((c) => c.classId === String(clsActive._id));
        expect(clsRow).toBeTruthy();
        // There is one competency and it should NOT be filled (previous year's completion shouldn't be counted)
        expect(clsRow.progress.filled).toBe(0);
    });
});
