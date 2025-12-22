import { createApp } from '../src/app'
import { connectDb } from '../src/db'
import { User } from '../src/models/User'
import { SchoolYear } from '../src/models/SchoolYear'
import { ClassModel } from '../src/models/Class'
import { TeacherClassAssignment } from '../src/models/TeacherClassAssignment'
import { SubAdminAssignment } from '../src/models/SubAdminAssignment'
import { Student } from '../src/models/Student'
import { Enrollment } from '../src/models/Enrollment'
import { GradebookTemplate } from '../src/models/GradebookTemplate'
import { TemplateAssignment } from '../src/models/TemplateAssignment'
import { TemplateSignature } from '../src/models/TemplateSignature'
import { signToken } from '../src/auth'
import request from 'supertest'

async function main() {
  const app = createApp()
  await connectDb()

  // Clean up test artifacts (use a specific email marker)
  await Promise.all([
    User.deleteMany({ email: /smoke-promote/ }),
    SchoolYear.deleteMany({ name: /SMOKE/ }),
    ClassModel.deleteMany({ name: /SMOKE/ }),
    Student.deleteMany({ firstName: /SMOKE/ }),
    GradebookTemplate.deleteMany({ name: /smoke/ }),
    TemplateAssignment.deleteMany({ 'data.smoke': true })
  ])

  const sub = await User.create({ email: 'smoke-promote-sub@local', role: 'SUBADMIN', displayName: 'SubSmoke', passwordHash: 'hash' })
  const teacher = await User.create({ email: 'smoke-promote-tea@local', role: 'TEACHER', displayName: 'TeaSmoke', passwordHash: 'hash' })

  const sy = await SchoolYear.create({ name: 'SMOKE-2024', active: true, startDate: new Date('2024-09-01'), endDate: new Date('2025-07-01'), sequence: 1 })
  const nextSy = await SchoolYear.create({ name: 'SMOKE-2025', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-01'), sequence: 2 })

  const cls = await ClassModel.create({ name: 'SMOKE-CLASS', level: 'PS', schoolYearId: String(sy._id) })
  await TeacherClassAssignment.create({ teacherId: String(teacher._id), classId: String(cls._id), schoolYearId: String(sy._id), assignedBy: String(sub._id) })
  await SubAdminAssignment.create({ subAdminId: String(sub._id), teacherId: String(teacher._id), assignedBy: String(sub._id) })

  const student = await Student.create({ firstName: 'SMOKE', lastName: 'PROMOTE', dateOfBirth: new Date('2018-02-05'), logicalKey: 'SMOKE1' })
  await Enrollment.create({ studentId: String(student._id), classId: String(cls._id), schoolYearId: String(sy._id), status: 'active' })

  const tpl = await GradebookTemplate.create({ name: 'tpl-smoke', pages: [], currentVersion: 1 })

  const assignment = await TemplateAssignment.create({ templateId: String(tpl._id), studentId: String(student._id), status: 'completed', isCompleted: true, isCompletedSem2: true, assignedBy: String(teacher._id), data: { smoke: true } })

  const subToken = signToken({ userId: String(sub._id), role: 'SUBADMIN' })

  // Sign
  const signRes = await request(app)
    .post(`/subadmin/templates/${assignment._id}/sign`)
    .set('Authorization', `Bearer ${subToken}`)
    .send({ type: 'end_of_year' })

  console.log('Sign status', signRes.status, signRes.body)
  if (signRes.status !== 200) throw new Error('Sign failed')

  // Promote
  const promoteRes = await request(app)
    .post(`/subadmin/templates/${assignment._id}/promote`)
    .set('Authorization', `Bearer ${subToken}`)
    .send({ nextLevel: 'MS' })

  console.log('Promote status', promoteRes.status, promoteRes.body)
  if (promoteRes.status !== 200) throw new Error('Promote failed')

  // Verify next-year assignment exists
  const created = await TemplateAssignment.findOne({ studentId: String(student._id), completionSchoolYearId: String(nextSy._id) }).lean()
  console.log('Next-year assignment created?', !!created)
  if (!created) throw new Error('Next-year assignment not created')

  // Verify promotions array on student
  const updatedStudent = await Student.findById(String(student._id)).lean()
  console.log('Student promotions:', (updatedStudent as any).promotions)
  if (!Array.isArray((updatedStudent as any).promotions) || (updatedStudent as any).promotions.length === 0) throw new Error('Student promotions missing')

  console.log('Smoke promotion flow successful')
  process.exit(0)
}

main().catch(err => { console.error('Smoke test failed:', err); process.exit(1) })
