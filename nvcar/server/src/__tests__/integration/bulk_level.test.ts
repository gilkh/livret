/// <reference path="../../test/types.d.ts" />
// @ts-ignore: allow test-time import when @types not installed
const request = require('supertest')
import { connectTestDb, clearTestDb, closeTestDb } from '../../test/utils'
import { signToken } from '../../auth'
import { createApp } from '../../app'
import { User } from '../../models/User'
import { ClassModel } from '../../models/Class'
import { Student } from '../../models/Student'
import { Enrollment } from '../../models/Enrollment'
import { GradebookTemplate } from '../../models/GradebookTemplate'
import { SchoolYear } from '../../models/SchoolYear'

let app: any

describe('bulk-level assign/delete', () => {
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

  it('assigns template to all students in level then deletes them', async () => {
    const admin = await User.create({ email: 'bulk-admin', role: 'ADMIN', displayName: 'Bulk Admin', passwordHash: 'hash' })
    const token = signToken({ userId: String(admin._id), role: 'ADMIN' })

    const sy = await SchoolYear.create({ name: 'S1', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const cls1 = await ClassModel.create({ name: 'C1', level: 'PS', schoolYearId: String(sy._id) })
    const cls2 = await ClassModel.create({ name: 'C2', level: 'PS', schoolYearId: String(sy._id) })

    const s1 = await Student.create({ firstName: 'Stu1', lastName: 'L1', dateOfBirth: new Date('2018-01-01'), logicalKey: 'B1' })
    const s2 = await Student.create({ firstName: 'Stu2', lastName: 'L2', dateOfBirth: new Date('2018-01-02'), logicalKey: 'B2' })

    await Enrollment.create({ studentId: String(s1._id), classId: String(cls1._id), schoolYearId: String(sy._id), status: 'active' })
    await Enrollment.create({ studentId: String(s2._id), classId: String(cls2._id), schoolYearId: String(sy._id), status: 'active' })

    const tpl = await GradebookTemplate.create({ name: 'bulkTpl', pages: [], currentVersion: 1 })

    const createRes = await request(app).post('/template-assignments/bulk-level').set('Authorization', `Bearer ${token}`).send({ templateId: String(tpl._id), level: 'PS' })
    expect(createRes.status).toBe(200)
    expect(createRes.body.count).toBeGreaterThanOrEqual(2)

    const delRes = await request(app).delete(`/template-assignments/bulk-level/${tpl._id}/PS`).set('Authorization', `Bearer ${token}`).send()
    expect(delRes.status).toBe(200)
    expect(delRes.body.count).toBeGreaterThanOrEqual(2)
  })
})
