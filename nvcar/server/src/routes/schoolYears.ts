import { Router } from 'express'
import { requireAuth } from '../auth'
import { SchoolYear } from '../models/SchoolYear'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { SavedGradebook } from '../models/SavedGradebook'
import { Enrollment } from '../models/Enrollment'
import { ClassModel } from '../models/Class'

export const schoolYearsRouter = Router()

schoolYearsRouter.get('/', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
  const list = await SchoolYear.find({}).sort({ startDate: -1 }).lean()
  res.json(list)
})

schoolYearsRouter.post('/', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { name, startDate, endDate, active } = req.body
  if (!name || !startDate || !endDate) return res.status(400).json({ error: 'missing_payload' })

  if (active) {
    await SchoolYear.updateMany({}, { $set: { active: false } })
  }

  const lastYear = await SchoolYear.findOne({}).sort({ sequence: -1 }).lean()
  const nextSequence = (lastYear?.sequence || 0) + 1

  const year = await SchoolYear.create({ name, startDate: new Date(startDate), endDate: new Date(endDate), active: active ?? true, sequence: nextSequence })
  res.json(year)
})

schoolYearsRouter.patch('/:id', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const data: any = { ...req.body }
  if (data.startDate) data.startDate = new Date(data.startDate)
  if (data.endDate) data.endDate = new Date(data.endDate)

  if (data.active) {
    await SchoolYear.updateMany({ _id: { $ne: id } }, { $set: { active: false } })
  }

  const year = await SchoolYear.findByIdAndUpdate(id, data, { new: true })
  res.json(year)
})

schoolYearsRouter.delete('/:id', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
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
  for (const assignment of assignments) {
    const enrollment = enrollments.find(e => e.studentId === assignment.studentId)
    if (!enrollment || !enrollment.classId) continue

    const cls = await ClassModel.findById(enrollment.classId).lean()
    if (!cls) continue

    await SavedGradebook.create({
      studentId: assignment.studentId,
      schoolYearId: id,
      level: cls.level || 'Sans niveau',
      classId: enrollment.classId,
      templateId: assignment.templateId,
      data: assignment.data,
      createdAt: new Date()
    })
    savedCount++
  }

  // 5. Archive enrollments
  await Enrollment.updateMany({ schoolYearId: id }, { $set: { status: 'archived' } })

  res.json({ ok: true, savedCount })
})
