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
let app;
describe('teacher completion behavior', () => {
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
    it('teacher marks done individually and overall completion toggles when all teachers done', async () => {
        const sy = await SchoolYear_1.SchoolYear.create({ name: 'S2', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
        const cls = await Class_1.ClassModel.create({ name: 'Class T', level: 'MS', schoolYearId: String(sy._id) });
        const t1 = await User_1.User.create({ email: 't1', role: 'TEACHER', displayName: 'Teacher 1', passwordHash: 'hash' });
        const t2 = await User_1.User.create({ email: 't2', role: 'TEACHER', displayName: 'Teacher 2', passwordHash: 'hash' });
        await TeacherClassAssignment_1.TeacherClassAssignment.create({ teacherId: String(t1._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(t1._id) });
        await TeacherClassAssignment_1.TeacherClassAssignment.create({ teacherId: String(t2._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(t2._id) });
        const student = await Student_1.Student.create({ firstName: 'TT', lastName: 'LN', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S-TT-1' });
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tplT', pages: [], currentVersion: 1 });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), assignedTeachers: [String(t1._id), String(t2._id)], status: 'draft', isCompleted: false, assignedBy: String(t1._id) });
        // Teacher 1 marks completed
        const t1Token = (0, auth_1.signToken)({ userId: String(t1._id), role: 'TEACHER' });
        const res1 = await request(app).patch(`/template-assignments/${assignment._id}/status`).set('Authorization', `Bearer ${t1Token}`).send({ status: 'completed' });
        expect(res1.status).toBe(200);
        expect(res1.body.isCompleted).toBe(false);
        expect(res1.body.status).toBe('in_progress');
        // Teacher 2 marks completed
        const t2Token = (0, auth_1.signToken)({ userId: String(t2._id), role: 'TEACHER' });
        const res2 = await request(app).patch(`/template-assignments/${assignment._id}/status`).set('Authorization', `Bearer ${t2Token}`).send({ status: 'completed' });
        expect(res2.status).toBe(200);
        expect(res2.body.isCompleted).toBe(true);
        expect(res2.body.status).toBe('completed');
    });
});
