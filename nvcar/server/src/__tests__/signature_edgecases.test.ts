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

  it('end_of_year creates computed next year name when next year missing', async () => {
    const tpl = await GradebookTemplate.create({ name: 't', pages: [], currentVersion: 1 })
    const student = await Student.create({ firstName: 'E', lastName: 'Y', dateOfBirth: new Date('2018-01-01'), logicalKey: 'E1' })
    const sy = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const signer = await User.create({ email: 'sub-edge', role: 'SUBADMIN', displayName: 'Sub Edge', passwordHash: 'hash' })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(signer._id) })

    const sig = await signTemplateAssignment({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'end_of_year' })
    expect(sig).toBeDefined()

    const updated = await TemplateAssignment.findById(String(assignment._id))
    // DEBUG
    // console.log('UPDATED DATA', JSON.stringify((updated as any).data))
    const s = Array.isArray((updated as any).data?.signatures) ? (updated as any).data.signatures[0] : null
    expect(s).toBeDefined()
    // computed by adding one year
    expect(s?.schoolYearName).toBe('2025/2026')
  })

  it('throws already_signed when signature exists in threshold window', async () => {
    const tpl = await GradebookTemplate.create({ name: 't2', pages: [], currentVersion: 1 })
    const student = await Student.create({ firstName: 'A2', lastName: 'B2', dateOfBirth: new Date('2018-01-02'), logicalKey: 'A2' })
    const syPrev = await SchoolYear.create({ name: '2023/2024', startDate: new Date('2023-09-01'), endDate: new Date('2024-07-01') })
    const sy = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const signer = await User.create({ email: 'sub-edge2', role: 'SUBADMIN', displayName: 'Sub Edge2', passwordHash: 'hash' })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(signer._id) })

    // Existing signature within window
    await TemplateSignature.create({ templateAssignmentId: String(assignment._id), subAdminId: String(signer._id), type: 'standard', signedAt: new Date() })

    await expect(signTemplateAssignment({ templateAssignmentId: String(assignment._id), signerId: String(signer._id), type: 'standard' as any })).rejects.toThrow('already_signed')
  })
})
