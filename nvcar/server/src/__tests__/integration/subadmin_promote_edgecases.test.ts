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

let app: any;

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
    expect(first.status).toBe(200)

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
    expect(promoteRes.status).toBe(200)
    expect(promoteRes.body.ok).toBe(true)
  })

  it('creates next-year TemplateAssignment when promoting and copies allowed long-term data only', async () => {
    const sub = await User.create({ email: 'sub-roll', role: 'SUBADMIN', displayName: 'SubRoll', passwordHash: 'hash' })
    const teacher = await User.create({ email: 'tea-roll', role: 'TEACHER', displayName: 'TeacherRoll', passwordHash: 'hash' })
    const sy = await SchoolYear.create({ name: 'YR-A', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'YR-B', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })
    const cls = await ClassModel.create({ name: 'CE-R', level: 'PS', schoolYearId: String(sy._id) })
    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'SR', lastName: 'LR', dateOfBirth: new Date('2018-02-02'), logicalKey: 'SR1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-roll', pages: [], currentVersion: 1 })

    const assignment = await TemplateAssignment.create({
      templateId: String(tpl._id),
      studentId: String(student._id),
      status: 'completed',
      isCompleted: true,
      isCompletedSem2: true,
      assignedBy: String(teacher._id),
      data: {
        longTermNotes: 'keep me',
        comments: 'keep this',
        signatures: [{ type: 'end_of_year', subAdminId: String(sub._id) }],
        promotions: [{ by: 'someone' }],
        transient: 'drop me'
      }
    })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    expect(signRes.status).toBe(200)

    const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    expect(promoteRes.status).toBe(200)

    const created = await TemplateAssignment.findOne({ studentId: String(student._id), completionSchoolYearId: String(nextSy._id) }).lean()
    expect(created).toBeDefined()
    expect(created?.data?.longTermNotes).toBe('keep me')
    expect(created?.data?.comments).toBe('keep this')
    expect(created?.data?.signatures).toBeUndefined()
    expect(created?.data?.promotions).toBeUndefined()
    expect(created?.data?.transient).toBeUndefined()
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
    expect(promoteRes.status).toBe(200)
    expect(promoteRes.body.ok).toBe(true)

    const updatedCurrent = await Enrollment.findById(String(currentEnrollment._id)).lean()
    expect(updatedCurrent?.status).toBe('promoted')

    const createdNext = await Enrollment.findOne({ studentId: String(student._id), schoolYearId: String(nextSy._id), status: 'active' }).lean()
    expect(createdNext).toBeDefined()
  })

  it('logs inferred keys on promotion', async () => {
    const sub = await User.create({ email: 'sub-infer', role: 'SUBADMIN', displayName: 'SubInfer', passwordHash: 'hash' })
    const teacher = await User.create({ email: 'tea-infer', role: 'TEACHER', displayName: 'TeacherInfer', passwordHash: 'hash' })

    const sy = await SchoolYear.create({ name: 'YI', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'YI+1', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })

    const cls = await ClassModel.create({ name: 'CEI', level: 'PS', schoolYearId: String(sy._id) })
    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'SI', lastName: 'LI', dateOfBirth: new Date('2018-03-03'), logicalKey: 'SI1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-infer', pages: [], currentVersion: 1 })

    // Create historical assignments that should cause keys 'keepA' and 'keepB' to be inferred
    await TemplateAssignment.create({ studentId: String(student._id), assignedAt: new Date('2022-01-01'), data: { keepA: '1', keepB: 'x' } })
    await TemplateAssignment.create({ studentId: String(student._id), assignedAt: new Date('2023-01-01'), data: { keepA: '2', keepB: 'y' } })

    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(teacher._id), data: { keepA: '3', keepB: 'z', transient: 'no' } })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    expect(signRes.status).toBe(200)

    const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    expect(promoteRes.status).toBe(200)

    // Verify next-year assignment contains inferred keys
    const created = await TemplateAssignment.findOne({ studentId: String(student._id), completionSchoolYearId: String(nextSy._id) }).lean()
    expect(created).toBeDefined()
    expect(created?.data?.keepA).toBeDefined()
    expect(created?.data?.keepB).toBeDefined()
    expect(created?.data?.transient).toBeUndefined()

    // Verify audit log contains inferredKeys in details
    const { AuditLog } = require('../../models/AuditLog')
    const log = await AuditLog.findOne({ 'details.studentId': student._id }).sort({ timestamp: -1 }).lean()
    expect(log).toBeDefined()
    expect(Array.isArray(log.details?.inferredKeys)).toBe(true)
    expect(log.details.inferredKeys).toEqual(expect.arrayContaining(['keepA','keepB']))
  })

  it('tolerates E11000 on upsert by re-querying existing next-year assignment', async () => {
    const sub = await User.create({ email: 'sub-e11000', role: 'SUBADMIN', displayName: 'SubE', passwordHash: 'hash' })
    const teacher = await User.create({ email: 'tea-e11000', role: 'TEACHER', displayName: 'TeacherE', passwordHash: 'hash' })
    const sy = await SchoolYear.create({ name: 'YE', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'YE+1', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })
    const cls = await ClassModel.create({ name: 'CE-E', level: 'PS', schoolYearId: String(sy._id) })
    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'SE', lastName: 'LE', dateOfBirth: new Date('2018-02-05'), logicalKey: 'SE1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-e11000', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(teacher._id) })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    expect(signRes.status).toBe(200)

    // Pre-create the next-year assignment to simulate a concurrent insert from another process
    await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), completionSchoolYearId: String(nextSy._id), assignedBy: 'other', status: 'draft', data: { pre: true } })

    // Spy on findOneAndUpdate to throw E11000 once to simulate a race
    const orig = TemplateAssignment.findOneAndUpdate
    jest.spyOn(TemplateAssignment, 'findOneAndUpdate').mockImplementationOnce(() => {
      const err: any = new Error('E11000 duplicate key error')
      err.code = 11000
      throw err
    })

    const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    expect(promoteRes.status).toBe(200)

    const created = await TemplateAssignment.find({ studentId: String(student._id), completionSchoolYearId: String(nextSy._id) }).lean()
    expect(created.length).toBe(1)

    // Restore original
    ;(TemplateAssignment.findOneAndUpdate as any) = orig
  })

  it('handles legacy unique index on (templateId, studentId) by returning the existing assignment', async () => {
    const sub = await User.create({ email: 'sub-legacy', role: 'SUBADMIN', displayName: 'SubLegacy', passwordHash: 'hash' })
    const teacher = await User.create({ email: 'tea-legacy', role: 'TEACHER', displayName: 'TeacherLegacy', passwordHash: 'hash' })
    const sy = await SchoolYear.create({ name: 'YL', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'YL+1', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })
    const cls = await ClassModel.create({ name: 'CE-L', level: 'PS', schoolYearId: String(sy._id) })
    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'SL', lastName: 'LL', dateOfBirth: new Date('2018-02-06'), logicalKey: 'SL1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-legacy', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(teacher._id) })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    expect(signRes.status).toBe(200)

    // Pre-create a legacy assignment that lacks completionSchoolYearId (simulating legacy index)
    await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), assignedBy: 'legacy', status: 'draft', data: { legacy: true } })

    // Spy on findOneAndUpdate to throw E11000 with index name to simulate legacy unique index conflict
    const orig = TemplateAssignment.findOneAndUpdate
    jest.spyOn(TemplateAssignment, 'findOneAndUpdate').mockImplementationOnce(() => {
      const err: any = new Error('E11000 duplicate key error collection: nvcarn.templateassignments index: templateId_1_studentId_1 dup key')
      err.code = 11000
      throw err
    })

    const promoteRes = await request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    expect(promoteRes.status).toBe(200)

    // Ensure only one assignment exists for this template+student (legacy doc found and used)
    const created = await TemplateAssignment.find({ templateId: String(tpl._id), studentId: String(student._id) }).lean()
    expect(created.length).toBe(1)

    // The legacy document should have been patched to include completionSchoolYearId
    const patched = created[0]
    expect(patched.completionSchoolYearId).toBe(String(nextSy._id))
    expect(patched.data?.legacy).toBe(true)

    // Restore original
    ;(TemplateAssignment.findOneAndUpdate as any) = orig
  })

  it('prevents duplicate next-year assignments when promotions are concurrent', async () => {
    const sub = await User.create({ email: 'sub-conc', role: 'SUBADMIN', displayName: 'SubConc', passwordHash: 'hash' })
    const teacher = await User.create({ email: 'tea-conc', role: 'TEACHER', displayName: 'TeacherConc', passwordHash: 'hash' })
    const sy = await SchoolYear.create({ name: 'YC', active: true, activeSemester: 2, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'YC+1', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })
    const cls = await ClassModel.create({ name: 'CE-C', level: 'PS', schoolYearId: String(sy._id) })
    await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'SC', lastName: 'LC', dateOfBirth: new Date('2018-02-05'), logicalKey: 'SC1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-conc', pages: [], currentVersion: 1 })
    const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(teacher._id) })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

    const signRes = await request(app).post(`/subadmin/templates/${assignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    expect(signRes.status).toBe(200)

    // Fire two promotions concurrently
    const [r1, r2] = await Promise.all([
      request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' }),
      request(app).post(`/subadmin/templates/${assignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    ])

    // At least one should succeed and the other should indicate already_promoted
    const statuses = [r1.status, r2.status]
    expect(statuses.includes(200)).toBe(true)
    expect(statuses.includes(400)).toBe(true)

    const created = await TemplateAssignment.find({ studentId: String(student._id), completionSchoolYearId: String(nextSy._id) }).lean()
    expect(created.length).toBe(1)

    const updatedStudent = await Student.findById(String(student._id)).lean()
    const promos = (updatedStudent as any).promotions?.filter((p: any) => p.schoolYearId === String(sy._id)) || []
    expect(promos.length).toBe(1)
  })

  it('copies previous assignedTeachers to next-year when class has no teachers (if_missing)', async () => {
    const sub = await User.create({ email: 'sub-copy', role: 'SUBADMIN', displayName: 'SubCopy', passwordHash: 'hash' })
    const teacherPrev = await User.create({ email: 'tea-prev', role: 'TEACHER', displayName: 'TeacherPrev', passwordHash: 'hash' })
    const sy = await SchoolYear.create({ name: 'YCopy', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'YCopy+1', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })
    const cls = await ClassModel.create({ name: 'CE-COPY', level: 'PS', schoolYearId: String(sy._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacherPrev._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'SCOPY', lastName: 'LCOPY', dateOfBirth: new Date('2018-02-05'), logicalKey: 'SCOPY1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-copy', pages: [], currentVersion: 1 })

    // Previous assignment had assignedTeachers
    const prevAssignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(teacherPrev._id), assignedTeachers: [String(teacherPrev._id)] })

    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })
    await request(app).post(`/subadmin/templates/${prevAssignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    const promoteRes = await request(app).post(`/subadmin/templates/${prevAssignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    expect(promoteRes.status).toBe(200)

    const created = await TemplateAssignment.findOne({ studentId: String(student._id), completionSchoolYearId: String(nextSy._id) }).lean()
    expect(created).toBeDefined()
    // Class has no teacher assigned for next year, so policy if_missing should copy previous assigned teacher
    expect(created?.assignedTeachers).toEqual(expect.arrayContaining([String(teacherPrev._id)]))
  })

  it('sync listener assigns class teachers to existing next-year assignments when created later', async () => {
    const sub = await User.create({ email: 'sub-sync', role: 'SUBADMIN', displayName: 'SubSync', passwordHash: 'hash' })
    const teacherNew = await User.create({ email: 'tea-new', role: 'TEACHER', displayName: 'TeacherNew', passwordHash: 'hash' })
    const sy = await SchoolYear.create({ name: 'YSYNC', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
    const nextSy = await SchoolYear.create({ name: 'YSYNC+1', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })
    const cls = await ClassModel.create({ name: 'CE-SYNC', level: 'PS', schoolYearId: String(sy._id) })
    await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacherNew._id), assignedBy: String(sub._id) })

    const student = await Student.create({ firstName: 'SSYNC', lastName: 'LSYNC', dateOfBirth: new Date('2018-02-05'), logicalKey: 'SSYNC1' })
    await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })
    const tpl = await GradebookTemplate.create({ name: 'tpl-sync', pages: [], currentVersion: 1 })

    // Promote to next year; because next class has no teachers yet, next-year assignment will have none
    const prevAssignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, assignedBy: String(teacherNew._id) })
    const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })
    await request(app).post(`/subadmin/templates/${prevAssignment._id}/sign`).set('Authorization', `Bearer ${subToken}`).send({ type: 'end_of_year' })
    const promoteRes = await request(app).post(`/subadmin/templates/${prevAssignment._id}/promote`).set('Authorization', `Bearer ${subToken}`).send({ nextLevel: 'MS' })
    expect(promoteRes.status).toBe(200)

    // At this point, next-year assignment exists but has no assignedTeachers
    let created = await TemplateAssignment.findOne({ studentId: String(student._id), completionSchoolYearId: String(nextSy._id) }).lean()
    expect(created).toBeDefined()
    expect(created?.assignedTeachers || []).toHaveLength(0)

    // Now add a TeacherClassAssignment for the class in the next school year - the post-save hook should update assignments
    await TeacherClassAssignment.create({ teacherId: String(teacherNew._id), classId: String(cls._id), schoolYearId: String(nextSy._id), assignedBy: String(sub._id) })

    created = await TemplateAssignment.findOne({ studentId: String(student._id), completionSchoolYearId: String(nextSy._id) }).lean()
    expect(created?.assignedTeachers).toEqual(expect.arrayContaining([String(teacherNew._id)]))
  })
})
