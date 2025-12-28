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
import { RoleScope } from '../../models/RoleScope'

let app: any

describe('teacher progress empty languages behavior', () => {
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

  it('counts empty languages assignment as responsible for Polyvalent, Arabic and English when teacher completed', async () => {
    // Create active year
    const active = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })

    // Create class
    const cls = await ClassModel.create({ name: 'Class1', level: 'MS', schoolYearId: String(active._id) })

    // Teacher assigned with empty languages (means all)
    const t = await User.create({ email: 't', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' })
    await TeacherClassAssignment.create({ teacherId: String(t._id), classId: String(cls._id), schoolYearId: String(active._id), languages: [], isProfPolyvalent: false, assignedBy: String(t._id) })

    // SubAdmin and RoleScope to allow access
    const sub = await User.create({ email: 'sub', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' })
    await RoleScope.create({ userId: String(sub._id), levels: ['MS'] })

    // Student in class
    const student = await Student.create({ firstName: 'S', lastName: 'L', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(active._id), status: 'active' })

    // Template with language_toggle items for fr (polyvalent), ar, en
    const tpl = await GradebookTemplate.create({ name: 'tpl', pages: [ { blocks: [ { type: 'language_toggle', props: { items: [ { code: 'fr', label: 'Français', active: false }, { code: 'ar', label: 'Arabe', active: false }, { code: 'en', label: 'Anglais', active: false } ], blockId: 'b1' } } ] } ], currentVersion: 1 })

    // Assignment: teacher has completed
    await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), completionSchoolYearId: String(active._id), assignedTeachers: [String(t._id)], assignedBy: String(t._id), status: 'completed', isCompleted: true, teacherCompletions: [{ teacherId: String(t._id), completed: true, completedAt: new Date() }] })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const res = await request(app).get('/subadmin-assignments/teacher-progress').set('Authorization', `Bearer ${subToken}`)
    expect(res.status).toBe(200)

    const clsRow = res.body.find((c: any) => c.classId === String(cls._id))
    expect(clsRow).toBeTruthy()

    // Find categories
    const poly = (clsRow.byCategory || []).find((c: any) => c.name === 'Polyvalent')
    const ar = (clsRow.byCategory || []).find((c: any) => c.name === 'Arabe')
    const en = (clsRow.byCategory || []).find((c: any) => c.name === 'Anglais')

    expect(poly).toBeTruthy()
    expect(ar).toBeTruthy()
    expect(en).toBeTruthy()

    // Each category should have total > 0 and filled == total (since teacher completed)
    expect(poly.total).toBeGreaterThan(0)
    expect(poly.filled).toBe(poly.total)

    expect(ar.total).toBeGreaterThan(0)
    expect(ar.filled).toBe(ar.total)

    expect(en.total).toBeGreaterThan(0)
    expect(en.filled).toBe(en.total)
  })
})
