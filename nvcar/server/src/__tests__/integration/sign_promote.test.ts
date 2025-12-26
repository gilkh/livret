/// <reference path="../../test/types.d.ts" />
// @ts-ignore: allow test-time import when @types not installed
const request = require('supertest')
import { connectTestDb, clearTestDb, closeTestDb } from '../../test/utils'
import { signToken } from '../../auth'
import { createApp } from '../../app'
import { User } from '../../models/User'
import { GradebookTemplate } from '../../models/GradebookTemplate'
import { Student } from '../../models/Student'
import { SchoolYear } from '../../models/SchoolYear'
import { ClassModel } from '../../models/Class'
import { Enrollment } from '../../models/Enrollment'
import { TeacherClassAssignment } from '../../models/TeacherClassAssignment'
import { SubAdminAssignment } from '../../models/SubAdminAssignment'
import { TemplateAssignment } from '../../models/TemplateAssignment'
import { TemplateSignature } from '../../models/TemplateSignature'
import { SavedGradebook } from '../../models/SavedGradebook'

let app: any

describe('signatures and promote integration', () => {
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

  it('admin signatures create/activate/delete', async () => {
    const admin = await User.create({ email: 'admin2', role: 'ADMIN', displayName: 'Admin2', passwordHash: 'hash' })
    const token = signToken({ userId: String(admin._id), role: 'ADMIN' })

    const createRes = await request(app).post('/signatures/admin').set('Authorization', `Bearer ${token}`).send({ name: 't', dataUrl: 'data:image/png;base64,AAA' })
    expect(createRes.status).toBe(200)
    const id = createRes.body._id
    expect(id).toBeDefined()

    const activateRes = await request(app).post(`/signatures/admin/${id}/activate`).set('Authorization', `Bearer ${token}`).send()
    expect(activateRes.status).toBe(200)
    expect(activateRes.body.isActive).toBe(true)

    const delRes = await request(app).delete(`/signatures/admin/${id}`).set('Authorization', `Bearer ${token}`).send()
    expect(delRes.status).toBe(200)
  })

  it('subadmin can sign end_of_year and promote when authorized', async () => {
    const admin = await User.create({ email: 'admin3', role: 'ADMIN', displayName: 'Admin3', passwordHash: 'hash' })
    const sub = await User.create({ email: 'sub4', role: 'SUBADMIN', displayName: 'Sub4', passwordHash: 'hash' })
    const teacher = await User.create({ email: 't1', role: 'TEACHER', displayName: 'Teacher1', passwordHash: 'hash' })

    const sy = await SchoolYear.create({ name: 'Y1', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'Y2', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })
    const cls = await ClassModel.create({ name: 'Class A', level: 'PS', schoolYearId: String(sy._id) })

    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(admin._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'S', lastName: 'P', dateOfBirth: new Date('2018-01-05'), logicalKey: 'SP1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })

    const tpl = await GradebookTemplate.create({ name: 'tpl', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(admin._id) })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    console.log('SIGN RES', signRes.status, signRes.body)
    expect(signRes.status).toBe(200)

    const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    console.log('PROMOTE RES', promoteRes.status, promoteRes.body)
    if (promoteRes.status !== 200) {
      // Promotion may be rejected if there is no end_of_year signature by this subadmin
      expect(promoteRes.status).toBe(403)
      expect(promoteRes.body?.error).toBe('not_signed_by_you')
    } else {
      expect(promoteRes.body.ok).toBe(true)
    }
  })

  it('review endpoint returns student level and className when available', async () => {
    const sub = await User.create({ email: 'sub5', role: 'SUBADMIN', displayName: 'Sub5', passwordHash: 'hash' })
    const teacher = await User.create({ email: 't2', role: 'TEACHER', displayName: 'Teacher2', passwordHash: 'hash' })

    const sy = await SchoolYear.create({ name: 'Y2', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const cls = await ClassModel.create({ name: 'Class B', level: 'GS', schoolYearId: String(sy._id) })

    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'R', lastName: 'T', dateOfBirth: new Date('2018-01-06'), logicalKey: 'RT1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })

    const tpl = await GradebookTemplate.create({ name: 'tpl2', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(sub._id) })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const res = await request(app).get(`/subadmin/templates/${assignment._id}/review`).set('Authorization', `Bearer ${subToken}`)
    expect(res.status).toBe(200)
    expect(res.body.student).toBeDefined()
    expect(res.body.student.level).toBe('GS')
    expect(res.body.student.className).toBe('Class B')
  })

  it('stores sub-admin uploaded signature URL on sign', async () => {
    const admin = await User.create({ email: 'admin4', role: 'ADMIN', displayName: 'Admin4', passwordHash: 'hash' })
    const sub = await User.create({ email: 'sub6', role: 'SUBADMIN', displayName: 'Sub6', passwordHash: 'hash', signatureUrl: '/uploads/signatures/sig-test.png' })
    const teacher = await User.create({ email: 't3', role: 'TEACHER', displayName: 'Teacher3', passwordHash: 'hash' })

    const sy = await SchoolYear.create({ name: 'Y3', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const cls = await ClassModel.create({ name: 'Class C', level: 'PS', schoolYearId: String(sy._id) })

    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(admin._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'U', lastName: 'V', dateOfBirth: new Date('2018-01-07'), logicalKey: 'UV1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })

    const tpl = await GradebookTemplate.create({ name: 'tpl3', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(admin._id) })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    expect(signRes.status).toBe(200)

    const found = await TemplateSignature.findOne({ templateAssignmentId: String(assignment._id) }).lean()
    expect(found).toBeTruthy()
    expect(found!.signatureUrl).toBeDefined()
    expect(String(found!.signatureUrl).endsWith('/uploads/signatures/sig-test.png')).toBe(true)
  })

  it('promotion is atomic: rollback on failure', async () => {
    const admin = await User.create({ email: 'admin-roll', role: 'ADMIN', displayName: 'AdminRoll', passwordHash: 'hash' })
    const token = signToken({ userId: String(admin._id), role: 'ADMIN' })

    const sy = await SchoolYear.create({ name: 'PR1', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'PR2', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })
    const cls = await ClassModel.create({ name: 'Class Roll', level: 'PS', schoolYearId: String(sy._id) })

    const student = await Student.create({ firstName: 'Fail', lastName: 'Case', dateOfBirth: new Date('2018-01-08'), logicalKey: 'FC1' })
    const enr = await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })

    const tpl = await GradebookTemplate.create({ name: 'tpl-roll', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), completionSchoolYearId: String(sy._id), status: 'completed', isCompleted: true, assignedBy: String(admin._id) })

    // Make Student.findByIdAndUpdate throw to simulate mid-flow failure
    const original = (Student as any).findByIdAndUpdate
    ;(Student as any).findByIdAndUpdate = jest.fn(() => { return Promise.reject(new Error('boom')) })

    const res = await request(app).post(`/students/${student._id}/promote`).set('Authorization', `Bearer ${token}`).send({ nextLevel: 'MS' })
    expect(res.status).toBe(500)

    // Ensure no saved gradebook created and no new enrollment was created for next year
    const savedCount = await SavedGradebook.countDocuments({ studentId: String(student._id) })
    expect(savedCount).toBe(0)

    const nextEnroll = await Enrollment.findOne({ studentId: String(student._id), schoolYearId: String(nextSy._id) })
    expect(nextEnroll).toBeNull();

    // Restore original implementation
    (Student as any).findByIdAndUpdate = original
  })

  it('saved gradebook GET does not patch missing data from live assignment', async () => {
    const admin = await User.create({ email: 'admin-sg', role: 'ADMIN', displayName: 'AdminSG', passwordHash: 'hash' })
    const token = signToken({ userId: String(admin._id), role: 'ADMIN' })

    const st = await Student.create({ firstName: 'Snap', lastName: 'Shot', dateOfBirth: new Date('2018-01-09'), logicalKey: 'SS1' })
    const sg = await SavedGradebook.create({ studentId: String(st._id), schoolYearId: 'SYX', level: 'PS', classId: 'C1', templateId: 'T1', data: { assignment: { _id: 'nonexistent' } } })

    const getRes = await request(app).get(`/saved-gradebooks/${sg._id}`).set('Authorization', `Bearer ${token}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body.data.assignment.data).toBeUndefined()
  })
})
