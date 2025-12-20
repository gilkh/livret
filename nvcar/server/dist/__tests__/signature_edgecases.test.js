"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="../test/types.d.ts" />
const utils_1 = require("../test/utils");
const signatureService_1 = require("../services/signatureService");
const TemplateAssignment_1 = require("../models/TemplateAssignment");
const TemplateSignature_1 = require("../models/TemplateSignature");
const SchoolYear_1 = require("../models/SchoolYear");
const GradebookTemplate_1 = require("../models/GradebookTemplate");
const Student_1 = require("../models/Student");
const User_1 = require("../models/User");
describe('signatureService edge cases', () => {
    beforeAll(async () => {
        await (0, utils_1.connectTestDb)();
    });
    afterAll(async () => {
        await (0, utils_1.closeTestDb)();
    });
    beforeEach(async () => {
        await (0, utils_1.clearTestDb)();
    });
    it('end_of_year creates computed next year name when next year missing', async () => {
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 't', pages: [], currentVersion: 1 });
        const student = await Student_1.Student.create({ firstName: 'E', lastName: 'Y', dateOfBirth: new Date('2018-01-01'), logicalKey: 'E1' });
        const sy = await SchoolYear_1.SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
        const signer = await User_1.User.create({ email: 'sub-edge', role: 'SUBADMIN', displayName: 'Sub Edge', passwordHash: 'hash' });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(signer._id) });
        const sig = await (0, signatureService_1.signTemplateAssignment)({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'end_of_year' });
        expect(sig).toBeDefined();
        const updated = await TemplateAssignment_1.TemplateAssignment.findById(String(assignment._id));
        // DEBUG
        // console.log('UPDATED DATA', JSON.stringify((updated as any).data))
        const s = Array.isArray(updated.data?.signatures) ? updated.data.signatures[0] : null;
        expect(s).toBeDefined();
        // computed by adding one year
        expect(s?.schoolYearName).toBe('2025/2026');
    });
    it('throws already_signed when signature exists in threshold window', async () => {
        const tpl = await GradebookTemplate_1.GradebookTemplate.create({ name: 't2', pages: [], currentVersion: 1 });
        const student = await Student_1.Student.create({ firstName: 'A2', lastName: 'B2', dateOfBirth: new Date('2018-01-02'), logicalKey: 'A2' });
        const syPrev = await SchoolYear_1.SchoolYear.create({ name: '2023/2024', startDate: new Date('2023-09-01'), endDate: new Date('2024-07-01') });
        const sy = await SchoolYear_1.SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') });
        const signer = await User_1.User.create({ email: 'sub-edge2', role: 'SUBADMIN', displayName: 'Sub Edge2', passwordHash: 'hash' });
        const assignment = await TemplateAssignment_1.TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(signer._id) });
        // Existing signature within window
        await TemplateSignature_1.TemplateSignature.create({ templateAssignmentId: String(assignment._id), subAdminId: String(signer._id), type: 'standard', signedAt: new Date() });
        await expect((0, signatureService_1.signTemplateAssignment)({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'standard' })).rejects.toThrow('already_signed');
    });
});
