import { Router } from 'express'
import { parse } from 'csv-parse/sync'
import { Student } from '../models/Student'
import { Enrollment } from '../models/Enrollment'
import { ClassModel } from '../models/Class'
import { SchoolYear } from '../models/SchoolYear'
import { StudentCompetencyStatus } from '../models/StudentCompetencyStatus'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { SavedGradebook } from '../models/SavedGradebook'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { TemplateSignature } from '../models/TemplateSignature'
import { Level } from '../models/Level'
import { Setting } from '../models/Setting'
import { logAudit } from '../utils/auditLogger'
import { requireAuth } from '../auth'
import { checkAndAssignTemplates } from '../utils/templateUtils'
import { withCache, clearCache } from '../utils/cache'
import mongoose from 'mongoose'

export const studentsRouter = Router()

studentsRouter.get('/', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  const { schoolYearId } = req.query
  const students = await Student.find({}).lean()
  const ids = students.map(s => String(s._id))

  const query: any = { studentId: { $in: ids } }
  if (schoolYearId) {
    query.schoolYearId = schoolYearId
  } else {
    const activeYear = await withCache('school-years-active', () =>
      SchoolYear.findOne({ active: true }).lean()
    )
    if (activeYear) query.schoolYearId = String(activeYear._id)
  }

  const enrolls = await Enrollment.find(query).lean()
  const enrollByStudent: Record<string, any> = {}
  const statusPriority: Record<string, number> = { active: 3, promoted: 2, archived: 1 }
  const isBetterEnrollment = (candidate: any, current: any) => {
    if (!current) return true
    const candScore = (statusPriority[candidate?.status] ?? 0) - (candidate?.classId ? 0 : 1)
    const curScore = (statusPriority[current?.status] ?? 0) - (current?.classId ? 0 : 1)
    if (candScore !== curScore) return candScore > curScore
    return String(candidate?._id || '') > String(current?._id || '')
  }
  for (const e of enrolls) {
    const cur = enrollByStudent[e.studentId]
    if (isBetterEnrollment(e, cur)) enrollByStudent[e.studentId] = e
  }
  const classIds = enrolls.map(e => e.classId).filter(Boolean)
  const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
  const classMap: Record<string, any> = {}
  for (const c of classes) classMap[String(c._id)] = c
  const out = students.map(s => {
    const enr = enrollByStudent[String(s._id)]
    const cls = enr && enr.classId ? classMap[enr.classId] : null
    return {
      ...s,
      classId: enr ? enr.classId : undefined,
      className: cls ? cls.name : undefined,
      level: cls ? cls.level : s.level
    }
  })
  res.json(out)
})

// Create a snapshot for a student (e.g. Sem1, Exit, Transfer)
studentsRouter.post('/:id/snapshot', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const { reason } = req.body

  if (!['sem1', 'exit', 'transfer', 'manual'].includes(reason)) {
    return res.status(400).json({ error: 'invalid_reason' })
  }

  try {
    const student = await Student.findById(id).lean()
    if (!student) return res.status(404).json({ error: 'student_not_found' })

    const activeYear = await SchoolYear.findOne({ active: true }).lean()
    if (!activeYear) return res.status(400).json({ error: 'no_active_year' })

    const enrollment = await Enrollment.findOne({ studentId: id, schoolYearId: activeYear._id, status: 'active' }).lean()
    if (!enrollment) return res.status(400).json({ error: 'not_enrolled' })

    const assignment = await TemplateAssignment.findOne({ studentId: id }).lean()
    if (!assignment) return res.status(404).json({ error: 'assignment_not_found' })

    const cls = enrollment.classId ? await ClassModel.findById(enrollment.classId).lean() : null

    // Gather snapshot data
    const statuses = await StudentCompetencyStatus.find({ studentId: id }).lean()
    const signatures = await TemplateSignature.find({ templateAssignmentId: String(assignment._id) }).lean()

    const snapshotData = {
      student: student,
      enrollment: enrollment,
      statuses: statuses,
      assignment: assignment,
      className: cls ? cls.name : '',
      signatures: signatures,
      signature: signatures.find((s: any) => (s as any).type === 'standard') || null,
      finalSignature: signatures.find((s: any) => (s as any).type === 'end_of_year') || null,
    }

    const { createAssignmentSnapshot } = await import('../services/rolloverService')

    await createAssignmentSnapshot(
      assignment,
      reason,
      {
        schoolYearId: String(activeYear._id),
        level: cls?.level || 'Sans niveau',
        classId: enrollment.classId || undefined,
        data: snapshotData
      }
    )

    // If reason is exit or transfer, update enrollment status
    if (reason === 'exit') {
      await Enrollment.findByIdAndUpdate(enrollment._id, { status: 'left' })
    }

    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: 'snapshot_failed', message: e.message })
  }
})

studentsRouter.get('/unassigned/export/:schoolYearId', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { schoolYearId } = req.params
  const result = await fetchUnassignedStudents(schoolYearId)

  const headers = ['StudentId', 'FirstName', 'LastName', 'PreviousClass', 'TargetLevel', 'NextClass']
  const rows = result.map(s => [
    s._id,
    s.firstName,
    s.lastName,
    s.previousClassName || '',
    s.level || '',
    ''
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
  ].join('\n')

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="students_to_assign.csv"`)
  res.send(csvContent)
})

studentsRouter.post('/bulk-assign-section', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { csv, schoolYearId } = req.body
  if (!csv || !schoolYearId) return res.status(400).json({ error: 'missing_params' })

  try {
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    })

    const results = {
      success: 0,
      errors: [] as any[]
    }

    const normalized: Array<{ index: number; studentId: string; level: string; className: string }> = []
    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      const studentId = record.StudentId
      const nextClass = record.NextClass

      if (!studentId || !nextClass) {
        results.errors.push({ studentId, error: 'missing_id_or_class' })
        continue
      }

      const parts = String(nextClass).trim().split(' ')
      let level: string | undefined
      let section: string | undefined

      if (parts.length >= 2) {
        level = parts[0]
        section = parts.slice(1).join(' ')
      } else if (record.TargetLevel) {
        level = record.TargetLevel
        section = nextClass
      }

      if (!level || !section) {
        results.errors.push({ studentId, error: 'invalid_class_format' })
        continue
      }

      const className = `${level} ${section}`.trim()
      normalized.push({ index: i, studentId: String(studentId), level: String(level), className })
    }

    const uniqueClassNames = Array.from(new Set(normalized.map(r => r.className)))
    const existingClasses = await ClassModel.find({ schoolYearId, name: { $in: uniqueClassNames } }).lean()
    const classByName = new Map<string, any>(existingClasses.map(c => [String(c.name), c]))
    const missingNames = uniqueClassNames.filter(n => !classByName.has(n))

    if (missingNames.length) {
      const nameToLevel = new Map<string, string>()
      for (const r of normalized) if (!nameToLevel.has(r.className)) nameToLevel.set(r.className, r.level)
      const toInsert = missingNames.map(name => ({ name, level: nameToLevel.get(name) || '', schoolYearId }))
      try {
        const inserted = await ClassModel.insertMany(toInsert, { ordered: false })
        for (const c of inserted) classByName.set(String((c as any).name), c)
      } catch (e: any) {
        const refreshed = await ClassModel.find({ schoolYearId, name: { $in: missingNames } }).lean()
        for (const c of refreshed) classByName.set(String(c.name), c)
      }
    }

    const assignments = normalized
      .map(r => {
        const cls = classByName.get(r.className)
        if (!cls) {
          results.errors.push({ studentId: r.studentId, error: 'class_not_found_or_create_failed' })
          return null
        }
        return { studentId: r.studentId, level: r.level, classId: String(cls._id) }
      })
      .filter(Boolean) as Array<{ studentId: string; level: string; classId: string }>

    const enrollmentOps = assignments.map(a => ({
      updateOne: {
        filter: { studentId: a.studentId, schoolYearId },
        update: {
          $set: { classId: a.classId, status: 'active' },
          $setOnInsert: { studentId: a.studentId, schoolYearId, status: 'active' },
        },
        upsert: true,
      },
    }))

    const failedOpIndexes = new Set<number>()
    const chunkSize = 1000
    for (let i = 0; i < enrollmentOps.length; i += chunkSize) {
      const chunk = enrollmentOps.slice(i, i + chunkSize)
      try {
        if (chunk.length) await Enrollment.bulkWrite(chunk, { ordered: false })
      } catch (e: any) {
        const writeErrors = e?.writeErrors || []
        for (const we of writeErrors) {
          const localIndex = typeof we?.index === 'number' ? we.index : -1
          if (localIndex >= 0) failedOpIndexes.add(i + localIndex)
        }
        if (writeErrors.length === 0) throw e
      }
    }

    const tasks = assignments
      .map((a, idx) => ({ ...a, idx }))
      .filter(a => !failedOpIndexes.has(a.idx))

    const concurrency = 10
    let cursor = 0
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }).map(async () => {
      while (cursor < tasks.length) {
        const current = tasks[cursor++]
        try {
          await checkAndAssignTemplates(current.studentId, current.level, schoolYearId, current.classId, (req as any).user.userId)
          results.success++
        } catch (e: any) {
          results.errors.push({ studentId: current.studentId, error: e.message })
        }
      }
    })
    await Promise.all(workers)

    for (const idx of failedOpIndexes) {
      const a = assignments[idx]
      if (a) results.errors.push({ studentId: a.studentId, error: 'enrollment_write_failed' })
    }
    res.json(results)
  } catch (e: any) {
    res.status(400).json({ error: 'csv_parse_error', details: e.message })
  }
})

studentsRouter.get('/unassigned/:schoolYearId', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { schoolYearId } = req.params
  const result = await fetchUnassignedStudents(schoolYearId)
  res.json(result)
})

studentsRouter.post('/:id/assign-section', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const { schoolYearId, level, section } = req.body

  if (!schoolYearId || !level || !section) return res.status(400).json({ error: 'missing_params' })

  const className = `${level} ${section}`

  let cls = await ClassModel.findOne({ schoolYearId, name: className }).lean()
  if (!cls) {
    cls = await ClassModel.create({
      name: className,
      level,
      schoolYearId
    })
  }

  const existing = await Enrollment.findOne({ studentId: id, schoolYearId })
  if (existing) {
    existing.classId = String(cls._id)
    await existing.save()
  } else {
    await Enrollment.create({
      studentId: id,
      classId: String(cls._id),
      schoolYearId
    })
  }

  await checkAndAssignTemplates(id, level, schoolYearId, String(cls._id), (req as any).user.userId)

  res.json({ ok: true })
})

studentsRouter.get('/:id', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  const { id } = req.params
  const student = await Student.findById(id).lean()
  if (!student) return res.status(404).json({ error: 'not_found' })

  const enrollments = await Enrollment.find({ studentId: id }).lean()

  const classIds = enrollments.map(e => e.classId).filter(Boolean)
  const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
  const classMap = new Map(classes.map(c => [String(c._id), c.name]))

  const enrichedEnrollments = enrollments.map(e => ({
    ...e,
    className: e.classId ? classMap.get(e.classId) : 'Unknown'
  }))

  res.json({ ...student, enrollments: enrichedEnrollments })
})

studentsRouter.get('/:id/competencies', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  const { id } = req.params
  const statuses = await StudentCompetencyStatus.find({ studentId: id }).lean()
  res.json(statuses)
})

studentsRouter.patch('/:id/competencies/:compId', requireAuth(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
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

studentsRouter.patch('/:id/competencies/bulk', requireAuth(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
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

studentsRouter.get('/by-class/:classId', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  const { classId } = req.params
  const enrolls = await Enrollment.find({ classId }).lean()
  const ids = enrolls.map(e => e.studentId)
  const students = await Student.find({ _id: { $in: ids } }).lean()
  res.json(students)
})

studentsRouter.post('/', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { firstName, lastName, dateOfBirth, parentName, parentPhone, classId } = req.body
  if (!firstName || !lastName || !classId) return res.status(400).json({ error: 'missing_payload' })
  const dob = dateOfBirth ? new Date(dateOfBirth) : new Date('2000-01-01')

  // Get the school year from the class to determine the join year
  const clsDoc = await ClassModel.findById(classId).lean()
  let joinYear = new Date().getFullYear().toString()
  if (clsDoc && clsDoc.schoolYearId) {
    const schoolYear = await SchoolYear.findById(clsDoc.schoolYearId).lean()
    if (schoolYear && schoolYear.name) {
      // Extract first year from format like "2024/2025" or "2024-2025"
      const match = schoolYear.name.match(/(\d{4})/)
      if (match) joinYear = match[1]
    }
  }

  // Generate logicalKey as firstName_lastName_yearJoined
  const baseKey = `${String(firstName).toLowerCase()}_${String(lastName).toLowerCase()}_${joinYear}`

  // Check for duplicates and add suffix if needed
  let key = baseKey
  let suffix = 1
  let existing = await Student.findOne({ logicalKey: key })
  while (existing) {
    suffix++
    key = `${baseKey}_${suffix}`
    existing = await Student.findOne({ logicalKey: key })
  }

  const student = await Student.create({ logicalKey: key, firstName, lastName, dateOfBirth: dob, parentName, parentPhone })

  const existsEnroll = await Enrollment.findOne({ studentId: String(student!._id), classId })
  if (!existsEnroll) {
    await Enrollment.create({ studentId: String(student!._id), classId, schoolYearId: clsDoc ? clsDoc.schoolYearId : '' })
    if (clsDoc && clsDoc.level) {
      await checkAndAssignTemplates(String(student!._id), clsDoc.level, clsDoc.schoolYearId, classId, (req as any).user.userId)
    }
  }
  res.json(student)
})

studentsRouter.patch('/:id', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const data: any = { ...req.body }
  if (data.dateOfBirth) data.dateOfBirth = new Date(data.dateOfBirth)
  const updated = await Student.findByIdAndUpdate(id, data, { new: true })
  if (req.body.classId) {
    const classId = String(req.body.classId)
    const clsDoc = await ClassModel.findById(classId).lean()
    if (!clsDoc) return res.status(404).json({ error: 'class_not_found' })

    let enr = await Enrollment.findOne({
      studentId: id,
      schoolYearId: clsDoc.schoolYearId,
      status: { $ne: 'promoted' }
    })

    if (enr) {
      if (enr.classId !== classId) {
        enr.classId = classId
        await enr.save()
        if (clsDoc.level) {
          await checkAndAssignTemplates(id, clsDoc.level, clsDoc.schoolYearId, classId, (req as any).user.userId)
        }
      }
    } else {
      await Enrollment.create({ studentId: id, classId, schoolYearId: clsDoc.schoolYearId, status: 'active' })
      if (clsDoc.level) {
        await checkAndAssignTemplates(id, clsDoc.level, clsDoc.schoolYearId, classId, (req as any).user.userId)
      }
    }
  }
  res.json(updated)
})

// Delete a student and all related data
studentsRouter.delete('/:id', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const adminId = (req as any).user.userId

  try {
    const student = await Student.findById(id).lean()
    if (!student) return res.status(404).json({ error: 'student_not_found' })

    // Delete all related data
    await Enrollment.deleteMany({ studentId: id })
    await StudentCompetencyStatus.deleteMany({ studentId: id })

    // Get template assignments to delete related signatures
    const assignments = await TemplateAssignment.find({ studentId: id }).lean()
    const assignmentIds = assignments.map(a => String(a._id))
    await TemplateSignature.deleteMany({ templateAssignmentId: { $in: assignmentIds } })
    await TemplateAssignment.deleteMany({ studentId: id })
    await SavedGradebook.deleteMany({ studentId: id })

    // Finally delete the student
    await Student.findByIdAndDelete(id)

    await logAudit({
      userId: adminId,
      action: 'DELETE_STUDENT',
      details: { studentId: id, studentName: `${student.firstName} ${student.lastName}` },
      req
    })

    res.json({ ok: true })
  } catch (e: any) {
    console.error('Delete student error:', e)
    res.status(500).json({ error: 'delete_failed', message: e.message })
  }
})

// Complete a class (create snapshots for all students in a class)
studentsRouter.post('/complete-class/:classId', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { classId } = req.params
  const adminId = (req as any).user.userId

  try {
    const cls = await ClassModel.findById(classId).lean()
    if (!cls) return res.status(404).json({ error: 'class_not_found' })

    const activeYear = await SchoolYear.findOne({ active: true }).lean()
    if (!activeYear) return res.status(400).json({ error: 'no_active_year' })

    // Get all enrollments for this class
    const enrollments = await Enrollment.find({ classId, status: 'active' }).lean()
    const studentIds = enrollments.map(e => e.studentId)

    const { createAssignmentSnapshot } = await import('../services/rolloverService')

    const results = {
      success: 0,
      errors: [] as any[]
    }

    for (const studentId of studentIds) {
      try {
        const student = await Student.findById(studentId).lean()
        if (!student) {
          results.errors.push({ studentId, error: 'student_not_found' })
          continue
        }

        const enrollment = enrollments.find(e => e.studentId === studentId)
        const assignment = await TemplateAssignment.findOne({ studentId }).lean()

        if (!assignment) {
          results.errors.push({ studentId, error: 'no_assignment' })
          continue
        }

        const statuses = await StudentCompetencyStatus.find({ studentId }).lean()
        const signatures = await TemplateSignature.find({ templateAssignmentId: String(assignment._id) }).lean()

        const snapshotData = {
          student: student,
          enrollment: enrollment,
          statuses: statuses,
          assignment: assignment,
          className: cls.name,
          signatures: signatures,
          signature: signatures.find((s: any) => s.type === 'standard') || null,
          finalSignature: signatures.find((s: any) => s.type === 'end_of_year') || null,
        }

        await createAssignmentSnapshot(
          assignment,
          'class_complete',
          {
            schoolYearId: String(activeYear._id),
            level: cls.level || 'Sans niveau',
            classId: classId,
            data: snapshotData
          }
        )

        results.success++
      } catch (e: any) {
        results.errors.push({ studentId, error: e.message })
      }
    }

    await logAudit({
      userId: adminId,
      action: 'COMPLETE_CLASS',
      details: { classId, className: cls.name, successCount: results.success, errorCount: results.errors.length },
      req
    })

    res.json(results)
  } catch (e: any) {
    console.error('Complete class error:', e)
    res.status(500).json({ error: 'complete_failed', message: e.message })
  }
})

studentsRouter.post('/:studentId/promote', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const adminId = (req as any).user.userId
    const { studentId } = req.params
    const { nextLevel } = req.body

    const student = await Student.findById(studentId)
    if (!student) return res.status(404).json({ error: 'student_not_found' })

    const enrollment = await Enrollment.findOne({
      studentId,
      $or: [{ status: 'active' }, { status: { $exists: false } }]
    }).lean()

    let currentLevel = student.level || ''
    let currentSchoolYearId = ''
    let currentSchoolYearSequence = 0
    let yearName = new Date().getFullYear().toString()

    if (enrollment) {
      if (enrollment.classId) {
        const cls = await ClassModel.findById(enrollment.classId).lean()
        if (cls) {
          currentLevel = cls.level || ''
          currentSchoolYearId = cls.schoolYearId
        }
      }

      if (!currentSchoolYearId && enrollment.schoolYearId) {
        currentSchoolYearId = enrollment.schoolYearId
      }

      if (currentSchoolYearId) {
        const sy = await SchoolYear.findById(currentSchoolYearId).lean()
        if (sy) {
          yearName = sy.name
          currentSchoolYearSequence = sy.sequence || 0
        }
      }
    }

    if (currentSchoolYearId) {
      const alreadyPromoted = student.promotions?.some((p: any) => p.schoolYearId === currentSchoolYearId)
      if (alreadyPromoted) {
        return res.status(400).json({ error: 'already_promoted', message: 'Student already promoted this year' })
      }
    }

    let calculatedNextLevel = nextLevel
    if (!calculatedNextLevel) {
      const currentLevelDoc = await withCache(`level-name-${currentLevel}`, () =>
        Level.findOne({ name: currentLevel }).lean()
      )
      if (currentLevelDoc) {
        // Fix: Support gaps in levels by searching for the first level with order > current
        const nextLevelDoc = await Level.findOne({ order: { $gt: currentLevelDoc.order } })
          .sort({ order: 1 })
          .lean()
        if (nextLevelDoc) {
          calculatedNextLevel = nextLevelDoc.name
        }
      }
    }

    if (!calculatedNextLevel) return res.status(400).json({ error: 'cannot_determine_next_level' })

    let nextSchoolYearId = ''
    if (currentSchoolYearSequence > 0) {
      const nextSy = await SchoolYear.findOne({ sequence: currentSchoolYearSequence + 1 }).lean()
      if (nextSy) {
        nextSchoolYearId = String(nextSy._id)
      }
    } else {
      const allYears = await SchoolYear.find({}).sort({ startDate: 1 }).lean()
      const idx = allYears.findIndex(y => String(y._id) === currentSchoolYearId)
      if (idx >= 0 && idx < allYears.length - 1) {
        nextSchoolYearId = String(allYears[idx + 1]._id)
      }
    }

    if (!nextSchoolYearId && currentSchoolYearId) {
      const currentSy = await SchoolYear.findById(currentSchoolYearId).lean()
      if (currentSy && currentSy.name) {
        const match = currentSy.name.match(/(\d{4})([-/.])(\d{4})/)
        if (match) {
          const startYear = parseInt(match[1])
          const separator = match[2]
          const endYear = parseInt(match[3])
          const nextName = `${startYear + 1}${separator}${endYear + 1}`
          const nextSy = await SchoolYear.findOne({ name: nextName }).lean()
          if (nextSy) nextSchoolYearId = String(nextSy._id)
        }
      }
    }

    if (!nextSchoolYearId) {
      return res.status(400).json({ error: 'no_next_year', message: 'Next school year not found' })
    }

    // Continuous carnet model: TemplateAssignment does not have schoolYearId.
    // Prefer an assignment stamped with this school year; otherwise fall back to the most recent.
    let assignment = await TemplateAssignment.findOne({
      studentId: String(student._id),
      completionSchoolYearId: currentSchoolYearId
    }).sort({ assignedAt: -1 })

    if (!assignment) {
      assignment = await TemplateAssignment.findOne({ studentId: String(student._id) })
        .sort({ assignedAt: -1 })
    }

    // Wrap promotion-related DB updates in a transaction to ensure atomicity
    const session = await mongoose.startSession()
    let usedTransaction = true
    let promotion: any = null

    try {
      try { session.startTransaction() } catch (e) { usedTransaction = false }

      if (currentSchoolYearId && enrollment) {
        const statuses = await StudentCompetencyStatus.find({ studentId: student._id }).lean()

        let signatures: any[] = []
        let templateId = assignment?.templateId
        let templateData: any = null

        if (assignment && assignment._id) {
          signatures = await TemplateSignature.find({ templateAssignmentId: assignment._id }).lean()

          if (assignment.templateId) {
            const template = await GradebookTemplate.findById(assignment.templateId).lean()
            if (template) {
              templateData = template
              if (assignment.templateVersion && template.versionHistory) {
                const version = template.versionHistory.find((v: any) => v.version === assignment.templateVersion)
                if (version) {
                  templateData = {
                    ...template,
                    pages: version.pages,
                    variables: version.variables || {},
                    watermark: version.watermark
                  }
                }
              }
            }
          }
        }

        // Only create a SavedGradebook if we actually have an assignment and templateId (self-contained snapshot)
        if (assignment && assignment._id && templateId) {
          const snapshotData = {
            student: student.toObject ? student.toObject() : student,
            enrollment: enrollment,
            statuses: statuses,
            assignment: assignment.toObject ? assignment.toObject() : assignment,
            signatures: signatures,
            template: templateData
          }

          if (usedTransaction) {
            await new SavedGradebook({
              studentId: student._id,
              schoolYearId: currentSchoolYearId,
              level: currentLevel || 'Sans niveau',
              classId: enrollment.classId,
              templateId: templateId,
              data: snapshotData
            }).save({ session })
          } else {
            await SavedGradebook.create({
              studentId: student._id,
              schoolYearId: currentSchoolYearId,
              level: currentLevel || 'Sans niveau',
              classId: enrollment.classId,
              templateId: templateId,
              data: snapshotData
            })
          }
        }
      }

      promotion = {
        schoolYearId: currentSchoolYearId,
        fromLevel: currentLevel,
        toLevel: calculatedNextLevel,
        date: new Date(),
        promotedBy: adminId,
        decision: 'promoted'
      }

      let updatedStudent
      if (usedTransaction) {
        updatedStudent = await Student.findOneAndUpdate(
          { _id: studentId, 'promotions.schoolYearId': { $ne: currentSchoolYearId } },
          { $push: { promotions: promotion }, nextLevel: calculatedNextLevel },
          { session }
        )
      } else {
        updatedStudent = await Student.findOneAndUpdate(
          { _id: studentId, 'promotions.schoolYearId': { $ne: currentSchoolYearId } },
          { $push: { promotions: promotion }, nextLevel: calculatedNextLevel }
        )
      }

      if (!updatedStudent) {
        throw new Error('ALREADY_PROMOTED_RACE_CONDITION')
      }

      if (enrollment) {
        if (usedTransaction) await Enrollment.findByIdAndUpdate(enrollment._id, { promotionStatus: 'promoted', status: 'promoted' }, { session })
        else await Enrollment.findByIdAndUpdate(enrollment._id, { promotionStatus: 'promoted', status: 'promoted' })
      }

      const nextLevelDoc = await Level.findOne({ name: calculatedNextLevel }).lean()
      const exitSetting = await Setting.findOne({ key: 'exit_level_name' }).lean().catch(() => null)
      const exitName = exitSetting && exitSetting.value ? String(exitSetting.value).toLowerCase() : null
      const isExit = nextLevelDoc?.isExitLevel || (exitName && exitName === String(calculatedNextLevel).toLowerCase()) || (String(calculatedNextLevel).toLowerCase() === 'eb1')

      if (!isExit) {
        if (usedTransaction) {
          await Enrollment.create([{ studentId: studentId, schoolYearId: nextSchoolYearId, status: 'active' }], { session })
        } else {
          await Enrollment.create({ studentId: studentId, schoolYearId: nextSchoolYearId, status: 'active' })
        }
      }

      if (assignment && assignment._id) {
        // Re-fetch assignment document under session to safely update
        if (usedTransaction) {
          const assignmentDoc: any = await TemplateAssignment.findById(assignment._id).session(session)
          const cls = enrollment && enrollment.classId ? await ClassModel.findById(enrollment.classId).session(session).lean() : null
          let className = cls ? cls.name : ''

          const promotionData = {
            from: currentLevel,
            to: calculatedNextLevel,
            date: new Date(),
            year: yearName,
            class: className
          }

          const data = assignmentDoc.data || {}
          const promotions = Array.isArray(data.promotions) ? data.promotions : []
          promotions.push(promotionData)
          data.promotions = promotions

          assignmentDoc.data = data
          assignmentDoc.markModified('data')
          await assignmentDoc.save({ session })
        } else {
          let className = ''
          if (enrollment && enrollment.classId) {
            const cls = await ClassModel.findById(enrollment.classId)
            if (cls) className = cls.name
          }

          const promotionData = {
            from: currentLevel,
            to: calculatedNextLevel,
            date: new Date(),
            year: yearName,
            class: className
          }

          const data = assignment.data || {}
          const promotions = Array.isArray(data.promotions) ? data.promotions : []
          promotions.push(promotionData)
          data.promotions = promotions

          assignment.data = data
          assignment.markModified('data')
          await assignment.save()
        }
      }

      if (usedTransaction) await session.commitTransaction()
    } catch (err) {
      if (usedTransaction) {
        try { await session.abortTransaction() } catch (e) { }
      }
      throw err
    } finally {
      session.endSession()
    }



    await logAudit({
      userId: adminId,
      action: 'PROMOTE_STUDENT',
      details: { studentId, from: currentLevel, to: calculatedNextLevel },
      req
    })

    res.json({ success: true, promotion })
  } catch (error: any) {
    console.error(error)
    if (error.message === 'ALREADY_PROMOTED_RACE_CONDITION') {
      return res.status(400).json({ error: 'already_promoted', message: 'Student already promoted this year' })
    }
    res.status(500).json({ error: 'internal_error' })
  }
})

async function fetchUnassignedStudents(schoolYearId: string) {
  const yearEnrollments = await Enrollment.find({ schoolYearId }).lean()
  const assignedStudentIds = new Set(
    yearEnrollments.filter(e => e.classId).map(e => e.studentId)
  )
  const enrolledUnassignedIds = yearEnrollments
    .filter(e => !e.classId)
    .map(e => e.studentId)

  const taggedStudents = await Student.find({ schoolYearId }).lean()
  const validTaggedStudents = taggedStudents.filter(s => !assignedStudentIds.has(String(s._id)))
  const taggedIds = new Set(validTaggedStudents.map(s => String(s._id)))
  const missingIds = enrolledUnassignedIds.filter(id => !taggedIds.has(id))

  let extraStudents: any[] = []
  if (missingIds.length > 0) {
    extraStudents = await Student.find({ _id: { $in: missingIds } }).lean()
  }

  const unassigned = [...validTaggedStudents, ...extraStudents]
  const unassignedIds = unassigned.map(s => String(s._id))

  const allYears = await SchoolYear.find({}).sort({ startDate: 1 }).lean()
  const currentIndex = allYears.findIndex(y => String(y._id) === schoolYearId)
  let previousYearId: string | null = null
  if (currentIndex > 0) {
    previousYearId = String(allYears[currentIndex - 1]._id)
  }

  const previousClassMap: Record<string, string> = {}
  if (previousYearId) {
    const prevEnrollments = await Enrollment.find({
      studentId: { $in: unassignedIds },
      schoolYearId: previousYearId
    }).lean()

    const prevClassIds = prevEnrollments.map(e => e.classId).filter(Boolean)
    const prevClasses = await ClassModel.find({ _id: { $in: prevClassIds } }).lean()
    const prevClassIdToName: Record<string, string> = {}
    for (const c of prevClasses) prevClassIdToName[String(c._id)] = c.name

    for (const e of prevEnrollments) {
      if (e.classId && prevClassIdToName[e.classId]) {
        previousClassMap[e.studentId] = prevClassIdToName[e.classId]
      }
    }
  }

  const assignments = await TemplateAssignment.find({
    studentId: { $in: unassignedIds },
    'data.promotions': { $exists: true, $not: { $size: 0 } }
  }).lean()

  const promotionMap: Record<string, any> = {}

  for (const a of assignments) {
    if (a.data && Array.isArray(a.data.promotions)) {
      const lastPromo = a.data.promotions[a.data.promotions.length - 1]
      const existing = promotionMap[a.studentId]
      if (!existing || new Date(lastPromo.date) > new Date(existing.date)) {
        promotionMap[a.studentId] = lastPromo
      }
    }
  }

  return unassigned.map(s => {
    const promo = promotionMap[String(s._id)]
    const effectiveLevel = s.nextLevel || (promo ? promo.to : s.level)

    return {
      ...s,
      level: effectiveLevel,
      promotion: promo,
      previousClassName: previousClassMap[String(s._id)]
    }
  }).filter(s => {
    const lvl = s.level ? s.level.toLowerCase() : ''
    return lvl !== 'eb1'
  })
}
