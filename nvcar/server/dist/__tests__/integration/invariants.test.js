"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="../../test/types.d.ts" />
const utils_1 = require("../../test/utils");
const TemplateAssignment_1 = require("../../models/TemplateAssignment");
const SavedGradebook_1 = require("../../models/SavedGradebook");
const GradebookTemplate_1 = require("../../models/GradebookTemplate");
const Student_1 = require("../../models/Student");
const User_1 = require("../../models/User");
const rolloverService_1 = require("../../services/rolloverService");
const readinessUtils_1 = require("../../utils/readinessUtils");
describe('Domain Invariants', () => {
    beforeAll(async () => {
        await (0, utils_1.connectTestDb)();
    });
    afterAll(async () => {
        await (0, utils_1.closeTestDb)();
    });
    beforeEach(async () => {
        await (0, utils_1.clearTestDb)();
    });
    it('Invariant: Cannot create two assignments for same (student, template)', async () => {
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'T1', pages: [], currentVersion: 1 });
        const student = await Student_1.Student.create({ firstName: 'S1', lastName: 'L1', logicalKey: 'S1', dateOfBirth: new Date('2020-01-01') });
        const admin = await User_1.User.create({ email: 'admin@test.com', role: 'ADMIN', passwordHash: 'hash', displayName: 'Admin' });
        await TemplateAssignment_1.TemplateAssignment.create({
            templateId: String(tpl._id),
            studentId: String(student._id),
            assignedBy: String(admin._id),
            status: 'draft'
        });
        await expect(TemplateAssignment_1.TemplateAssignment.create({
            templateId: String(tpl._id),
            studentId: String(student._id),
            assignedBy: String(admin._id),
            status: 'draft'
        })).rejects.toThrow(/duplicate key/);
    });
    it('Invariant: Year rollover resets workflow but keeps data', async () => {
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'T1', pages: [], currentVersion: 1 });
        const student = await Student_1.Student.create({ firstName: 'S1', lastName: 'L1', logicalKey: 'S1', dateOfBirth: new Date('2020-01-01') });
        const teacher = await User_1.User.create({ email: 'teacher@test.com', role: 'TEACHER', passwordHash: 'hash', displayName: 'Teacher' });
        // 1. Create assignment in Year 1
        const year1Id = '600000000000000000000001';
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({
            templateId: String(tpl._id),
            studentId: String(student._id),
            assignedBy: String(teacher._id),
            completionSchoolYearId: year1Id,
            status: 'completed',
            isCompleted: true,
            isCompletedSem1: true,
            data: { someField: 'someValue' }
        });
        // 2. Perform Rollover to Year 2
        const year2Id = '600000000000000000000002';
        const update = (0, rolloverService_1.getRolloverUpdate)(year2Id, String(teacher._id));
        const updated = await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignment._id, { $set: update, $inc: { dataVersion: 1 } }, { new: true });
        // 3. Verify Invariants
        expect(updated).toBeDefined();
        expect(updated.completionSchoolYearId).toBe(year2Id);
        expect(updated.status).toBe('draft');
        expect(updated.isCompleted).toBe(false);
        expect(updated.isCompletedSem1).toBe(false);
        // Data must be preserved
        expect(updated.data.someField).toBe('someValue');
        // Data version incremented
        expect(updated.dataVersion).toBe(2);
    });
    it('Invariant: Snapshots are immutable (via versioning)', async () => {
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 'T1', pages: [], currentVersion: 1 });
        const student = await Student_1.Student.create({ firstName: 'S1', lastName: 'L1', logicalKey: 'S1', dateOfBirth: new Date('2020-01-01') });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({
            templateId: String(tpl._id),
            studentId: String(student._id),
            assignedBy: 'admin',
            data: { v: 1 }
        });
        const yearId = '600000000000000000000001';
        // Create snapshot
        const snapshot = await (0, rolloverService_1.createAssignmentSnapshot)(assignment, 'sem1', {
            schoolYearId: yearId,
            level: 'PS',
            classId: '600000000000000000000099'
        });
        expect(snapshot).toBeDefined();
        expect(snapshot.data.v).toBe(1);
        expect(snapshot.meta.signaturePeriodId).toContain('sem1');
        // Modify assignment
        await TemplateAssignment_1.TemplateAssignment.findByIdAndUpdate(assignment._id, { $set: { 'data.v': 2 } });
        // Snapshot should remain unchanged
        const fetchedSnapshot = await SavedGradebook_1.SavedGradebook.findById(snapshot._id);
        expect(fetchedSnapshot.data.v).toBe(1);
    });
    it('Invariant: Signatures are strictly year-scoped', async () => {
        // This tests the readinessUtils logic we rely on
        const year1 = '600000000000000000000001';
        const year2 = '600000000000000000000002';
        const sig1 = (0, readinessUtils_1.computeSignaturePeriodId)(year1, 'sem1');
        const sig2 = (0, readinessUtils_1.computeSignaturePeriodId)(year2, 'sem1');
        expect(sig1).not.toBe(sig2);
        expect(sig1).toContain(year1);
        expect(sig2).toContain(year2);
    });
});
