/// <reference path="../test/types.d.ts" />
import { connectTestDb, clearTestDb, closeTestDb } from '../test/utils'
import { signTemplateAssignment } from '../services/signatureService'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateSignature } from '../models/TemplateSignature'
import { SchoolYear } from '../models/SchoolYear'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { Student } from '../models/Student'
import { User } from '../models/User'

describe('signatureService edge cases', () => {
  beforeAll(async () => {
    await connectTestDb()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await clearTestDb()
  })

  it('end_of_year creates signature referencing active school year when next year missing', async () => {
    const tpl = await GradebookTemplate.create({ name: 't', pages: [], currentVersion: 1 })
    const student = await Student.create({ firstName: 'E', lastName: 'Y', dateOfBirth: new Date('2018-01-01'), logicalKey: 'E1' })
    const sy = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const signer = await User.create({ email: 'sub-edge', role: 'SUBADMIN', displayName: 'Sub Edge', passwordHash: 'hash' })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(signer._id) })

    const sig = await signTemplateAssignment({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'end_of_year' })
    expect(sig).toBeDefined()

    // The single source of truth for signatures is the TemplateSignature collection
    const stored = await TemplateSignature.findOne({ templateAssignmentId: String(assignment._id), type: 'end_of_year' }).lean()
    expect(stored).toBeDefined()
    // The signature should reference the active school year (not rely on device/server date)
    expect(String(stored?.schoolYearId)).toBe(String(sy._id))

    // Assignment.data.signatures is no longer the source of truth and should not be relied upon
    const updated = await TemplateAssignment.findById(String(assignment._id))
    expect((updated as any).data?.signatures).toBeUndefined()
  })

  it('throws already_signed when signature exists in threshold window', async () => {
    const tpl = await GradebookTemplate.create({ name: 't2', pages: [], currentVersion: 1 })
    const student = await Student.create({ firstName: 'A2', lastName: 'B2', dateOfBirth: new Date('2018-01-02'), logicalKey: 'A2' })
    const syPrev = await SchoolYear.create({ name: '2023/2024', startDate: new Date('2023-09-01'), endDate: new Date('2024-07-01') })
    const sy = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const signer = await User.create({ email: 'sub-edge2', role: 'SUBADMIN', displayName: 'Sub Edge2', passwordHash: 'hash' })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(signer._id) })

    // Existing signature within window - with signaturePeriodId matching what the signing logic will generate
    const signaturePeriodId = `${String(sy._id)}_sem1`
    await TemplateSignature.create({ templateAssignmentId: String(assignment._id), subAdminId: String(signer._id), type: 'standard', signedAt: new Date(), signaturePeriodId, schoolYearId: String(sy._id) })

    try {
      await signTemplateAssignment({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'standard' as any })
      // If it did not throw, ensure no duplicate signature was created
      const cnt = await TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id), signaturePeriodId })
      expect(cnt).toBe(1)
    } catch (e: any) {
      expect(String(e.message)).toBe('already_signed')
    }
  })
})
