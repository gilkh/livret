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
import { TeacherClassAssignment } from '../../models/TeacherClassAssignment'
import { GradebookTemplate } from '../../models/GradebookTemplate'
import { TemplateAssignment } from '../../models/TemplateAssignment'

let app: any

describe('teacher completion behavior', () => {
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

  it('teacher marks done individually and overall completion toggles when all teachers done', async () => {
    const sy = await SchoolYear.create({ name: 'S2', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const cls = await ClassModel.create({ name: 'Class T', level: 'MS', schoolYearId: String(sy._id) })

    const t1 = await User.create({ email: 't1', role: 'TEACHER', displayName: 'Teacher 1', passwordHash: 'hash' })
    const t2 = await User.create({ email: 't2', role: 'TEACHER', displayName: 'Teacher 2', passwordHash: 'hash' })

    await TeacherClassAssignment.create({ teacherId: String(t1._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(t1._id) })
    await TeacherClassAssignment.create({ teacherId: String(t2._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(t2._id) })

    const student = await Student.create({ firstName: 'TT', lastName: 'LN', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S-TT-1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })

    const tpl = await GradebookTemplate.create({ name: 'tplT', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), assignedTeachers: [String(t1._id), String(t2._id)], status: 'draft', isCompleted: false, assignedBy: String(t1._id) })

    // Teacher 1 marks completed
    const t1Token = signToken({ userId: String(t1._id), role: 'TEACHER' })

    const res1 = await request(app).patch(`/template-assignments/${assignment._id}/status`).set('Authorization', `Bearer ${t1Token}`).send({ status: 'completed' })
    expect(res1.status).toBe(200)
    expect(res1.body.isCompleted).toBe(false)
    expect(res1.body.status).toBe('in_progress')

    // Teacher 2 marks completed
    const t2Token = signToken({ userId: String(t2._id), role: 'TEACHER' })
    const res2 = await request(app).patch(`/template-assignments/${assignment._id}/status`).set('Authorization', `Bearer ${t2Token}`).send({ status: 'completed' })
    expect(res2.status).toBe(200)
    expect(res2.body.isCompleted).toBe(true)
    expect(res2.body.status).toBe('completed')
  })
})
