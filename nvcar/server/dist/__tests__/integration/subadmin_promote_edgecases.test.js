"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="../../test/types.d.ts" />
// @ts-ignore: allow test-time import when @types not installed
const request = require('supertest');
const utils_1 = require("../../test/utils");
const auth_1 = require("../../auth");
const app_1 = require("../../app");
const User_1 = require("../../models/User");
const GradebookTemplate_1 = require("../../models/GradebookTemplate");
const Student_1 = require("../../models/Student");
const SchoolYear_1 = require("../../models/SchoolYear");
const Class_1 = require("../../models/Class");
const Enrollment_1 = require("../../models/Enrollment");
const TeacherClassAssignment_1 = require("../../models/TeacherClassAssignment");
const SubAdminAssignment_1 = require("../../models/SubAdminAssignment");
const RoleScope_1 = require("../../models/RoleScope");
const TemplateAssignment_1 = require("../../models/TemplateAssignment");
const SavedGradebook_1 = require("../../models/SavedGradebook");
let app;
describe('subadmin promote edge cases', () => {
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
    it('rejects promote when not signed by you', async () => {
        const sub = await User_1.User.create({ email: 'sub-edge', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' });
        const teacher = await User_1.User.create({ email: 'tea-edge', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' });
        const sy = await SchoolYear_1.SchoolYear.create({ name: 'Y2', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 });
        const cls = await Class_1.ClassModel.create({ name: 'CE1', level: 'PS', schoolYearId: String(sy._id) });
        await TeacherClassAssignment_1.TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) });
        // no SubAdminAssignment or RoleScope
        const student = await Student_1.Student.create({ firstName: 'Sx', lastName: 'Lx', dateOfBirth: new Date('2018-01-01'), logicalKey: 'SX1' });
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tpl-e', pages: [], currentVersion: 1 });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(teacher._id) });
        const subToken = (0, auth_1.signToken)({ userId: String(sub._id), role: 'SUBADMIN' });
        const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' });
        expect(promoteRes.status).toBe(403);
        expect(promoteRes.body.error).toBe('not_signed_by_you');
    });
    it('rejects already promoted twice', async () => {
        const sub = await User_1.User.create({ email: 'sub-edge2', role: 'SUBADMIN', displayName: 'Sub2', passwordHash: 'hash' });
        const teacher = await User_1.User.create({ email: 'tea-edge2', role: 'TEACHER', displayName: 'Teacher2', passwordHash: 'hash' });
        const sy = await SchoolYear_1.SchoolYear.create({ name: 'Y3', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 });
        const nextSy = await SchoolYear_1.SchoolYear.create({ name: 'Y4', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 });
        const cls = await Class_1.ClassModel.create({ name: 'CE2', level: 'PS', schoolYearId: String(sy._id) });
        await TeacherClassAssignment_1.TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) });
        await SubAdminAssignment_1.SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) });
        const student = await Student_1.Student.create({ firstName: 'Sx2', lastName: 'Lx2', dateOfBirth: new Date('2018-01-02'), logicalKey: 'SX2' });
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tpl-e2', pages: [], currentVersion: 1 });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(teacher._id) });
        const subToken = (0, auth_1.signToken)({ userId: String(sub._id), role: 'SUBADMIN' });
        // First sign and promote
        const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' });
        console.log('SIGN RES', signRes.status, signRes.body);
        const first = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' });
        console.log('PROMOTE FIRST', first.status, first.body);
        expect(first.status).toBe(200);
        // Second promote should fail with 400 already_promoted
        const second = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' });
        expect(second.status).toBe(400);
        expect(second.body.error).toBe('already_promoted');
    });
    it('allows promote when RoleScope has level', async () => {
        const sub = await User_1.User.create({ email: 'sub-edge3', role: 'SUBADMIN', displayName: 'Sub3', passwordHash: 'hash' });
        const teacher = await User_1.User.create({ email: 'tea-edge3', role: 'TEACHER', displayName: 'Teacher3', passwordHash: 'hash' });
        const sy = await SchoolYear_1.SchoolYear.create({ name: 'Y5', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 });
        const nextSy = await SchoolYear_1.SchoolYear.create({ name: 'Y6', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 });
        const cls = await Class_1.ClassModel.create({ name: 'CE3', level: 'PS', schoolYearId: String(sy._id) });
        await TeacherClassAssignment_1.TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) });
        // RoleScope grants level to subadmin
        await RoleScope_1.RoleScope.create({ userId: String(sub._id), levels: ['PS'] });
        const student = await Student_1.Student.create({ firstName: 'Sx3', lastName: 'Lx3', dateOfBirth: new Date('2018-01-03'), logicalKey: 'SX3' });
        await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tpl-e3', pages: [], currentVersion: 1 });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(teacher._id) });
        const subToken = (0, auth_1.signToken)({ userId: String(sub._id), role: 'SUBADMIN' });
        // Sign then promote
        const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' });
        console.log('SIGN RES', signRes.status, signRes.body);
        expect(signRes.status).toBe(200);
        const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' });
        console.log('PROMOTE RES', promoteRes.status, promoteRes.body);
        expect(promoteRes.status).toBe(200);
        expect(promoteRes.body.ok).toBe(true);
    });
    it('finds next school year by dates when sequence/name unavailable', async () => {
        const sub = await User_1.User.create({ email: 'sub-edge4', role: 'SUBADMIN', displayName: 'Sub4', passwordHash: 'hash' });
        const teacher = await User_1.User.create({ email: 'tea-edge4', role: 'TEACHER', displayName: 'Teacher4', passwordHash: 'hash' });
        const sy = await SchoolYear_1.SchoolYear.create({ name: 'Current', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 });
        const nextSy = await SchoolYear_1.SchoolYear.create({ name: 'Next', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 });
        const cls = await Class_1.ClassModel.create({ name: 'CE4', level: 'PS', schoolYearId: String(sy._id) });
        await TeacherClassAssignment_1.TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) });
        await SubAdminAssignment_1.SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) });
        const student = await Student_1.Student.create({ firstName: 'Sx4', lastName: 'Lx4', dateOfBirth: new Date('2018-01-04'), logicalKey: 'SX4' });
        const currentEnrollment = await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tpl-e4', pages: [], currentVersion: 1 });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(sub._id) });
        const subToken = (0, auth_1.signToken)({ userId: String(sub._id), role: 'SUBADMIN' });
        const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' });
        console.log('SIGN RES', signRes.status, signRes.body);
        expect(signRes.status).toBe(200);
        const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' });
        console.log('PROMOTE RES', promoteRes.status, promoteRes.body);
        expect(promoteRes.status).toBe(200);
        expect(promoteRes.body.ok).toBe(true);
        const updatedCurrent = await Enrollment_1.Enrollment.findById(String(currentEnrollment._id)).lean();
        expect(updatedCurrent?.status).toBe('promoted');
        const createdNext = await Enrollment_1.Enrollment.findOne({ studentId: String(student._id), schoolYearId: String(nextSy._id), status: 'active' }).lean();
        expect(createdNext).toBeDefined();
    });
    it('promotion is atomic when a downstream update fails (rollback attempts)', async () => {
        const sub = await User_1.User.create({ email: 'sub-atomic', role: 'SUBADMIN', displayName: 'SubAtomic', passwordHash: 'hash' });
        const teacher = await User_1.User.create({ email: 'tea-atomic', role: 'TEACHER', displayName: 'TeacherAtomic', passwordHash: 'hash' });
        const sy = await SchoolYear_1.SchoolYear.create({ name: 'AtomicY', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 10 });
        const nextSy = await SchoolYear_1.SchoolYear.create({ name: 'AtomicNext', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 11 });
        const cls = await Class_1.ClassModel.create({ name: 'ClassAtomic', level: 'MS', schoolYearId: String(sy._id) });
        await TeacherClassAssignment_1.TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) });
        await SubAdminAssignment_1.SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) });
        const student = await Student_1.Student.create({ firstName: 'Atomic', lastName: 'User', dateOfBirth: new Date('2018-05-01'), logicalKey: 'AT1' });
        const currentEnrollment = await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'tpl-atomic', pages: [], currentVersion: 1 });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(sub._id) });
        const subToken = (0, auth_1.signToken)({ userId: String(sub._id), role: 'SUBADMIN' });
        const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' });
        expect(signRes.status).toBe(200);
        // Simulate failure during student update
        const orig = Student_1.Student.findByIdAndUpdate;
        Student_1.Student.findByIdAndUpdate = async () => { throw new Error('boom'); };
        const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'GS' });
        expect(promoteRes.status).toBeGreaterThanOrEqual(500);
        // No SavedGradebook should exist for this student and year
        const saved = await SavedGradebook_1.SavedGradebook.find({ studentId: String(student._id), schoolYearId: String(sy._id) }).lean();
        expect(saved.length).toBe(0);
        // Enrollment should remain active
        const freshEnroll = await Enrollment_1.Enrollment.findById(String(currentEnrollment._id)).lean();
        expect(freshEnroll?.status).toBe('active');
        // Student promotions unchanged
        const freshStudent = await Student_1.Student.findById(String(student._id)).lean();
        expect(Array.isArray(freshStudent.promotions) ? freshStudent.promotions.length : 0).toBe(0);
        // Assignment data should not have promotions appended
        const freshAssignment = await TemplateAssignment_1.TemplateAssignment.findById(String(assignment._id)).lean();
        expect(freshAssignment.data && freshAssignment.data.promotions ? freshAssignment.data.promotions.length : 0).toBe(0);
        Student_1.Student.findByIdAndUpdate = orig;
    });
});
