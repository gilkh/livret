/// <reference path="../../test/types.d.ts" />
// @ts-ignore: allow test-time import when @types not installed
const request = require('supertest')
import { connectTestDb, clearTestDb, closeTestDb } from '../../test/utils'
import { signToken } from '../../auth'
import { createApp } from '../../app'
import { User } from '../../models/User'
import { ClassModel } from '../../models/Class'
import { SchoolYear } from '../../models/SchoolYear'
import { Student } from '../../models/Student'
import { Enrollment } from '../../models/Enrollment'
import { GradebookTemplate } from '../../models/GradebookTemplate'
import { TemplateAssignment } from '../../models/TemplateAssignment'
import { RoleScope } from '../../models/RoleScope'

describe('subadmin progress current level scope', () => {
  let app: any

  beforeAll(async () => {
    await connectTestDb()
    app = createApp()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await clearTestDb()
  })

  it('counts language toggles only for the student current class level', async () => {
    const active = await SchoolYear.create({
      name: '2025/2026',
      active: true,
      startDate: new Date('2025-09-01'),
      endDate: new Date('2026-07-01')
    })

    const cls = await ClassModel.create({ name: 'MS-A', level: 'MS', schoolYearId: String(active._id) })

    const sub = await User.create({ email: 'sub-ms-gs', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' })
    await RoleScope.create({ userId: String(sub._id), levels: ['MS', 'GS'] })

    const student = await Student.create({ firstName: 'Ali', lastName: 'Test', dateOfBirth: new Date('2019-01-01'), logicalKey: 'ALI-1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(active._id), status: 'active' })

    const tpl = await GradebookTemplate.create({
      name: 'tpl-level-scope',
      pages: [
        {
          blocks: [
            {
              type: 'language_toggle',
              props: {
                blockId: 'lang1',
                items: [
                  { code: 'en', label: 'Anglais', active: true, levels: ['MS', 'GS'] }
                ]
              }
            }
          ]
        }
      ],
      currentVersion: 1
    })

    await TemplateAssignment.create({
      templateId: String(tpl._id),
      studentId: String(student._id),
      completionSchoolYearId: String(active._id),
      status: 'completed',
      isCompleted: true,
      assignedBy: String(sub._id)
    })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })
    const res = await request(app).get('/subadmin-assignments/progress').set('Authorization', `Bearer ${subToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(1)

    const row = res.body[0]
    expect(row.className).toBe('MS-A')

    const levelsData = Array.isArray(row.levelsData) ? row.levelsData : []
    expect(levelsData.length).toBe(1)
    expect(levelsData[0].level).toBe('MS')

    const english = (levelsData[0].byCategory || []).find((c: any) => c.name === 'Anglais')
    expect(english).toBeTruthy()
    expect(english.total).toBe(1)
    expect(english.filled).toBe(1)
    expect(levelsData[0].totalAvailable).toBe(1)
    expect(levelsData[0].activeCount).toBe(1)
  })
})
