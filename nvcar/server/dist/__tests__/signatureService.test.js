"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../test/utils");
const signatureService_1 = require("../services/signatureService");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TemplateSignature_1 = require("../models/TemplateSignature");
const SchoolYear_1 = require("../models/SchoolYear");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const Student_1 = require("../models/Student");
const User_1 = require("../models/User");
describe('signatureService', () => {
    beforeAll(async () => {
        await (0, utils_1.connectTestDb)();
    });
    afterAll(async () => {
        await (0, utils_1.closeTestDb)();
    });
    beforeEach(async () => {
        await (0, utils_1.clearTestDb)();
    });
    it('throws when assignment not completed (sem1)', async () => {
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 't', pages: [], currentVersion: 1 });
        const student = await Student_1.Student.create({ firstName: 'X', lastName: 'Y', dateOfBirth: new Date('2018-01-01'), logicalKey: 'X1' });
        const signer = await User_1.User.create({ email: 'sub', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'draft', isCompleted: false, assignedBy: String(signer._id) });
        await expect((0, signatureService_1.signTemplateAssignment)({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'standard' })).rejects.toThrow('not_completed_sem1');
    });
    it('signs and updates assignment status and data', async () => {
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 't', pages: [], currentVersion: 1 });
        const student = await Student_1.Student.create({ firstName: 'A', lastName: 'B', dateOfBirth: new Date('2018-01-02'), logicalKey: 'A2' });
        const sy = await SchoolYear_1.SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
        const signer = await User_1.User.create({ email: 'sub2', role: 'SUBADMIN', displayName: 'Sub2', passwordHash: 'hash' });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(signer._id) });
        const sig = await (0, signatureService_1.signTemplateAssignment)({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'standard' });
        expect(sig).toBeDefined();
        const found = await TemplateSignature_1.TemplateSignature.findOne({ templateAssignmentId: String(assignment._id) });
        expect(found).toBeDefined();
        const updated = await TemplateAssignment_1.TemplateAssignment.findById(String(assignment._id));
        expect(updated?.status).toBe('signed');
        // DEBUG
        // console.log('UPDATED DATA', JSON.stringify(updated?.data))
        expect(updated.data?.signatures?.length).toBeGreaterThan(0);
    });
    it('unsign removes signature and reverts status when no remaining signatures', async () => {
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 't', pages: [], currentVersion: 1 });
        const student = await Student_1.Student.create({ firstName: 'A', lastName: 'B', dateOfBirth: new Date('2018-01-03'), logicalKey: 'A3' });
        const signer = await User_1.User.create({ email: 'sub3', role: 'SUBADMIN', displayName: 'Sub3', passwordHash: 'hash' });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'signed', isCompleted: true, assignedBy: String(signer._id), data: { signatures: [{ type: 'standard', subAdminId: String(signer._id) }] } });
        await TemplateSignature_1.TemplateSignature.create({ templateAssignmentId: String(assignment._id), subAdminId: String(signer._id), type: 'standard', status: 'signed' });
        const res = await (0, signatureService_1.unsignTemplateAssignment)({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'standard' });
        expect(res).toBeDefined();
        const remaining = await TemplateSignature_1.TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id) });
        expect(remaining).toBe(0);
        const updated = await TemplateAssignment_1.TemplateAssignment.findById(String(assignment._id));
        expect(updated?.status).toBe('completed');
    });
});
