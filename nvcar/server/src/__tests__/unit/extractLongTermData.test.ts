/// <reference path="../../test/types.d.ts" />
import { connectTestDb, clearTestDb, closeTestDb } from '../../test/utils'
import { TemplateAssignment } from '../../models/TemplateAssignment'
import { Setting } from '../../models/Setting'
import { extractLongTermData, inferLongTermDataKeys } from '../../utils/templateUtils'

beforeAll(async () => {
  await connectTestDb()
})

afterAll(async () => {
  await closeTestDb()
})

beforeEach(async () => {
  await clearTestDb()
})

test('admin configured keys are unioned with inferred keys', async () => {
  const studentId = 'stu2'

  // create history with keepB present twice -> inferred
  await TemplateAssignment.create({ studentId, assignedAt: new Date('2022-01-01'), data: { keepB: '1' } })
  await TemplateAssignment.create({ studentId, assignedAt: new Date('2023-01-01'), data: { keepB: '2' } })

  // Admin sets keepA
  await Setting.create({ key: 'assignment_long_term_keys', value: ['keepA'] })

  const recent = await TemplateAssignment.find({ studentId }).sort({ assignedAt: -1 }).limit(3).lean()
  const extracted = await extractLongTermData({ keepA: 'a', keepB: 'b', transient: 'no' }, studentId, recent)

  expect(extracted.keepA).toBe('a')
  expect(extracted.keepB).toBe('b')
  expect(extracted.transient).toBeUndefined()
})