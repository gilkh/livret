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

describe('teacher progress N/A cases', () => {
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

  it('shows N/A for Polyvalent when template only has Arabic and English items', async () => {
    const active = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const cls = await ClassModel.create({ name: 'Class1', level: 'MS', schoolYearId: String(active._id) })

    const t = await User.create({ email: 't', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' })
    await TeacherClassAssignment.create({ teacherId: String(t._id), classId: String(cls._id), schoolYearId: String(active._id), languages: [], isProfPolyvalent: false, assignedBy: String(t._id) })

    const sub = await User.create({ email: 'sub', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' })
    await RoleScope.create({ userId: String(sub._id), levels: ['MS'] })

    const student = await Student.create({ firstName: 'S', lastName: 'L', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(active._id), status: 'active' })

    // Template only includes Arabe and Anglais (no Polyvalent / FR items)
    const tpl = await GradebookTemplate.create({ name: 'tpl', pages: [ { blocks: [ { type: 'language_toggle', props: { items: [ { code: 'ar', label: 'Arabe', active: false }, { code: 'en', label: 'Anglais', active: false } ], blockId: 'b1' } } ] } ], currentVersion: 1 })

    await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), completionSchoolYearId: String(active._id), assignedTeachers: [String(t._id)], assignedBy: String(t._id), status: 'completed', isCompleted: true, teacherCompletions: [{ teacherId: String(t._id), completed: true, completedAt: new Date() }] })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const res = await request(app).get('/subadmin-assignments/teacher-progress-detailed').set('Authorization', `Bearer ${subToken}`)
    expect(res.status).toBe(200)

    const clsRow = res.body.find((c: any) => c.classId === String(cls._id))
    expect(clsRow).toBeTruthy()

    const st = clsRow.students.find((s: any) => s.studentId === String(student._id))
    expect(st).toBeTruthy()

    // Polyvalent should be N/A (no Polyvalent items)
    expect(st.hasPolyvalent).toBe(false)
    // Arabic and English should be present and marked done
    expect(st.hasArabic).toBe(true)
    expect(st.hasEnglish).toBe(true)
    expect(st.arabic).toBe(true)
    expect(st.english).toBe(true)
  })

  it('shows N/A for categories when template items are filtered out by level', async () => {
    const active = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const cls = await ClassModel.create({ name: 'Class1', level: 'MS', schoolYearId: String(active._id) })

    const t = await User.create({ email: 't', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' })
    await TeacherClassAssignment.create({ teacherId: String(t._id), classId: String(cls._id), schoolYearId: String(active._id), languages: [], isProfPolyvalent: false, assignedBy: String(t._id) })

    const sub = await User.create({ email: 'sub', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' })
    await RoleScope.create({ userId: String(sub._id), levels: ['MS'] })

    const student = await Student.create({ firstName: 'S', lastName: 'L', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(active._id), status: 'active' })

    // Template has FR item but for level PS only (not MS) -> should not be assigned
    const tpl = await GradebookTemplate.create({ name: 'tpl2', pages: [ { blocks: [ { type: 'language_toggle', props: { items: [ { code: 'fr', label: 'Français', active: false, level: 'PS' } ], blockId: 'b1' } } ] } ], currentVersion: 1 })

    await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), completionSchoolYearId: String(active._id), assignedTeachers: [String(t._id)], assignedBy: String(t._id), status: 'completed', isCompleted: true, teacherCompletions: [{ teacherId: String(t._id), completed: true, completedAt: new Date() }] })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const res = await request(app).get('/subadmin-assignments/teacher-progress-detailed').set('Authorization', `Bearer ${subToken}`)
    expect(res.status).toBe(200)

    const clsRow = res.body.find((c: any) => c.classId === String(cls._id))
    expect(clsRow).toBeTruthy()

    const st = clsRow.students.find((s: any) => s.studentId === String(student._id))
    expect(st).toBeTruthy()

    // FR / Polyvalent should be N/A because the item doesn't match class level
    expect(st.hasPolyvalent).toBe(false)
    expect(st.polyvalent).toBe(false)
  })
})
