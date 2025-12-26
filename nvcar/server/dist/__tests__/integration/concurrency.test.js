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
const GradebookTemplate_1 = require("../../models/GradebookTemplate");
const TemplateAssignment_1 = require("../../models/TemplateAssignment");
const TemplateChangeLog_1 = require("../../models/TemplateChangeLog");
const TemplateSignature_1 = require("../../models/TemplateSignature");
let app;
describe('concurrent edits and signature flows', () => {
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
    it('detects conflict when two teachers simultaneously update the same language toggle with same expectedDataVersion', async () => {
        const sy = await SchoolYear_1.SchoolYear.create({ name: 'S2', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
        const cls = await Class_1.ClassModel.create({ name: 'Class T', level: 'MS', schoolYearId: String(sy._id) });
        const t1 = await User_1.User.create({ email: 't1', role: 'TEACHER', displayName: 'Teacher 1', passwordHash: 'hash' });
        const t2 = await User_1.User.create({ email: 't2', role: 'TEACHER', displayName: 'Teacher 2', passwordHash: 'hash' });
        await Enrollment_1.Enrollment.create({ studentId: 'S1', classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
        const student = await Student_1.Student.create({ firstName: 'TT', lastName: 'LN', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S-TT-1' });
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tplT', pages: [{ blocks: [{ type: 'language_toggle', props: { items: [{ code: 'fr', active: true }, { code: 'en', active: false }] } }] }], currentVersion: 1 });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), assignedTeachers: [String(t1._id), String(t2._id)], status: 'draft', data: {}, assignedBy: String(t1._id) });
        // Ensure teachers are assigned to the class for permission checks
        const { TeacherClassAssignment } = require('../../models/TeacherClassAssignment');
        await TeacherClassAssignment.create({ teacherId: String(t1._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(t1._id) });
        await TeacherClassAssignment.create({ teacherId: String(t2._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(t2._id) });
        // Teacher 1 applies an update with expectedDataVersion = 1
        const t1Token = (0, auth_1.signToken)({ userId: String(t1._id), role: 'TEACHER' });
        const t2Token = (0, auth_1.signToken)({ userId: String(t2._id), role: 'TEACHER' });
        const payload1 = { pageIndex: 0, blockIndex: 0, items: [{ code: 'fr', active: false }, { code: 'en', active: true }], expectedDataVersion: 1 };
        const payload2 = { pageIndex: 0, blockIndex: 0, items: [{ code: 'fr', active: false }, { code: 'en', active: false }], expectedDataVersion: 1 };
        // Apply first update
        const res1 = await request(app).patch(`/teacher/template-assignments/${assignment._id}/language-toggle`).set('Authorization', `Bearer ${t1Token}`).send(payload1);
        expect(res1.status).toBe(200);
        // Second update tries to use the stale dataVersion and should conflict
        const res2 = await request(app).patch(`/teacher/template-assignments/${assignment._id}/language-toggle`).set('Authorization', `Bearer ${t2Token}`).send(payload2);
        expect(res2.status).toBe(409);
        // After conflict, dataVersion should be incremented (to >=2)
        const fresh = await TemplateAssignment_1.TemplateAssignment.findById(String(assignment._id)).lean();
        expect(fresh.dataVersion).toBeGreaterThanOrEqual(2);
        // Change log should contain at least one entry for the successful change with dataVersion recorded
        const changes = await TemplateChangeLog_1.TemplateChangeLog.find({ templateAssignmentId: String(assignment._id) }).lean();
        expect(changes.length).toBeGreaterThanOrEqual(1);
        expect(changes.some((c) => typeof c.dataVersion === 'number')).toBe(true);
    });
    it('signing while another edit with stale version conflicts (sign wins, edit fails)', async () => {
        const sy = await SchoolYear_1.SchoolYear.create({ name: 'S2', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
        const cls = await Class_1.ClassModel.create({ name: 'Class T2', level: 'MS', schoolYearId: String(sy._id) });
        const admin = await User_1.User.create({ email: 'a1', role: 'ADMIN', displayName: 'Admin', passwordHash: 'hash' });
        const teacher = await User_1.User.create({ email: 't3', role: 'TEACHER', displayName: 'Teacher 3', passwordHash: 'hash' });
        const student = await Student_1.Student.create({ firstName: 'SS', lastName: 'LN', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S-SS-1' });
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tplS', pages: [{ blocks: [{ type: 'language_toggle', props: { items: [{ code: 'fr', active: true }] } }] }], currentVersion: 1 });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), assignedTeachers: [String(teacher._id)], status: 'completed', isCompleted: true, data: {}, assignedBy: String(teacher._id) });
        const adminToken = (0, auth_1.signToken)({ userId: String(admin._id), role: 'ADMIN' });
        const teacherToken = (0, auth_1.signToken)({ userId: String(teacher._id), role: 'TEACHER' });
        // Ensure teacher is assigned to class for permission
        const { TeacherClassAssignment } = require('../../models/TeacherClassAssignment');
        await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(admin._id) });
        // Admin will sign (this increments dataVersion unconditionally)
        const signRes = await request(app).post(`/admin-extras/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${adminToken}`).send({ type: 'standard' });
        expect(signRes.status).toBe(200);
        // Teacher attempts to apply an edit with stale expectedDataVersion = 1 and should conflict
        const editRes = await request(app).patch(`/teacher/template-assignments/${assignment._id}/language-toggle`).set('Authorization', `Bearer ${teacherToken}`).send({ pageIndex: 0, blockIndex: 0, items: [{ code: 'fr', active: false }], expectedDataVersion: 1 });
        expect(editRes.status).toBe(409);
        // Ensure signature exists
        const sigCount = await TemplateSignature_1.TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id) });
        expect(sigCount).toBeGreaterThanOrEqual(1);
        // assignment dataVersion should be > 1
        const fresh = await TemplateAssignment_1.TemplateAssignment.findById(String(assignment._id)).lean();
        expect(fresh.dataVersion).toBeGreaterThan(1);
    });
    it('signing is atomic when assignment update fails (no partial persist)', async () => {
        const sy = await SchoolYear_1.SchoolYear.create({ name: 'S-atomic', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
        const cls = await Class_1.ClassModel.create({ name: 'Class A', level: 'MS', schoolYearId: String(sy._id) });
        const admin = await User_1.User.create({ email: 'a-atomic', role: 'ADMIN', displayName: 'Admin', passwordHash: 'hash' });
        const teacher = await User_1.User.create({ email: 't-atomic', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' });
        const student = await Student_1.Student.create({ firstName: 'AS', lastName: 'LN', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S-AS-1' });
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tpl-atomic', pages: [{ blocks: [{ type: 'language_toggle', props: { items: [{ code: 'fr', active: true }] } }] }], currentVersion: 1 });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), assignedTeachers: [String(teacher._id)], status: 'completed', isCompleted: true, isCompletedSem1: true, data: {}, assignedBy: String(teacher._id) });
        const adminToken = (0, auth_1.signToken)({ userId: String(admin._id), role: 'ADMIN' });
        // Simulate failure during assignment update
        const orig1 = TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate;
        TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate = async () => { throw new Error('boom'); };
        const res = await request(app).post(`/admin-extras/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${adminToken}`).send({ type: 'standard' });
        expect(res.status).toBeGreaterThanOrEqual(500);
        // No TemplateSignature should be persisted
        const sigCount = await TemplateSignature_1.TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id) });
        expect(sigCount).toBe(0);
        const fresh = await TemplateAssignment_1.TemplateAssignment.findById(String(assignment._id)).lean();
        expect(fresh.data && fresh.data.signatures ? fresh.data.signatures.length : 0).toBe(0);
        expect(fresh.dataVersion).toBe(1);
        TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate = orig1;
    });
    it('unsigning is atomic when assignment update fails (signatures preserved)', async () => {
        const sy = await SchoolYear_1.SchoolYear.create({ name: 'S-atomic-2', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
        const cls = await Class_1.ClassModel.create({ name: 'Class B', level: 'MS', schoolYearId: String(sy._id) });
        const admin = await User_1.User.create({ email: 'a-atomic-2', role: 'ADMIN', displayName: 'Admin', passwordHash: 'hash' });
        const teacher = await User_1.User.create({ email: 't-atomic-2', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' });
        const student = await Student_1.Student.create({ firstName: 'BS', lastName: 'LN', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S-BS-1' });
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tpl-atomic-2', pages: [{ blocks: [{ type: 'language_toggle', props: { items: [{ code: 'fr', active: true }] } }] }], currentVersion: 1 });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), assignedTeachers: [String(teacher._id)], status: 'completed', isCompleted: true, isCompletedSem1: true, data: {}, assignedBy: String(teacher._id) });
        const adminToken = (0, auth_1.signToken)({ userId: String(admin._id), role: 'ADMIN' });
        // Sign successfully first
        const good = await request(app).post(`/admin-extras/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${adminToken}`).send({ type: 'standard' });
        expect(good.status).toBe(200);
        const preCount = await TemplateSignature_1.TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id) });
        expect(preCount).toBeGreaterThanOrEqual(1);
        // Simulate failure during assignment update when unsigning
        const orig2 = TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate;
        TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate = async () => { throw new Error('boom'); };
        const bad = await request(app).delete(`/admin-extras/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${adminToken}`).send({ type: 'standard' });
        expect(bad.status).toBeGreaterThanOrEqual(500);
        const postCount = await TemplateSignature_1.TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id) });
        expect(postCount).toBeGreaterThanOrEqual(1);
        const fresh2 = await TemplateAssignment_1.TemplateAssignment.findById(String(assignment._id)).lean();
        expect(fresh2.data && fresh2.data.signatures ? fresh2.data.signatures.length : 0).toBeGreaterThanOrEqual(1);
        TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate = orig2;
    });
});
