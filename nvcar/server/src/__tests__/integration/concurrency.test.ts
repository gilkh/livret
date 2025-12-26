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
import { TemplateChangeLog } from '../../models/TemplateChangeLog'
import { TemplateSignature } from '../../models/TemplateSignature'

let app: any

describe('concurrent edits and signature flows', () => {
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

  it('detects conflict when two teachers simultaneously update the same language toggle with same expectedDataVersion', async () => {
    const sy = await SchoolYear.create({ name: 'S2', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const cls = await ClassModel.create({ name: 'Class T', level: 'MS', schoolYearId: String(sy._id) })

    const t1 = await User.create({ email: 't1', role: 'TEACHER', displayName: 'Teacher 1', passwordHash: 'hash' })
    const t2 = await User.create({ email: 't2', role: 'TEACHER', displayName: 'Teacher 2', passwordHash: 'hash' })

    await Enrollment.create({ studentId: 'S1', classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })

    const student = await Student.create({ firstName: 'TT', lastName: 'LN', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S-TT-1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })

    const tpl = await GradebookTemplate.create({ name: 'tplT', pages: [{ blocks: [{ type: 'language_toggle', props: { items: [{ code: 'fr', active: true }, { code: 'en', active: false }] } }] }], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), assignedTeachers: [String(t1._id), String(t2._id)], status: 'draft', data: {}, assignedBy: String(t1._id) })

    // Ensure teachers are assigned to the class for permission checks
    const { TeacherClassAssignment } = require('../../models/TeacherClassAssignment')
    await TeacherClassAssignment.create({ teacherId: String(t1._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(t1._id) })
    await TeacherClassAssignment.create({ teacherId: String(t2._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(t2._id) })

    // Teacher 1 applies an update with expectedDataVersion = 1
    const t1Token = signToken({ userId: String(t1._id), role: 'TEACHER' })
    const t2Token = signToken({ userId: String(t2._id), role: 'TEACHER' })

    const payload1 = { pageIndex: 0, blockIndex: 0, items: [{ code: 'fr', active: false }, { code: 'en', active: true }], expectedDataVersion: 1 }
    const payload2 = { pageIndex: 0, blockIndex: 0, items: [{ code: 'fr', active: false }, { code: 'en', active: false }], expectedDataVersion: 1 }

    // Apply first update
    const res1 = await request(app).patch(`/teacher/template-assignments/${assignment._id}/language-toggle`).set('Authorization', `Bearer ${t1Token}`).send(payload1)
    expect(res1.status).toBe(200)

    // Second update tries to use the stale dataVersion and should conflict
    const res2 = await request(app).patch(`/teacher/template-assignments/${assignment._id}/language-toggle`).set('Authorization', `Bearer ${t2Token}`).send(payload2)
    expect(res2.status).toBe(409)

    // After conflict, dataVersion should be incremented (to >=2)
    const fresh = await TemplateAssignment.findById(String(assignment._id)).lean()
    expect((fresh as any).dataVersion).toBeGreaterThanOrEqual(2)

    // Change log should contain at least one entry for the successful change with dataVersion recorded
    const changes = await TemplateChangeLog.find({ templateAssignmentId: String(assignment._id) }).lean()
    expect(changes.length).toBeGreaterThanOrEqual(1)
    expect(changes.some((c:any)=>typeof c.dataVersion === 'number')).toBe(true)
  })

  it('signing while another edit with stale version conflicts (sign wins, edit fails)', async () => {
    const sy = await SchoolYear.create({ name: 'S2', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const cls = await ClassModel.create({ name: 'Class T2', level: 'MS', schoolYearId: String(sy._id) })

    const admin = await User.create({ email: 'a1', role: 'ADMIN', displayName: 'Admin', passwordHash: 'hash' })
    const teacher = await User.create({ email: 't3', role: 'TEACHER', displayName: 'Teacher 3', passwordHash: 'hash' })

    const student = await Student.create({ firstName: 'SS', lastName: 'LN', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S-SS-1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })

    const tpl = await GradebookTemplate.create({ name: 'tplS', pages: [{ blocks: [{ type: 'language_toggle', props: { items: [{ code: 'fr', active: true }] } }] }], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), assignedTeachers: [String(teacher._id)], status: 'completed', isCompleted: true, data: {}, assignedBy: String(teacher._id) })

    const adminToken = signToken({ userId: String(admin._id), role: 'ADMIN' })
    const teacherToken = signToken({ userId: String(teacher._id), role: 'TEACHER' })

    // Ensure teacher is assigned to class for permission
    const { TeacherClassAssignment } = require('../../models/TeacherClassAssignment')
    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(admin._id) })

    // Admin will sign (this increments dataVersion unconditionally)
    const signRes = await request(app).post(`/admin-extras/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${adminToken}`).send({ type: 'standard' })
    expect(signRes.status).toBe(200)

    // Teacher attempts to apply an edit with stale expectedDataVersion = 1 and should conflict
    const editRes = await request(app).patch(`/teacher/template-assignments/${assignment._id}/language-toggle`).set('Authorization', `Bearer ${teacherToken}`).send({ pageIndex: 0, blockIndex: 0, items: [{ code: 'fr', active: false }], expectedDataVersion: 1 })
    expect(editRes.status).toBe(409)

    // Ensure signature exists
    const sigCount = await TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id) })
    expect(sigCount).toBeGreaterThanOrEqual(1)

    // assignment dataVersion should be > 1
    const fresh = await TemplateAssignment.findById(String(assignment._id)).lean()
    expect((fresh as any).dataVersion).toBeGreaterThan(1)
  })

  it('signing is atomic when assignment update fails (no partial persist)', async () => {
    const sy = await SchoolYear.create({ name: 'S-atomic', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const cls = await ClassModel.create({ name: 'Class A', level: 'MS', schoolYearId: String(sy._id) })

    const admin = await User.create({ email: 'a-atomic', role: 'ADMIN', displayName: 'Admin', passwordHash: 'hash' })
    const teacher = await User.create({ email: 't-atomic', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' })

    const student = await Student.create({ firstName: 'AS', lastName: 'LN', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S-AS-1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })

    const tpl = await GradebookTemplate.create({ name: 'tpl-atomic', pages: [{ blocks: [{ type: 'language_toggle', props: { items: [{ code: 'fr', active: true }] } }] }], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), assignedTeachers: [String(teacher._id)], status: 'completed', isCompleted: true, isCompletedSem1: true, data: {}, assignedBy: String(teacher._id) })

    const adminToken = signToken({ userId: String(admin._id), role: 'ADMIN' })

    // Simulate failure during assignment update
    const orig1 = (TemplateAssignment as any).findByIdAndUpdate
    ;(TemplateAssignment as any).findByIdAndUpdate = async () => { throw new Error('boom') }

    const res = await request(app).post(`/admin-extras/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${adminToken}`).send({ type: 'standard' })
    expect(res.status).toBeGreaterThanOrEqual(500)

    // No TemplateSignature should be persisted
    const sigCount = await TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id) })
    expect(sigCount).toBe(0)

    const fresh = await TemplateAssignment.findById(String(assignment._id)).lean()
    expect((fresh as any).data && (fresh as any).data.signatures ? (fresh as any).data.signatures.length : 0).toBe(0)
    expect((fresh as any).dataVersion).toBe(1)

    ;(TemplateAssignment as any).findByIdAndUpdate = orig1
  })

  it('unsigning is atomic when assignment update fails (signatures preserved)', async () => {
    const sy = await SchoolYear.create({ name: 'S-atomic-2', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01') })
    const cls = await ClassModel.create({ name: 'Class B', level: 'MS', schoolYearId: String(sy._id) })

    const admin = await User.create({ email: 'a-atomic-2', role: 'ADMIN', displayName: 'Admin', passwordHash: 'hash' })
    const teacher = await User.create({ email: 't-atomic-2', role: 'TEACHER', displayName: 'Teacher', passwordHash: 'hash' })

    const student = await Student.create({ firstName: 'BS', lastName: 'LN', dateOfBirth: new Date('2018-01-01'), logicalKey: 'S-BS-1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })

    const tpl = await GradebookTemplate.create({ name: 'tpl-atomic-2', pages: [{ blocks: [{ type: 'language_toggle', props: { items: [{ code: 'fr', active: true }] } }] }], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), assignedTeachers: [String(teacher._id)], status: 'completed', isCompleted: true, isCompletedSem1: true, data: {}, assignedBy: String(teacher._id) })

    const adminToken = signToken({ userId: String(admin._id), role: 'ADMIN' })

    // Sign successfully first
    const good = await request(app).post(`/admin-extras/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${adminToken}`).send({ type: 'standard' })
    expect(good.status).toBe(200)

    const preCount = await TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id) })
    expect(preCount).toBeGreaterThanOrEqual(1)

    // Simulate failure during assignment update when unsigning
    const orig2 = (TemplateAssignment as any).findByIdAndUpdate
    ;(TemplateAssignment as any).findByIdAndUpdate = async () => { throw new Error('boom') }

    const bad = await request(app).delete(`/admin-extras/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${adminToken}`).send({ type: 'standard' })
    expect(bad.status).toBeGreaterThanOrEqual(500)

    const postCount = await TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id) })
    expect(postCount).toBeGreaterThanOrEqual(1)

    // Ensure TemplateSignature collection still contains the signature (single source of truth)
    const fresh2 = await TemplateAssignment.findById(String(assignment._id)).lean()
    const sigCount = await TemplateSignature.countDocuments({ templateAssignmentId: String(assignment._id) })
    expect(sigCount).toBeGreaterThanOrEqual(1)

    ;(TemplateAssignment as any).findByIdAndUpdate = orig2
  })
})