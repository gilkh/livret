import { Router } from 'express'
import { Student } from '../models/Student'
import { Enrollment } from '../models/Enrollment'
import { ClassModel } from '../models/Class'
import { StudentCompetencyStatus } from '../models/StudentCompetencyStatus'
import { requireAuth } from '../auth'

export const studentsRouter = Router()

studentsRouter.get('/', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const students = await Student.find({}).lean()
  const ids = students.map(s => String(s._id))
  const enrolls = await Enrollment.find({ studentId: { $in: ids } }).lean()
  const enrollByStudent: Record<string, any> = {}
  for (const e of enrolls) enrollByStudent[e.studentId] = e
  const classIds = enrolls.map(e => e.classId)
  const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
  const classMap: Record<string, any> = {}
  for (const c of classes) classMap[String(c._id)] = c
  const out = students.map(s => {
    const enr = enrollByStudent[String(s._id)]
    const cls = enr ? classMap[enr.classId] : null
    return { ...s, classId: enr ? enr.classId : undefined, className: cls ? cls.name : undefined }
  })
  res.json(out)
})

studentsRouter.get('/:id', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const { id } = req.params
  const student = await Student.findById(id).lean()
  if (!student) return res.status(404).json({ error: 'not_found' })
  const enrollments = await Enrollment.find({ studentId: id }).lean()
  res.json({ ...student, enrollments })
})

studentsRouter.get('/:id/competencies', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const { id } = req.params
  const statuses = await StudentCompetencyStatus.find({ studentId: id }).lean()
  res.json(statuses)
})

studentsRouter.patch('/:id/competencies/:compId', requireAuth(['TEACHER','ADMIN','SUBADMIN']), async (req, res) => {
  const { id, compId } = req.params
  const { en, fr, ar, note } = req.body
  const now = new Date()
  const updated = await StudentCompetencyStatus.findOneAndUpdate(
    { studentId: id, competencyId: compId },
    { en, fr, ar, note, updatedAt: now, updatedBy: (req as any).user.userId },
    { new: true }
  )
  if (updated) return res.json(updated)
  const created = await StudentCompetencyStatus.create({ studentId: id, competencyId: compId, en: !!en, fr: !!fr, ar: !!ar, note: note ?? null, updatedAt: now, updatedBy: (req as any).user.userId })
  res.json(created)
})

studentsRouter.patch('/:id/competencies/bulk', requireAuth(['TEACHER','ADMIN','SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const items: Array<{ competencyId: string; en?: boolean; fr?: boolean; ar?: boolean; note?: string | null }> = req.body?.items ?? []
  const userId = (req as any).user.userId
  const now = new Date()
  for (const i of items) {
    const updated = await StudentCompetencyStatus.findOneAndUpdate(
      { studentId: id, competencyId: i.competencyId },
      { en: i.en, fr: i.fr, ar: i.ar, note: i.note ?? null, updatedAt: now, updatedBy: userId },
      { new: true }
    )
    if (!updated) {
      await StudentCompetencyStatus.create({ studentId: id, competencyId: i.competencyId, en: !!i.en, fr: !!i.fr, ar: !!i.ar, note: i.note ?? null, updatedAt: now, updatedBy: userId })
    }
  }
  res.json({ ok: true })
})
studentsRouter.get('/by-class/:classId', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const { classId } = req.params
  const enrolls = await Enrollment.find({ classId }).lean()
  const ids = enrolls.map(e => e.studentId)
  const students = await Student.find({ _id: { $in: ids } }).lean()
  res.json(students)
})

studentsRouter.post('/', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { firstName, lastName, dateOfBirth, parentName, parentPhone, classId } = req.body
  if (!firstName || !lastName || !classId) return res.status(400).json({ error: 'missing_payload' })
  const dob = dateOfBirth ? new Date(dateOfBirth) : new Date('2000-01-01')
  const key = `${String(firstName).toLowerCase()}_${String(lastName).toLowerCase()}_${dob.toISOString().slice(0,10)}`
  const existing = await Student.findOne({ logicalKey: key })
  let student
  if (existing) {
    student = await Student.findByIdAndUpdate(existing._id, { firstName, lastName, dateOfBirth: dob, parentName, parentPhone }, { new: true })
  } else {
    student = await Student.create({ logicalKey: key, firstName, lastName, dateOfBirth: dob, parentName, parentPhone })
  }
  const existsEnroll = await Enrollment.findOne({ studentId: String(student!._id), classId })
  if (!existsEnroll) {
    const clsDoc = await ClassModel.findById(classId).lean()
    await Enrollment.create({ studentId: String(student!._id), classId, schoolYearId: clsDoc ? clsDoc.schoolYearId : '' })
  }
  res.json(student)
})

studentsRouter.patch('/:id', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const data: any = { ...req.body }
  if (data.dateOfBirth) data.dateOfBirth = new Date(data.dateOfBirth)
  const updated = await Student.findByIdAndUpdate(id, data, { new: true })
  if (req.body.classId) {
    const classId = String(req.body.classId)
    const enr = await Enrollment.findOne({ studentId: id })
    const clsDoc = await ClassModel.findById(classId).lean()
    if (enr) {
      if (enr.classId !== classId) {
        enr.classId = classId
        enr.schoolYearId = clsDoc ? clsDoc.schoolYearId : enr.schoolYearId
        await enr.save()
      }
    } else {
      await Enrollment.create({ studentId: id, classId, schoolYearId: clsDoc ? clsDoc.schoolYearId : '' })
    }
  }
  res.json(updated)
})
