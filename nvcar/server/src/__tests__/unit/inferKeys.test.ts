/// <reference path="../../test/types.d.ts" />
import { connectTestDb, clearTestDb, closeTestDb } from '../../test/utils'
import { TemplateAssignment } from '../../models/TemplateAssignment'
import { inferLongTermDataKeys } from '../../utils/templateUtils'

beforeAll(async () => {
  await connectTestDb()
})

afterAll(async () => {
  await closeTestDb()
})

beforeEach(async () => {
  await clearTestDb()
})

describe('inferLongTermDataKeys', () => {
  it('infers majority keys and excludes blacklisted or large / null values', async () => {
    const studentId = 'stu1'

    // Create assignments
    await TemplateAssignment.create({ studentId, assignedAt: new Date('2020-01-01'), data: { a: 'x', b: 'y', signatures: [{ type: 'end_of_year' }] } })
    await TemplateAssignment.create({ studentId, assignedAt: new Date('2021-01-01'), data: { a: 'x2', b: 'y2', c: 'keep' } })
    await TemplateAssignment.create({ studentId, assignedAt: new Date('2022-01-01'), data: { a: 'x3', b: undefined, big: 'x'.repeat(20 * 1024), n: null } })

    const keys = await inferLongTermDataKeys(studentId, 3)
    // 'a' appears in all 3, 'b' appears in 2 (one undefined should be ignored for copying but key frequency counts presence), 'c' appears once
    expect(keys).toContain('a')
    expect(keys).toContain('b')
    expect(keys).not.toContain('c')
    // blacklisted 'signatures' is not included
    expect(keys).not.toContain('signatures')
    // 'big' should be excluded due to size
    expect(keys).not.toContain('big')
    // 'n' null should be ignored
    expect(keys).not.toContain('n')
  })
})