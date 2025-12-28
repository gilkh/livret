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
describe('detailed teacher progress empty languages behavior', () => {
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
    it('shows Polyvalent/Arabe/Anglais as N/A false when teacher assigned empty languages but marks them done', async () => {
        const active = await SchoolYear_1.SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
        const cls = await Class_1.ClassModel.create({ name: 'Class1', level: 'MS', schoolYearId: String(active._id) });
        const t = await User_1.User.create({ email: 't', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' });
        await TeacherClassAssignment_1.TeacherClassAssignment.create({ teacherId: String(t._id), classId: String(cls._id), schoolYearId: String(active._id), languages: [], isProfPolyvalent: false, assignedBy: String(t._id) });
        const sub = await User_1.User.create({ email: 'sub', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' });
        await RoleScope_1.RoleScope.create({ userId: String(sub._id), levels: ['MS'] });
        const student = await Student_1.Student.create({ firstName: 'S', lastName: 'L', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S1' });
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(active._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tpl', pages: [{ blocks: [{ type: 'language_toggle', props: { items: [{ code: 'fr', label: 'Français', active: false }, { code: 'ar', label: 'Arabe', active: false }, { code: 'en', label: 'Anglais', active: false }], blockId: 'b1' } }] }], currentVersion: 1 });
        await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), completionSchoolYearId: String(active._id), assignedTeachers: [String(t._id)], assignedBy: String(t._id), status: 'completed', isCompleted: true, teacherCompletions: [{ teacherId: String(t._id), completed: true, completedAt: new Date() }] });
        const subToken = (0, auth_1.signToken)({ userId: String(sub._id), role: 'SUBADMIN' });
        const res = await request(app).get('/subadmin-assignments/teacher-progress-detailed').set('Authorization', `Bearer ${subToken}`);
        expect(res.status).toBe(200);
        const clsRow = res.body.find((c) => c.classId === String(cls._id));
        expect(clsRow).toBeTruthy();
        const st = clsRow.students.find((s) => s.studentId === String(student._id));
        expect(st).toBeTruthy();
        // hasPolyvalent/hasArabic/hasEnglish should be true (not N/A)
        expect(st.hasPolyvalent).toBe(true);
        expect(st.hasArabic).toBe(true);
        expect(st.hasEnglish).toBe(true);
        // Since teacher completed, the flags should be true
        expect(st.polyvalent).toBe(true);
        expect(st.arabic).toBe(true);
        expect(st.english).toBe(true);
    });
});
