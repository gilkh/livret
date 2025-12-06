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
import { Level } from '../models/Level'
import { logAudit } from '../utils/auditLogger'
import { requireAuth } from '../auth'
import { checkAndAssignTemplates } from '../utils/templateUtils'

export const studentsRouter = Router()

studentsRouter.get('/', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const { schoolYearId } = req.query
  const students = await Student.find({}).lean()
  const ids = students.map(s => String(s._id))
  
  const query: any = { studentId: { $in: ids } }
  if (schoolYearId) {
    query.schoolYearId = schoolYearId
    // If we are looking at a specific year, we want active or promoted enrollments for that year
    // But actually, an enrollment record is unique to a year.
  } else {
    // If no year specified, maybe default to active? Or return all?
    // For backward compatibility, if no year, we might get mixed results if we don't filter.
    // But the frontend should send it.
    // Let's try to find the active year if not provided?
    const activeYear = await SchoolYear.findOne({ active: true }).lean()
    if (activeYear) query.schoolYearId = String(activeYear._id)
  }

  const enrolls = await Enrollment.find(query).lean()
  const enrollByStudent: Record<string, any> = {}
  for (const e of enrolls) enrollByStudent[e.studentId] = e
  const classIds = enrolls.map(e => e.classId).filter(Boolean) // Filter out undefined/null classIds
  const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
  const classMap: Record<string, any> = {}
  for (const c of classes) classMap[String(c._id)] = c
  const out = students.map(s => {
    const enr = enrollByStudent[String(s._id)]
    const cls = enr && enr.classId ? classMap[enr.classId] : null
    return { ...s, classId: enr ? enr.classId : undefined, className: cls ? cls.name : undefined, level: cls ? cls.level : s.level }
  })
  res.json(out)
})

studentsRouter.get('/unassigned/export/:schoolYearId', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
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

studentsRouter.post('/bulk-assign-section', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
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
    
    for (const record of records) {
      const studentId = record.StudentId
      const nextClass = record.NextClass
      
      if (!studentId || !nextClass) {
        results.errors.push({ studentId, error: 'missing_id_or_class' })
        continue
      }
      
      const parts = nextClass.trim().split(' ')
      let level, section
      
      if (parts.length >= 2) {
          level = parts[0]
          section = parts.slice(1).join(' ')
      } else {
          if (record.TargetLevel) {
              level = record.TargetLevel
              section = nextClass
          } else {
               results.errors.push({ studentId, error: 'invalid_class_format' })
               continue
          }
      }
      
      try {
          const className = `${level} ${section}`
          let cls = await ClassModel.findOne({ schoolYearId, name: className }).lean()
          if (!cls) {
            cls = await ClassModel.create({ name: className, level, schoolYearId })
          }
          
          const existing = await Enrollment.findOne({ studentId, schoolYearId })
          if (existing) {
            existing.classId = String(cls._id)
            await existing.save()
          } else {
            await Enrollment.create({ studentId, classId: String(cls._id), schoolYearId })
          }

          await checkAndAssignTemplates(studentId, level, schoolYearId, String(cls._id), (req as any).user.userId)
          results.success++
      } catch (e: any) {
          results.errors.push({ studentId, error: e.message })
      }
    }
    res.json(results)
  } catch (e: any) {
      res.status(400).json({ error: 'csv_parse_error', details: e.message })
  }
})

studentsRouter.get('/unassigned/:schoolYearId', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { schoolYearId } = req.params
  const result = await fetchUnassignedStudents(schoolYearId)
  res.json(result)
})

studentsRouter.post('/:id/assign-section', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const { schoolYearId, level, section } = req.body // section is 'A', 'B', etc.
  
  if (!schoolYearId || !level || !section) return res.status(400).json({ error: 'missing_params' })
  
  const className = `${level} ${section}`
  
  // Find or create class
  let cls = await ClassModel.findOne({ schoolYearId, name: className }).lean()
  if (!cls) {
    cls = await ClassModel.create({ 
      name: className, 
      level, 
      schoolYearId 
    })
  }
  
  // Create enrollment
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

  // Check and assign templates if needed (this also updates teachers and resets status if needed)
  await checkAndAssignTemplates(id, level, schoolYearId, String(cls._id), (req as any).user.userId)
  
  res.json({ ok: true })
})

studentsRouter.get('/:id', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const { id } = req.params
  const student = await Student.findById(id).lean()
  if (!student) return res.status(404).json({ error: 'not_found' })
  
  const enrollments = await Enrollment.find({ studentId: id }).lean()
  
  // Populate class names
  const classIds = enrollments.map(e => e.classId).filter(Boolean)
  const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
  const classMap = new Map(classes.map(c => [String(c._id), c.name]))
  
  const enrichedEnrollments = enrollments.map(e => ({
    ...e,
    className: e.classId ? classMap.get(e.classId) : 'Unknown'
  }))

  res.json({ ...student, enrollments: enrichedEnrollments })
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
    if (clsDoc && clsDoc.level) {
      await checkAndAssignTemplates(String(student!._id), clsDoc.level, clsDoc.schoolYearId, classId, (req as any).user.userId)
    }
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
        if (clsDoc && clsDoc.level) {
          await checkAndAssignTemplates(id, clsDoc.level, clsDoc.schoolYearId, classId, (req as any).user.userId)
        }
      }
    } else {
      await Enrollment.create({ studentId: id, classId, schoolYearId: clsDoc ? clsDoc.schoolYearId : '' })
      if (clsDoc && clsDoc.level) {
        await checkAndAssignTemplates(id, clsDoc.level, clsDoc.schoolYearId, classId, (req as any).user.userId)
      }
    }
  }
  res.json(updated)
})

// Admin: Promote student
studentsRouter.post('/:studentId/promote', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const adminId = (req as any).user.userId
        const { studentId } = req.params
        const { nextLevel } = req.body

        const student = await Student.findById(studentId)
        if (!student) return res.status(404).json({ error: 'student_not_found' })

        // Get current enrollment to find school year
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

        // Check if already promoted in current school year
        if (currentSchoolYearId) {
            const alreadyPromoted = student.promotions?.some((p: any) => p.schoolYearId === currentSchoolYearId)
            if (alreadyPromoted) {
                return res.status(400).json({ error: 'already_promoted', message: 'Student already promoted this year' })
            }
        }

        // Calculate Next Level dynamically if not provided
        let calculatedNextLevel = nextLevel
        if (!calculatedNextLevel) {
            const currentLevelDoc = await Level.findOne({ name: currentLevel }).lean()
            if (currentLevelDoc) {
                const nextLevelDoc = await Level.findOne({ order: currentLevelDoc.order + 1 }).lean()
                if (nextLevelDoc) {
                    calculatedNextLevel = nextLevelDoc.name
                }
            }
        }
        
        if (!calculatedNextLevel) return res.status(400).json({ error: 'cannot_determine_next_level' })

        // Find next school year by sequence
        let nextSchoolYearId = ''
        if (currentSchoolYearSequence > 0) {
             const nextSy = await SchoolYear.findOne({ sequence: currentSchoolYearSequence + 1 }).lean()
             if (nextSy) {
                 nextSchoolYearId = String(nextSy._id)
             }
        }
        
        if (!nextSchoolYearId && currentSchoolYearId) {
             // Fallback to old logic if sequence is missing
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

        // Find assignment for snapshot
        const assignment = await TemplateAssignment.findOne({ 
            studentId: student._id, 
            schoolYearId: currentSchoolYearId 
        })

        // Create Gradebook Snapshot if assignment exists
        if (currentSchoolYearId && enrollment && assignment) {
            const statuses = await StudentCompetencyStatus.find({ studentId: student._id }).lean()
            
            const snapshotData = {
                student: student.toObject ? student.toObject() : student,
                enrollment: enrollment,
                statuses: statuses,
                assignment: assignment.toObject ? assignment.toObject() : assignment
            }

            await SavedGradebook.create({
                studentId: student._id,
                schoolYearId: currentSchoolYearId,
                level: currentLevel || 'Sans niveau',
                classId: enrollment.classId,
                templateId: assignment.templateId,
                data: snapshotData
            })
        }

        const promotion = {
            schoolYearId: currentSchoolYearId,
            fromLevel: currentLevel,
            toLevel: calculatedNextLevel,
            date: new Date(),
            promotedBy: adminId,
            decision: 'promoted'
        }

        // Update Student: add promotion and set nextLevel
        await Student.findByIdAndUpdate(studentId, {
            $push: { promotions: promotion },
            nextLevel: calculatedNextLevel
        })

        // Update current enrollment
        if (enrollment) {
             await Enrollment.findByIdAndUpdate(enrollment._id, { promotionStatus: 'promoted', status: 'promoted' })
        }

        // Create new Enrollment for next year ONLY if not leaving the system (EB1)
        if (calculatedNextLevel.toLowerCase() !== 'eb1') {
            await Enrollment.create({
                studentId: studentId,
                schoolYearId: nextSchoolYearId,
                status: 'active',
                // classId is optional, will be assigned later
            })
        }

        // Record promotion in assignment data
        if (assignment) {
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

        await logAudit({
            userId: adminId,
            action: 'PROMOTE_STUDENT',
            details: { studentId, from: currentLevel, to: calculatedNextLevel },
            req
        })
        
        res.json({ success: true, promotion })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'internal_error' })
    }
})

async function fetchUnassignedStudents(schoolYearId: string) {
  // 1. Get all enrollments for this year
  const yearEnrollments = await Enrollment.find({ schoolYearId }).lean()
  
  // 2. Identify students assigned to a class
  const assignedStudentIds = new Set(
    yearEnrollments.filter(e => e.classId).map(e => e.studentId)
  )

  // 3. Identify students enrolled but NOT assigned (e.g. promoted)
  const enrolledUnassignedIds = yearEnrollments
    .filter(e => !e.classId)
    .map(e => e.studentId)

  // 4. Get students tagged with this schoolYearId (Legacy/Import)
  const taggedStudents = await Student.find({ schoolYearId }).lean()
  
  // 5. Filter tagged students: Exclude those who are already assigned to a class
  const validTaggedStudents = taggedStudents.filter(s => !assignedStudentIds.has(String(s._id)))
  
  // 6. Fetch students from step 3 who were not in step 4
  const taggedIds = new Set(validTaggedStudents.map(s => String(s._id)))
  const missingIds = enrolledUnassignedIds.filter(id => !taggedIds.has(id))
  
  let extraStudents: any[] = []
  if (missingIds.length > 0) {
      extraStudents = await Student.find({ _id: { $in: missingIds } }).lean()
  }

  const unassigned = [...validTaggedStudents, ...extraStudents]
  
  // Find assignments with promotions for these students
  const unassignedIds = unassigned.map(s => String(s._id))
  
  // Find previous school year to get previous class
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
      // Use nextLevel if available (staging), otherwise try promo.to (history), otherwise fallback to current level
      const effectiveLevel = s.nextLevel || (promo ? promo.to : s.level)
      
      return {
        ...s,
        level: effectiveLevel,
        promotion: promo,
        previousClassName: previousClassMap[String(s._id)]
      }
  }).filter(s => {
      // Filter out students promoted to EB1 as they leave the system
      const lvl = s.level ? s.level.toLowerCase() : ''
      return lvl !== 'eb1'
  })
}


