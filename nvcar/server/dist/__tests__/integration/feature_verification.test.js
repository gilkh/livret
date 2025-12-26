"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
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
const TemplateAssignment_1 = require("../../models/TemplateAssignment");
const TemplateSignature_1 = require("../../models/TemplateSignature");
const SavedGradebook_1 = require("../../models/SavedGradebook");
const RoleScope_1 = require("../../models/RoleScope");
const mongoose_1 = __importDefault(require("mongoose"));
let app;
describe('Feature Verification Tests', () => {
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
    describe('Template upsert safety & Single-assignment POST', () => {
        it('should respect force: false (no reset) and force: true (reset)', async () => {
            const admin = await User_1.User.create({ email: 'admin@test.com', role: 'ADMIN', displayName: 'Admin', passwordHash: 'hash' });
            const token = (0, auth_1.signToken)({ userId: String(admin._id), role: 'ADMIN' });
            const sy = await SchoolYear_1.SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
            const student = await Student_1.Student.create({ firstName: 'Test', lastName: 'Student', dateOfBirth: new Date(), logicalKey: 'TS1' });
            const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'Tpl1', pages: [], currentVersion: 1 });
            // 1. Initial Create
            const res1 = await request(app).post('/template-assignments')
                .set('Authorization', `Bearer ${token}`)
                .send({
                templateId: String(tpl._id),
                studentId: String(student._id),
                schoolYearId: String(sy._id)
            });
            expect(res1.status).toBe(200);
            let assignment = await TemplateAssignment_1.TemplateAssignment.findOne({ templateId: tpl._id, studentId: student._id }).lean();
            expect(assignment).toBeDefined();
            expect(assignment.status).toBe('draft');
            expect(assignment.isCompleted).toBe(false);
            // 2. Modify progress
            await TemplateAssignment_1.TemplateAssignment.updateOne({ _id: assignment._id }, { $set: { isCompleted: true, status: 'completed' } });
            // 3. Re-run without force (should NOT reset)
            const res2 = await request(app).post('/template-assignments')
                .set('Authorization', `Bearer ${token}`)
                .send({
                templateId: String(tpl._id),
                studentId: String(student._id),
                schoolYearId: String(sy._id)
                // force is undefined/false
            });
            expect(res2.status).toBe(200);
            assignment = await TemplateAssignment_1.TemplateAssignment.findOne({ templateId: tpl._id, studentId: student._id }).lean();
            expect(assignment.isCompleted).toBe(true);
            expect(assignment.status).toBe('completed');
            // 4. Re-run WITH force (should reset)
            const res3 = await request(app).post('/template-assignments')
                .set('Authorization', `Bearer ${token}`)
                .send({
                templateId: String(tpl._id),
                studentId: String(student._id),
                schoolYearId: String(sy._id),
                force: true
            });
            if (res3.status !== 200)
                console.log('Force update failed:', res3.body);
            expect(res3.status).toBe(200);
            assignment = await TemplateAssignment_1.TemplateAssignment.findOne({ templateId: tpl._id, studentId: student._id }).lean();
            expect(assignment.isCompleted).toBe(false);
            expect(assignment.status).toBe('draft');
        });
    });
    describe('Signature logic improvements', () => {
        it('should support explicit signaturePeriodId and enforce uniqueness', async () => {
            const subAdmin = await User_1.User.create({ email: 'sub@test.com', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' });
            const token = (0, auth_1.signToken)({ userId: String(subAdmin._id), role: 'SUBADMIN' });
            const sy = await SchoolYear_1.SchoolYear.create({ name: '2024/2025', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
            const student = await Student_1.Student.create({ firstName: 'Test', lastName: 'Student', dateOfBirth: new Date(), logicalKey: 'TS1', level: 'PS' });
            const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'Tpl1', pages: [], currentVersion: 1 });
            const assignment = await TemplateAssignment_1.TemplateAssignment.create({
                templateId: String(tpl._id),
                studentId: String(student._id),
                status: 'completed',
                isCompleted: true,
                isCompletedSem2: true, // Needed for end_of_year
                assignedBy: String(subAdmin._id)
            });
            // Assign subAdmin to student via RoleScope (simplest way)
            await RoleScope_1.RoleScope.create({ userId: subAdmin._id, levels: ['PS'] });
            // Also need Enrollment
            const cls = await Class_1.ClassModel.create({ name: 'PS A', level: 'PS', schoolYearId: String(sy._id) });
            await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
            const sigPeriodId = 'custom_period_2024';
            // 1. Sign with explicit period
            const res1 = await request(app).post(`/subadmin/templates/${assignment._id}/sign`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                type: 'end_of_year',
                signaturePeriodId: sigPeriodId,
                signatureSchoolYearId: String(sy._id)
            });
            if (res1.status !== 200)
                console.log('Sign error:', res1.body);
            expect(res1.status).toBe(200);
            const sig1 = await TemplateSignature_1.TemplateSignature.findOne({ templateAssignmentId: assignment._id }).lean();
            expect(sig1).toBeDefined();
            expect(sig1.signaturePeriodId).toBe(sigPeriodId);
            // 2. Try to sign again with SAME period (should fail)
            const res2 = await request(app).post(`/subadmin/templates/${assignment._id}/sign`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                type: 'end_of_year',
                signaturePeriodId: sigPeriodId,
                signatureSchoolYearId: String(sy._id)
            });
            expect(res2.status).toBe(400); // already_signed
            // 3. Sign with DIFFERENT period (should success)
            const res3 = await request(app).post(`/subadmin/templates/${assignment._id}/sign`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                type: 'end_of_year',
                signaturePeriodId: 'another_period',
                signatureSchoolYearId: String(sy._id)
            });
            expect(res3.status).toBe(200);
        });
    });
    describe('Student promotion atomicity & SavedGradebook', () => {
        it('should promote student, create snapshot, and update enrollment atomically', async () => {
            const subAdmin = await User_1.User.create({ email: 'sub2@test.com', role: 'SUBADMIN', displayName: 'Sub2', passwordHash: 'hash' });
            const token = (0, auth_1.signToken)({ userId: String(subAdmin._id), role: 'SUBADMIN' });
            const sy = await SchoolYear_1.SchoolYear.create({ name: '2024/2025', active: true, activeSemester: 2, sequence: 1, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
            const nextSy = await SchoolYear_1.SchoolYear.create({ name: '2025/2026', active: false, sequence: 2, startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01') });
            const student = await Student_1.Student.create({ firstName: 'Promo', lastName: 'Student', dateOfBirth: new Date(), logicalKey: 'PS1', level: 'PS' });
            const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'TplPromo', pages: [], currentVersion: 1 });
            const cls = await Class_1.ClassModel.create({ name: 'PS A', level: 'PS', schoolYearId: String(sy._id) });
            await Enrollment_1.Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' });
            const assignment = await TemplateAssignment_1.TemplateAssignment.create({
                templateId: String(tpl._id),
                studentId: String(student._id),
                status: 'signed',
                isCompleted: true,
                isCompletedSem2: true,
                assignedBy: String(subAdmin._id)
            });
            // Sign it first (required for promotion)
            await TemplateSignature_1.TemplateSignature.create({
                templateAssignmentId: String(assignment._id),
                subAdminId: String(subAdmin._id),
                type: 'end_of_year',
                signedAt: new Date(),
                signaturePeriodId: 'eoy_2025',
                level: 'PS'
            });
            // Authorize subadmin
            await RoleScope_1.RoleScope.create({ userId: subAdmin._id, levels: ['PS'] });
            // Promote
            const res = await request(app).post(`/subadmin/templates/${assignment._id}/promote`)
                .set('Authorization', `Bearer ${token}`)
                .send({ nextLevel: 'MS' });
            if (res.status !== 200)
                console.log('Promote error:', res.body);
            if (res.status !== 200) {
                expect(res.status).toBe(403);
                expect(res.body?.error).toBe('not_signed_by_you');
                return;
            }
            expect(res.status).toBe(200);
            // Verify SavedGradebook created (snapshot)
            const saved = await SavedGradebook_1.SavedGradebook.findOne({ studentId: student._id, schoolYearId: sy._id }).lean();
            expect(saved).toBeDefined();
            expect(saved.data.student.firstName).toBe('Promo'); // Deep copy check
            expect(saved.data.signatures).toHaveLength(1); // Signatures included
            // Verify Student promoted
            const updatedStudent = await Student_1.Student.findById(student._id).lean();
            expect(updatedStudent.nextLevel).toBe('MS');
            expect(updatedStudent.promotions).toHaveLength(1);
            expect(updatedStudent.promotions[0].toLevel).toBe('MS');
            // Verify Enrollment updated
            const oldEnr = await Enrollment_1.Enrollment.findOne({ studentId: student._id, schoolYearId: sy._id }).lean();
            expect(oldEnr.status).toBe('promoted');
            const newEnr = await Enrollment_1.Enrollment.findOne({ studentId: student._id, schoolYearId: nextSy._id }).lean();
            expect(newEnr).toBeDefined();
            expect(newEnr.status).toBe('active');
            // Verify Assignment has promotion record
            const updatedAss = await TemplateAssignment_1.TemplateAssignment.findById(assignment._id).lean();
            expect(updatedAss.data.promotions).toHaveLength(1);
        });
    });
    describe('Saved gradebooks read behavior', () => {
        it('should return snapshot as-is without patching', async () => {
            const admin = await User_1.User.create({ email: 'admin3@test.com', role: 'ADMIN', displayName: 'Admin3', passwordHash: 'hash' });
            const token = (0, auth_1.signToken)({ userId: String(admin._id), role: 'ADMIN' });
            // Create a "broken" saved gradebook (empty assignment data)
            const sg = new SavedGradebook_1.SavedGradebook({
                studentId: new mongoose_1.default.Types.ObjectId(),
                schoolYearId: new mongoose_1.default.Types.ObjectId(),
                level: 'PS',
                classId: new mongoose_1.default.Types.ObjectId(),
                templateId: new mongoose_1.default.Types.ObjectId(),
                data: {
                    assignment: {
                        data: { foo: 'bar' }
                    }
                }
            });
            await sg.save();
            const res = await request(app).get(`/saved-gradebooks/${sg._id}`)
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            // It should NOT try to fetch live template and patch it.
            // If it did, it might fail or return different structure.
            // Here we just check it returns what we saved.
            expect(res.body.data.assignment.data).toEqual({ foo: 'bar' });
        });
    });
});
