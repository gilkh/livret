import { Router } from 'express'
import { requireAuth } from '../auth'
import { SchoolYear } from '../models/SchoolYear'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { SavedGradebook } from '../models/SavedGradebook'
import { Enrollment } from '../models/Enrollment'
import { ClassModel } from '../models/Class'

import { Student } from '../models/Student'
import { StudentCompetencyStatus } from '../models/StudentCompetencyStatus'

import { withCache, clearCache } from '../utils/cache'

export const schoolYearsRouter = Router()

schoolYearsRouter.get('/', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
  const list = await withCache('school-years-all', () =>
    SchoolYear.find({}).sort({ startDate: -1 }).lean()
  )
  res.json(list)
})

schoolYearsRouter.post('/', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { name, startDate, endDate, active } = req.body
  if (!name || !startDate || !endDate) return res.status(400).json({ error: 'missing_payload' })

  if (active) {
    await SchoolYear.updateMany({}, { $set: { active: false } })
  }

  clearCache('school-years')
  const created = await SchoolYear.create({
    name,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    active: active ?? true,
  })

  const allYears = await SchoolYear.find({}).sort({ startDate: 1 }).lean()
  if (allYears.length > 0) {
    await SchoolYear.bulkWrite(
      allYears.map((y, index) => ({
        updateOne: {
          filter: { _id: y._id },
          update: { $set: { sequence: index + 1 } },
        },
      }))
    )
  }

  const year = await SchoolYear.findById(created._id).lean()
  res.json(year || created)
})

schoolYearsRouter.patch('/:id', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const data: any = { ...req.body }
  if (data.startDate) data.startDate = new Date(data.startDate)
  if (data.endDate) data.endDate = new Date(data.endDate)

  if (data.active) {
    await SchoolYear.updateMany({ _id: { $ne: id } }, { $set: { active: false } })
  }

  clearCache('school-years')
  const year = await SchoolYear.findByIdAndUpdate(id, data, { new: true })

  res.json(year)
})

schoolYearsRouter.delete('/:id', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  clearCache('school-years')
  await SchoolYear.findByIdAndDelete(id)
  res.json({ ok: true })
})

schoolYearsRouter.post('/:id/archive', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params

  const year = await SchoolYear.findById(id)
  if (!year) return res.status(404).json({ error: 'not_found' })

  // 1. Deactivate year
  year.active = false
  await year.save()

  // 2. Find all enrollments for this year
  const enrollments = await Enrollment.find({ schoolYearId: id }).lean()
  const studentIds = enrollments.map(e => e.studentId)

  // 3. Find all assignments for these students (filtered by date or just take all for now?)
  // Ideally we should link assignments to school years, but currently they are linked to students.
  // We can filter by assignedAt date range of the school year.
  const assignments = await TemplateAssignment.find({
    studentId: { $in: studentIds },
    assignedAt: { $gte: year.startDate, $lte: year.endDate }
  }).lean()

  // 4. Create SavedGradebooks
  let savedCount = 0

  // Pre-fetch students
  const students = await Student.find({ _id: { $in: studentIds } }).lean()
  const studentMap = new Map(students.map(s => [String(s._id), s]))

  for (const assignment of assignments) {
    const enrollment = enrollments.find(e => e.studentId === assignment.studentId)
    if (!enrollment || !enrollment.classId) continue

    const cls = await ClassModel.findById(enrollment.classId).lean()
    if (!cls) continue

    const student = studentMap.get(assignment.studentId)
    if (!student) continue

    const statuses = await StudentCompetencyStatus.find({ studentId: assignment.studentId }).lean()

    const snapshotData = {
      student: student,
      enrollment: enrollment,
      statuses: statuses,
      assignment: assignment,
      className: cls.name
    }

    // Import buildSavedGradebookMeta and computeSignaturePeriodId for versioning
    const { buildSavedGradebookMeta, computeSignaturePeriodId } = await import('../utils/readinessUtils')

    await SavedGradebook.create({
      studentId: assignment.studentId,
      schoolYearId: id,
      level: cls.level || 'Sans niveau',
      classId: enrollment.classId,
      templateId: assignment.templateId,
      data: snapshotData,
      // Version everything that is archived for complete traceability
      meta: buildSavedGradebookMeta({
        templateVersion: (assignment as any).templateVersion || 1,
        dataVersion: (assignment as any).dataVersion || 1,
        signaturePeriodId: computeSignaturePeriodId(id, 'end_of_year'),
        schoolYearId: id,
        level: cls.level || 'Sans niveau',
        snapshotReason: 'year_end'
      }),
      createdAt: new Date()
    })
    savedCount++
  }

  // 5. Archive enrollments
  await Enrollment.updateMany({ schoolYearId: id }, { $set: { status: 'archived' } })

  res.json({ ok: true, savedCount })
})
