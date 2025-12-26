/// <reference path="../test/types.d.ts" />
import mongoose from 'mongoose'
import { connectTestDb, clearTestDb, closeTestDb } from '../test/utils'
import { signTemplateAssignment, unsignTemplateAssignment, populateSignatures } from '../services/signatureService'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateSignature } from '../models/TemplateSignature'
import { SchoolYear } from '../models/SchoolYear'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { Student } from '../models/Student'
import { User } from '../models/User'

describe('signatureService', () => {
  beforeAll(async () => {
    await connectTestDb()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await clearTestDb()
  })

  it('throws when assignment not completed (sem1)', async () => {
    const tpl = await GradebookTemplate.create({ name: 't', pages: [], currentVersion: 1 })
    const student = await Student.create({ firstName: 'X', lastName: 'Y', dateOfBirth: new Date('2018-01-01'), logicalKey: 'X1' })
    const signer = await User.create({ email: 'sub', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' })
    const sy = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'draft', isCompleted: false, assignedBy: String(signer._id) })

    await expect(signTemplateAssignment({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'standard' as any })).rejects.toThrow('not_completed_sem1')
  })

  it('signs and updates assignment status and data', async () => {
    const tpl = await GradebookTemplate.create({ name: 't', pages: [], currentVersion: 1 })
    const student = await Student.create({ firstName: 'A', lastName: 'B', dateOfBirth: new Date('2018-01-02'), logicalKey: 'A2' })
    const sy = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const signer = await User.create({ email: 'sub2', role: 'SUBADMIN', displayName: 'Sub2', passwordHash: 'hash' })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(signer._id) })

    const sig = await signTemplateAssignment({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'standard' })

    expect(sig).toBeDefined()
    const found = await TemplateSignature.findOne({ templateAssignmentId: String(assignment._id) })
    expect(found).toBeDefined()

    const updated = await TemplateAssignment.findById(String(assignment._id))
    expect(updated?.status).toBe('signed')
    
    // Verify signatures are NOT stored in data (removed duplicate storage)
    expect((updated as any).data?.signatures).toBeUndefined()
    
    // Verify populateSignatures works
    const populated = await populateSignatures(updated?.toObject())
    expect(populated.data.signatures.length).toBeGreaterThan(0)
  })

  it('unsign removes signature and reverts status when no remaining signatures', async () => {
    const tpl = await GradebookTemplate.create({ name: 't', pages: [], currentVersion: 1 })
    const student = await Student.create({ firstName: 'A', lastName: 'B', dateOfBirth: new Date('2018-01-03'), logicalKey: 'A3' })
    const signer = await User.create({ email: 'sub3', role: 'SUBADMIN', displayName: 'Sub3', passwordHash: 'hash' })
    const sy = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'signed', isCompleted: true, assignedBy: String(signer._id), data: { signatures: [{ type: 'standard', subAdminId: String(signer._id) }] } })
    await TemplateSignature.create({ templateAssignmentId: String(assignment._id), subAdminId: String(signer._id), type: 'standard', status: 'signed', signaturePeriodId: `${String(sy._id)}_sem1`, schoolYearId: String(sy._id) })

    const res = await unsignTemplateAssignment({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'standard' })
    expect(res).toBeDefined()

    const remaining = await TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id) })
    expect(remaining).toBe(0)

    const updated = await TemplateAssignment.findById(String(assignment._id))
    expect(updated?.status).toBe('completed')
  })

  it('rejects duplicate signatures when explicit signaturePeriodId is supplied', async () => {
    const tpl = await GradebookTemplate.create({ name: 't', pages: [], currentVersion: 1 })
    const student = await Student.create({ firstName: 'E', lastName: 'F', dateOfBirth: new Date('2018-01-04'), logicalKey: 'E4' })
    const signer = await User.create({ email: 'sub4', role: 'SUBADMIN', displayName: 'Sub4', passwordHash: 'hash' })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(signer._id) })

    const explicitId = 'explicit_2024_sem1'
    const sig = await signTemplateAssignment({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'standard', signaturePeriodId: explicitId })
    expect(sig).toBeDefined()

    await expect(signTemplateAssignment({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'standard', signaturePeriodId: explicitId })).rejects.toThrow('already_signed')
  })
})
