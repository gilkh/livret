import { Router } from 'express'
import { requireAuth } from '../auth'
import { ClassModel } from '../models/Class'
import { Enrollment } from '../models/Enrollment'
import { Student } from '../models/Student'
import { StudentCompetencyStatus } from '../models/StudentCompetencyStatus'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateSignature } from '../models/TemplateSignature'
import { SavedGradebook } from '../models/SavedGradebook'
import { logAudit } from '../utils/auditLogger'

export const classesRouter = Router()

classesRouter.get('/', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { schoolYearId } = req.query as any
  const list = await ClassModel.find(schoolYearId ? { schoolYearId } : {}).lean()
  res.json(list)
})

classesRouter.post('/', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { name, level, schoolYearId } = req.body
  if (!name || !schoolYearId) return res.status(400).json({ error: 'missing_payload' })
  const c = await ClassModel.create({ name, level, schoolYearId })
  res.json(c)
})

classesRouter.patch('/:id', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const c = await ClassModel.findByIdAndUpdate(id, req.body, { new: true })
  res.json(c)
})

// Simple delete - just removes the class (kept for backwards compatibility)
classesRouter.delete('/:id', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  await ClassModel.findByIdAndDelete(id)
  res.json({ ok: true })
})

// Delete class with all enrolled students and their data
classesRouter.delete('/:id/with-students', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const adminId = (req as any).user.userId

  try {
    const cls = await ClassModel.findById(id).lean()
    if (!cls) return res.status(404).json({ error: 'class_not_found' })

    // Find all enrollments for this class
    const enrollments = await Enrollment.find({ classId: id }).lean()
    const studentIds = enrollments.map(e => e.studentId)

    const results = {
      studentsDeleted: 0,
      enrollmentsDeleted: 0,
      errors: [] as any[]
    }

    // Delete all student data for students in this class
    for (const studentId of studentIds) {
      try {
        // Delete competency statuses
        await StudentCompetencyStatus.deleteMany({ studentId })

        // Get template assignments to delete related signatures
        const assignments = await TemplateAssignment.find({ studentId }).lean()
        const assignmentIds = assignments.map(a => String(a._id))
        await TemplateSignature.deleteMany({ templateAssignmentId: { $in: assignmentIds } })
        await TemplateAssignment.deleteMany({ studentId })

        // Delete saved gradebooks
        await SavedGradebook.deleteMany({ studentId })

        // Delete the student
        await Student.findByIdAndDelete(studentId)

        results.studentsDeleted++
      } catch (e: any) {
        results.errors.push({ studentId, error: e.message })
      }
    }

    // Delete all enrollments for this class
    const enrollResult = await Enrollment.deleteMany({ classId: id })
    results.enrollmentsDeleted = enrollResult.deletedCount || 0

    // Delete the class itself
    await ClassModel.findByIdAndDelete(id)

    await logAudit({
      userId: adminId,
      action: 'DELETE_CLASS',
      details: {
        classId: id,
        className: cls.name,
        level: cls.level,
        studentsDeleted: results.studentsDeleted,
        enrollmentsDeleted: results.enrollmentsDeleted,
        errors: results.errors.length
      },
      req
    })

    res.json(results)
  } catch (e: any) {
    console.error('Delete class with students error:', e)
    res.status(500).json({ error: 'delete_failed', message: e.message })
  }
})
