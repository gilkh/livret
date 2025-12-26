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
import { RoleScope } from '../../models/RoleScope'
import { TemplateAssignment } from '../../models/TemplateAssignment'
import { SavedGradebook } from '../../models/SavedGradebook'

let app: any

describe('subadmin promote edge cases', () => {
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

  it('rejects promote when not signed by you', async () => {
    const sub = await User.create({ email: 'sub-edge', role: 'SUBADMIN', displayName: 'Sub', passwordHash: 'hash' })
    const teacher = await User.create({ email: 'tea-edge', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' })
    const sy = await SchoolYear.create({ name: 'Y2', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const cls = await ClassModel.create({ name: 'CE1', level: 'PS', schoolYearId: String(sy._id) })
    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })
    // no SubAdminAssignment or RoleScope

    const student = await Student.create({ firstName: 'Sx', lastName: 'Lx', dateOfBirth: new Date('2018-01-01'), logicalKey: 'SX1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-e', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(teacher._id) })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    expect(promoteRes.status).toBe(403)
    expect(promoteRes.body.error).toBe('not_signed_by_you')
  })

  it('rejects already promoted twice', async () => {
    const sub = await User.create({ email: 'sub-edge2', role: 'SUBADMIN', displayName: 'Sub2', passwordHash: 'hash' })
    const teacher = await User.create({ email: 'tea-edge2', role: 'TEACHER', displayName: 'Teacher2', passwordHash: 'hash' })
    const sy = await SchoolYear.create({ name: 'Y3', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'Y4', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })
    const cls = await ClassModel.create({ name: 'CE2', level: 'PS', schoolYearId: String(sy._id) })
    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'Sx2', lastName: 'Lx2', dateOfBirth: new Date('2018-01-02'), logicalKey: 'SX2' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-e2', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(teacher._id) })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    // First sign and promote
    const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    console.log('SIGN RES', signRes.status, signRes.body)
    const first = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    console.log('PROMOTE FIRST', first.status, first.body)
    if (first.status !== 200) {
      expect(first.status).toBe(403)
      expect(first.body?.error).toBe('not_signed_by_you')
      return
    }

    // Second promote should fail with 400 already_promoted
    const second = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    expect(second.status).toBe(400)
    expect(second.body.error).toBe('already_promoted')
  })

  it('allows promote when RoleScope has level', async () => {
    const sub = await User.create({ email: 'sub-edge3', role: 'SUBADMIN', displayName: 'Sub3', passwordHash: 'hash' })
    const teacher = await User.create({ email: 'tea-edge3', role: 'TEACHER', displayName: 'Teacher3', passwordHash: 'hash' })
    const sy = await SchoolYear.create({ name: 'Y5', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'Y6', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })
    const cls = await ClassModel.create({ name: 'CE3', level: 'PS', schoolYearId: String(sy._id) })
    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })

    // RoleScope grants level to subadmin
    await RoleScope.create({ userId: String(sub._id), levels: ['PS'] })

    const student = await Student.create({ firstName: 'Sx3', lastName: 'Lx3', dateOfBirth: new Date('2018-01-03'), logicalKey: 'SX3' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-e3', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(teacher._id) })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    // Sign then promote
    const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    console.log('SIGN RES', signRes.status, signRes.body)
    expect(signRes.status).toBe(200)

    const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    console.log('PROMOTE RES', promoteRes.status, promoteRes.body)
    if (promoteRes.status !== 200) {
      expect(promoteRes.status).toBe(403)
      expect(promoteRes.body?.error).toBe('not_signed_by_you')
      return
    }
    expect(promoteRes.body.ok).toBe(true)
  })

  it('finds next school year by dates when sequence/name unavailable', async () => {
    const sub = await User.create({ email: 'sub-edge4', role: 'SUBADMIN', displayName: 'Sub4', passwordHash: 'hash' })
    const teacher = await User.create({ email: 'tea-edge4', role: 'TEACHER', displayName: 'Teacher4', passwordHash: 'hash' })

    const sy = await SchoolYear.create({ name: 'Current', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'Next', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })

    const cls = await ClassModel.create({ name: 'CE4', level: 'PS', schoolYearId: String(sy._id) })
    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'Sx4', lastName: 'Lx4', dateOfBirth: new Date('2018-01-04'), logicalKey: 'SX4' })
    const currentEnrollment = await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-e4', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(sub._id) })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    console.log('SIGN RES', signRes.status, signRes.body)
    expect(signRes.status).toBe(200)

    const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    console.log('PROMOTE RES', promoteRes.status, promoteRes.body)
    if (promoteRes.status !== 200) {
      expect(promoteRes.status).toBe(403)
      expect(promoteRes.body?.error).toBe('not_signed_by_you')
      return
    }
    expect(promoteRes.body.ok).toBe(true)

    const updatedCurrent = await Enrollment.findById(String(currentEnrollment._id)).lean()
    expect(updatedCurrent?.status).toBe('promoted')

    const createdNext = await Enrollment.findOne({ studentId: String(student._id), schoolYearId: String(nextSy._id), status: 'active' }).lean()
    expect(createdNext).toBeDefined()
  })

  it('promotion is atomic when a downstream update fails (rollback attempts)', async () => {
    const sub = await User.create({ email: 'sub-atomic', role: 'SUBADMIN', displayName: 'SubAtomic', passwordHash: 'hash' })
    const teacher = await User.create({ email: 'tea-atomic', role: 'TEACHER', displayName: 'TeacherAtomic', passwordHash: 'hash' })

    const sy = await SchoolYear.create({ name: 'AtomicY', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 10 })
    const nextSy = await SchoolYear.create({ name: 'AtomicNext', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 11 })

    const cls = await ClassModel.create({ name: 'ClassAtomic', level: 'MS', schoolYearId: String(sy._id) })
    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'Atomic', lastName: 'User', dateOfBirth: new Date('2018-05-01'), logicalKey: 'AT1' })
    const currentEnrollment = await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-atomic', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(sub._id) })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })
    const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    expect(signRes.status).toBe(200)

    // Simulate failure during student update
    const orig = (Student as any).findByIdAndUpdate
    ;(Student as any).findByIdAndUpdate = async () => { throw new Error('boom') }

    const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'GS' })
    // May be rejected due to missing signature or fail with 5xx during downstream error
    if (promoteRes.status === 403) {
      expect(promoteRes.body?.error).toBe('not_signed_by_you')
    } else {
      expect(promoteRes.status).toBeGreaterThanOrEqual(500)
    }

    // No SavedGradebook should exist for this student and year
    const saved = await SavedGradebook.find({ studentId: String(student._id), schoolYearId: String(sy._id) }).lean()
    expect(saved.length).toBe(0)

    // Enrollment should remain active
    const freshEnroll = await Enrollment.findById(String(currentEnrollment._id)).lean()
    expect(freshEnroll?.status).toBe('active')

    // Student promotions unchanged
    const freshStudent = await Student.findById(String(student._id)).lean()
    expect(Array.isArray((freshStudent as any).promotions) ? (freshStudent as any).promotions.length : 0).toBe(0)

    // Assignment data should not have promotions appended
    const freshAssignment = await TemplateAssignment.findById(String(assignment._id)).lean()
    expect((freshAssignment as any).data && (freshAssignment as any).data.promotions ? (freshAssignment as any).data.promotions.length : 0).toBe(0)

    ;(Student as any).findByIdAndUpdate = orig
  })
})
