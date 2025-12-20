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
const Student_1 = require("../../models/Student");
const Enrollment_1 = require("../../models/Enrollment");
const GradebookTemplate_1 = require("../../models/GradebookTemplate");
const SchoolYear_1 = require("../../models/SchoolYear");
let app;
describe('bulk-level assign/delete', () => {
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
    it('assigns template to all students in level then deletes them', async () => {
        const admin = await User_1.User.create({ email: 'bulk-admin', role: 'ADMIN', displayName: 'Bulk Admin', passwordHash: 'hash' });
        const token = (0, auth_1.signToken)({ userId: String(admin._id), role: 'ADMIN' });
        const sy = await SchoolYear_1.SchoolYear.create({ name: 'S1', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
        const cls1 = await Class_1.ClassModel.create({ name: 'C1', level: 'PS', schoolYearId: String(sy._id) });
        const cls2 = await Class_1.ClassModel.create({ name: 'C2', level: 'PS', schoolYearId: String(sy._id) });
        const s1 = await Student_1.Student.create({ firstName: 'Stu1', lastName: 'L1', dateOfBirth: new Date('2018-01-01'), logicalKey: 'B1' });
        const s2 = await Student_1.Student.create({ firstName: 'Stu2', lastName: 'L2', dateOfBirth: new Date('2018-01-02'), logicalKey: 'B2' });
        await Enrollment_1.Enrollment.create({ studentId: String(s1._id), classId: String(cls1._id), schoolYearId: String(sy._id), status: 'active' });
        await Enrollment_1.Enrollment.create({ studentId: String(s2._id), classId: String(cls2._id), schoolYearId: String(sy._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'bulkTpl', pages: [], currentVersion: 1 });
        const createRes = await request(app).post('/template-assignments/bulk-level').set('Authorization', `Bearer ${token}`).send({ templateId: String(tpl._id), level: 'PS' });
        expect(createRes.status).toBe(200);
        expect(createRes.body.count).toBeGreaterThanOrEqual(2);
        const delRes = await request(app).delete(`/template-assignments/bulk-level/${tpl._id}/PS`).set('Authorization', `Bearer ${token}`).send();
        expect(delRes.status).toBe(200);
        expect(delRes.body.count).toBeGreaterThanOrEqual(2);
    });
});
