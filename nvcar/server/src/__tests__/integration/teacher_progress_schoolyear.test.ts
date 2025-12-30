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

describe('teacher progress and school year filtering', () => {
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

  it('does not count previous year completions in current year progress', async () => {
    // Create years
    const prev = await SchoolYear.create({ name: '2023/2024', startDate: new Date('2023-09-01'), endDate: new Date('2024-07-01'), active: false })
    const active = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })

    // Create classes
    const clsPrev = await ClassModel.create({ name: 'ClassPrev', level: 'MS', schoolYearId: String(prev._id) })
    const clsActive = await ClassModel.create({ name: 'ClassActive', level: 'MS', schoolYearId: String(active._id) })

    // Teacher assigned to active class
    const t = await User.create({ email: 't', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' })
    await TeacherClassAssignment.create({ teacherId: String(t._id), classId: String(clsActive._id), schoolYearId: String(active._id), assignedBy: String(t._id) })

    // SubAdmin and RoleScope to allow access
    const sub = await User.create({ email: 'sub', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' })
    await RoleScope.create({ userId: String(sub._id), levels: ['MS'] })

    // Student promoted from prev to active
    const student = await Student.create({ firstName: 'S', lastName: 'L', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(clsPrev._id), schoolYearId: String(prev._id), status: 'active' })
    await Enrollment.create({ studentId: String(student._id), classId: String(clsActive._id), schoolYearId: String(active._id), status: 'active' })

    // Templates for prev and active years
    const tplPrev = await GradebookTemplate.create({ name: 'tplPrev', pages: [ { blocks: [ { type: 'language_toggle', props: { items: [ { code: 'fr', label: 'Français', active: false } ], blockId: 'b1' } } ] } ], currentVersion: 1 })
    const tplActive = await GradebookTemplate.create({ name: 'tplActive', pages: [ { blocks: [ { type: 'language_toggle', props: { items: [ { code: 'fr', label: 'Français', active: false } ], blockId: 'b1' } } ] } ], currentVersion: 1 })

    const activeDb = await SchoolYear.findOne({ active: true })
    console.log('ACTIVE_DB', String(activeDb?._id), activeDb?.name)

    // Assignment in previous year: completed by teacher (using tplPrev)
    await TemplateAssignment.create({ templateId: String(tplPrev._id), studentId: String(student._id), completionSchoolYearId: String(prev._id), assignedTeachers: [String(t._id)], assignedBy: String(t._id), status: 'completed', isCompleted: true, teacherCompletions: [{ teacherId: String(t._id), completed: true, completedAt: new Date() }] })

    // Assignment in current year: not completed (using tplActive)
    await TemplateAssignment.create({ templateId: String(tplActive._id), studentId: String(student._id), completionSchoolYearId: String(active._id), assignedTeachers: [String(t._id)], assignedBy: String(t._id), status: 'draft', isCompleted: false })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const res = await request(app).get('/subadmin-assignments/teacher-progress').set('Authorization', `Bearer ${subToken}`)
    expect(res.status).toBe(200)
    console.log('PROG RES', JSON.stringify(res.body, null, 2))
    const clsRow = res.body.find((c: any) => c.classId === String(clsActive._id))
    expect(clsRow).toBeTruthy()
    // There is one competency and it should NOT be filled (previous year's completion shouldn't be counted)
    expect(clsRow.progress.filled).toBe(0)
  })

  it('returns progress for a specific school year when schoolYearId is provided', async () => {
    // Create years
    const prev = await SchoolYear.create({ name: '2023/2024', startDate: new Date('2023-09-01'), endDate: new Date('2024-07-01'), active: false })
    const active = await SchoolYear.create({ name: '2024/2025', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })

    // Create classes for both years
    const clsPrev = await ClassModel.create({ name: 'ClassPrev', level: 'MS', schoolYearId: String(prev._id) })
    const clsActive = await ClassModel.create({ name: 'ClassActive', level: 'MS', schoolYearId: String(active._id) })

    // Teacher assigned to both classes
    const t = await User.create({ email: 't', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' })
    await TeacherClassAssignment.create({ teacherId: String(t._id), classId: String(clsPrev._id), schoolYearId: String(prev._id), assignedBy: String(t._id) })
    await TeacherClassAssignment.create({ teacherId: String(t._id), classId: String(clsActive._id), schoolYearId: String(active._id), assignedBy: String(t._id) })

    // SubAdmin and RoleScope to allow access
    const sub = await User.create({ email: 'sub', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' })
    await RoleScope.create({ userId: String(sub._id), levels: ['MS'] })

    // Student enrolled in both years
    const student = await Student.create({ firstName: 'S', lastName: 'L', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(clsPrev._id), schoolYearId: String(prev._id), status: 'active' })
    await Enrollment.create({ studentId: String(student._id), classId: String(clsActive._id), schoolYearId: String(active._id), status: 'active' })

    // Templates
    const tpl = await GradebookTemplate.create({ name: 'tpl', pages: [ { blocks: [ { type: 'language_toggle', props: { items: [ { code: 'fr', label: 'Français', active: false } ], blockId: 'b1' } } ] } ], currentVersion: 1 })

    // Assignment in previous year: completed by teacher
    await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), completionSchoolYearId: String(prev._id), assignedTeachers: [String(t._id)], assignedBy: String(t._id), status: 'completed', isCompleted: true, teacherCompletions: [{ teacherId: String(t._id), completed: true, completedAt: new Date() }] })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    // Query with explicit schoolYearId for previous year - should return previous year's data
    const resPrev = await request(app).get(`/subadmin-assignments/teacher-progress?schoolYearId=${prev._id}`).set('Authorization', `Bearer ${subToken}`)
    expect(resPrev.status).toBe(200)
    const clsPrevRow = resPrev.body.find((c: any) => c.classId === String(clsPrev._id))
    expect(clsPrevRow).toBeTruthy()
    // Previous year class should be returned when querying with previous year's schoolYearId
    expect(clsPrevRow.className).toBe('ClassPrev')

    // Query without schoolYearId - should return active year's data
    const resActive = await request(app).get('/subadmin-assignments/teacher-progress').set('Authorization', `Bearer ${subToken}`)
    expect(resActive.status).toBe(200)
    const clsActiveRow = resActive.body.find((c: any) => c.classId === String(clsActive._id))
    expect(clsActiveRow).toBeTruthy()
    expect(clsActiveRow.className).toBe('ClassActive')
  })
})
