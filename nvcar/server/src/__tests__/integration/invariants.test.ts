/// <reference path="../../test/types.d.ts" />
import { connectTestDb, clearTestDb, closeTestDb } from '../../test/utils'
import { TemplateAssignment } from '../../models/TemplateAssignment'
import { TemplateSignature } from '../../models/TemplateSignature'
import { SavedGradebook } from '../../models/SavedGradebook'
import { GradebookTemplate } from '../../models/GradebookTemplate'
import { Student } from '../../models/Student'
import { User } from '../../models/User'
import { getRolloverUpdate, createAssignmentSnapshot } from '../../services/rolloverService'
import { computeSignaturePeriodId } from '../../utils/readinessUtils'

describe('Domain Invariants', () => {
  beforeAll(async () => {
    await connectTestDb()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await clearTestDb()
  })

  it('Invariant: Cannot create two assignments for same (student, template)', async () => {
    const tpl = await GradebookTemplate.create({ name: 'T1', pages: [], currentVersion: 1 })
    const student = await Student.create({ firstName: 'S1', lastName: 'L1', logicalKey: 'S1', dateOfBirth: new Date('2020-01-01') })
    const admin = await User.create({ email: 'admin@test.com', role: 'ADMIN', passwordHash: 'hash', displayName: 'Admin' })

    await TemplateAssignment.create({
      templateId: String(tpl._id),
      studentId: String(student._id),
      assignedBy: String(admin._id),
      status: 'draft'
    })

    await expect(TemplateAssignment.create({
      templateId: String(tpl._id),
      studentId: String(student._id),
      assignedBy: String(admin._id),
      status: 'draft'
    })).rejects.toThrow(/duplicate key/)
  })

  it('Invariant: Year rollover resets workflow but keeps data', async () => {
    const tpl = await GradebookTemplate.create({ name: 'T1', pages: [], currentVersion: 1 })
    const student = await Student.create({ firstName: 'S1', lastName: 'L1', logicalKey: 'S1', dateOfBirth: new Date('2020-01-01') })
    const teacher = await User.create({ email: 'teacher@test.com', role: 'TEACHER', passwordHash: 'hash', displayName: 'Teacher' })

    // 1. Create assignment in Year 1
    const year1Id = '600000000000000000000001'
    const assignment = await TemplateAssignment.create({
      templateId: String(tpl._id),
      studentId: String(student._id),
      assignedBy: String(teacher._id),
      completionSchoolYearId: year1Id,
      status: 'completed',
      isCompleted: true,
      isCompletedSem1: true,
      data: { someField: 'someValue' }
    })

    // 2. Perform Rollover to Year 2
    const year2Id = '600000000000000000000002'
    const update = getRolloverUpdate(year2Id, String(teacher._id))

    const updated = await TemplateAssignment.findByIdAndUpdate(
      assignment._id,
      { $set: update, $inc: { dataVersion: 1 } },
      { new: true }
    )

    // 3. Verify Invariants
    expect(updated).toBeDefined()
    expect((updated as any).completionSchoolYearId).toBe(year2Id)
    expect((updated as any).status).toBe('draft')
    expect((updated as any).isCompleted).toBe(false)
    expect((updated as any).isCompletedSem1).toBe(false)
    
    // Data must be preserved
    expect((updated as any).data.someField).toBe('someValue')
    // Data version incremented
    expect((updated as any).dataVersion).toBe(2)
  })

  it('Invariant: Snapshots are immutable (via versioning)', async () => {
    const tpl = await GradebookTemplate.create({ name: 'T1', pages: [], currentVersion: 1 })
    const student = await Student.create({ firstName: 'S1', lastName: 'L1', logicalKey: 'S1', dateOfBirth: new Date('2020-01-01') })
    const assignment = await TemplateAssignment.create({
      templateId: String(tpl._id),
      studentId: String(student._id),
      assignedBy: 'admin',
      data: { v: 1 }
    })

    const yearId = '600000000000000000000001'
    
    // Create snapshot
    const snapshot = await createAssignmentSnapshot(assignment, 'sem1', {
        schoolYearId: yearId,
        level: 'PS',
        classId: '600000000000000000000099'
    })

    expect(snapshot).toBeDefined()
    expect((snapshot as any).data.v).toBe(1)
    expect((snapshot as any).meta.signaturePeriodId).toContain('sem1')

    // Modify assignment
    await TemplateAssignment.findByIdAndUpdate(assignment._id, { $set: { 'data.v': 2 } })

    // Snapshot should remain unchanged
    const fetchedSnapshot = await SavedGradebook.findById(snapshot._id)
    expect((fetchedSnapshot as any).data.v).toBe(1)
  })

  it('Invariant: Signatures are strictly year-scoped', async () => {
     // This tests the readinessUtils logic we rely on
     const year1 = '600000000000000000000001'
     const year2 = '600000000000000000000002'

     const sig1 = computeSignaturePeriodId(year1, 'sem1')
     const sig2 = computeSignaturePeriodId(year2, 'sem1')

     expect(sig1).not.toBe(sig2)
     expect(sig1).toContain(year1)
     expect(sig2).toContain(year2)
  })
})
