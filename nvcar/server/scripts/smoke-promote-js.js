#!/usr/bin/env node
const mongoose = require('mongoose')
const argv = require('minimist')(process.argv.slice(2))

const MONGO_URI = argv['mongo-uri'] || process.env.MONGO_URI || 'mongodb://localhost:27017/nvcarn'

async function main() {
  await mongoose.connect(MONGO_URI)
  // Load compiled models when available, fall back to src
  const getModel = (p, name) => {
    try { return require(`../dist/models/${p}`)[name] } catch (e) { return require(`../src/models/${p}`)[name] }
  }

  const User = getModel('User', 'User')
  const SchoolYear = getModel('SchoolYear','SchoolYear')
  const ClassModel = getModel('Class','ClassModel')
  const TeacherClassAssignment = getModel('TeacherClassAssignment','TeacherClassAssignment')
  const SubAdminAssignment = getModel('SubAdminAssignment','SubAdminAssignment')
  const Student = getModel('Student','Student')
  const Enrollment = getModel('Enrollment','Enrollment')
  const GradebookTemplate = getModel('GradebookTemplate','GradebookTemplate')
  const TemplateAssignment = getModel('TemplateAssignment','TemplateAssignment')
  const TemplateSignature = getModel('TemplateSignature','TemplateSignature')
  const SavedGradebook = getModel('SavedGradebook','SavedGradebook')

  // Cleanup
  await Promise.all([
    User.deleteMany({ email: /smoke-promote/ }),
    SchoolYear.deleteMany({ name: /SMOKE/ }),
    ClassModel.deleteMany({ name: /SMOKE/ }),
    Student.deleteMany({ firstName: /SMOKE/ }),
    GradebookTemplate.deleteMany({ name: /tpl-smoke/ }),
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

  // Create signature
  await TemplateSignature.create({ templateAssignmentId: String(assignment._id), subAdminId: String(sub._id), type: 'end_of_year', timestamp: new Date() })

  // Perform promotion steps (non-transactional flow)
  console.log('Starting smoke promotion flow...')

  // Create SavedGradebook (snapshot)
  const statuses = [] // empty for smoke
  const signatures = await TemplateSignature.find({ templateAssignmentId: String(assignment._id) }).lean()
  const snapshotData = { student: student.toObject ? student.toObject() : student, enrollment: { classId: cls._id, schoolYearId: sy._id }, statuses, assignment, className: cls.name, signatures }
  await SavedGradebook.create({ studentId: student._id, schoolYearId: String(sy._id), level: 'PS', classId: cls._id, templateId: assignment.templateId, data: snapshotData })

  // Update enrollment status
  await Enrollment.updateOne({ studentId: student._id, schoolYearId: String(sy._id) }, { $set: { status: 'promoted' } })

  // Create next enrollment if missing
  const existingNextEnrollment = await Enrollment.findOne({ studentId: String(student._id), schoolYearId: String(nextSy._id) }).lean()
  if (!existingNextEnrollment) {
    await Enrollment.create({ studentId: student._id, schoolYearId: String(nextSy._id), status: 'active' })
  }

  // Upsert next-year TemplateAssignment with safe pattern
  const nextFilter = { templateId: assignment.templateId, studentId: student._id, completionSchoolYearId: String(nextSy._id) }
  const setOnInsert = { templateId: assignment.templateId, templateVersion: tpl.currentVersion || 1, studentId: student._id, completionSchoolYearId: String(nextSy._id), assignedTeachers: [], assignedBy: String(sub._id), assignedAt: new Date(), status: 'draft', data: {} }
  try {
    await TemplateAssignment.findOneAndUpdate(nextFilter, { $setOnInsert: setOnInsert }, { upsert: true, new: true })
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase()
    if (e.code === 11000 || msg.includes('e11000') || msg.includes('duplicate key')) {
      console.warn('E11000 during upsert, attempting re-query and relaxed lookup')
      // Try exact filter first
      let found = await TemplateAssignment.findOne(nextFilter).lean()
      if (found) {
        console.log('Found by exact filter after E11000')
      } else {
        // Try relaxed lookup by templateId + studentId (legacy index case)
        found = await TemplateAssignment.findOne({ templateId: assignment.templateId, studentId: student._id }).lean()
        if (found) {
          console.log('Found by relaxed lookup (templateId+studentId)')
          // If legacy doc lacks completionSchoolYearId, patch it
          if (!found.completionSchoolYearId) {
            const mergedData = Object.assign({}, found.data || {}, setOnInsert.data || {})
            await TemplateAssignment.updateOne({ _id: found._id }, { $set: { completionSchoolYearId: String(nextSy._id), data: mergedData } })
            console.log('Patched legacy document with completionSchoolYearId')
          }
        } else {
          console.error('Upsert failed; not found by relaxed lookup either')
        }
      }
    } else throw e
  }

  // Add promotion record to student
  const promotionRecord = { schoolYearId: String(sy._id), date: new Date(), fromLevel: 'PS', toLevel: 'MS', promotedBy: String(sub._id) }
  const stuRes = await Student.updateOne({ _id: student._id, $or: [{ promotions: { $exists: false } }, { 'promotions.schoolYearId': { $ne: String(sy._id) } }] }, { $push: { promotions: promotionRecord }, $set: { nextLevel: 'MS' } })

  // Update assignment data promotions array
  await TemplateAssignment.updateOne({ _id: assignment._id }, { $push: { 'data.promotions': { from: 'PS', to: 'MS', date: new Date(), year: sy.name, class: cls.name, by: sub._id } } })

  // Validate
  const created = await TemplateAssignment.findOne({ studentId: String(student._id), completionSchoolYearId: String(nextSy._id) }).lean()
  console.log('Next-year assignment exists:', !!created)
  const updatedStudent = await Student.findById(student._id).lean()
  console.log('Student promotions:', updatedStudent.promotions)

  await mongoose.disconnect()
  console.log('Smoke promotion JS flow completed')
}

main().catch(err => { console.error('Smoke JS error:', err); process.exit(1) })
