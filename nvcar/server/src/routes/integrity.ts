import { Router } from 'express'
import { requireAuth } from '../auth'
import { Student } from '../models/Student'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateSignature } from '../models/TemplateSignature'
import { SavedGradebook } from '../models/SavedGradebook'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { ErrorLog } from '../models/ErrorLog'

export const integrityRouter = Router()

const createIntegrityAlert = async (req: any, message: string, details: Record<string, any>) => {
  const userInfo = req?.user || {}
  const userId = String(userInfo.userId || userInfo.actualUserId || 'system')
  const role = String(userInfo.role || userInfo.actualRole || 'ADMIN')

  await ErrorLog.create({
    userId,
    role,
    actualUserId: userInfo.actualUserId,
    actualRole: userInfo.actualRole,
    displayName: userInfo.displayName,
    email: userInfo.email,
    source: 'integrity-monitor',
    method: 'GET',
    url: '/integrity/gradebook-students',
    status: 200,
    message,
    details,
  })
}

integrityRouter.get('/gradebook-students', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(1000, Math.floor(requestedLimit)) : 200

    const [
      students,
      templates,
      assignments,
      signatures,
      savedGradebooks,
      duplicateAssignmentsRaw,
    ] = await Promise.all([
      Student.find({}, '_id').lean(),
      GradebookTemplate.find({}, '_id').lean(),
      TemplateAssignment.find({}, '_id studentId templateId templateVersion status isCompleted isCompletedSem1 completedAtSem1 isCompletedSem2 completedAtSem2').lean(),
      TemplateSignature.find({}, '_id templateAssignmentId type signaturePeriodId').lean(),
      SavedGradebook.find({}, '_id studentId templateId schoolYearId meta').lean(),
      TemplateAssignment.aggregate([
        { $group: { _id: { templateId: '$templateId', studentId: '$studentId' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: limit }
      ])
    ])

    const studentIds = new Set(students.map(s => String((s as any)._id)))
    const templateIds = new Set(templates.map(t => String((t as any)._id)))
    const assignmentIds = new Set(assignments.map(a => String((a as any)._id)))

    const signatureAssignmentIdSet = new Set(signatures.map(s => String((s as any).templateAssignmentId || '')))

    const orphanAssignments = assignments
      .filter((assignment: any) => !studentIds.has(String(assignment.studentId)) || !templateIds.has(String(assignment.templateId)))
      .slice(0, limit)
      .map((assignment: any) => ({
        assignmentId: String(assignment._id),
        studentId: String(assignment.studentId || ''),
        templateId: String(assignment.templateId || ''),
        missingStudent: !studentIds.has(String(assignment.studentId)),
        missingTemplate: !templateIds.has(String(assignment.templateId)),
      }))

    const invalidTemplateVersion = assignments
      .filter((assignment: any) => {
        const version = Number(assignment.templateVersion)
        return !Number.isFinite(version) || version < 1
      })
      .slice(0, limit)
      .map((assignment: any) => ({
        assignmentId: String(assignment._id),
        templateVersion: assignment.templateVersion,
      }))

    const invalidSemesterConsistency = assignments
      .filter((assignment: any) => {
        const sem1Flag = Boolean(assignment.isCompletedSem1)
        const sem2Flag = Boolean(assignment.isCompletedSem2)
        const sem1Date = assignment.completedAtSem1 ? new Date(assignment.completedAtSem1) : null
        const sem2Date = assignment.completedAtSem2 ? new Date(assignment.completedAtSem2) : null

        const sem1Invalid = (!sem1Flag && !!sem1Date) || (sem1Flag && !sem1Date)
        const sem2Invalid = (!sem2Flag && !!sem2Date) || (sem2Flag && !sem2Date)

        return sem1Invalid || sem2Invalid
      })
      .slice(0, limit)
      .map((assignment: any) => ({
        assignmentId: String(assignment._id),
        isCompletedSem1: Boolean(assignment.isCompletedSem1),
        completedAtSem1: assignment.completedAtSem1 || null,
        isCompletedSem2: Boolean(assignment.isCompletedSem2),
        completedAtSem2: assignment.completedAtSem2 || null,
      }))

    const signedWithoutSignature = assignments
      .filter((assignment: any) => String(assignment.status || '') === 'signed' && !signatureAssignmentIdSet.has(String(assignment._id)))
      .slice(0, limit)
      .map((assignment: any) => ({
        assignmentId: String(assignment._id),
        status: assignment.status,
      }))

    const orphanSignatures = signatures
      .filter((signature: any) => !assignmentIds.has(String(signature.templateAssignmentId || '')))
      .slice(0, limit)
      .map((signature: any) => ({
        signatureId: String(signature._id),
        assignmentId: String(signature.templateAssignmentId || ''),
        type: signature.type || 'standard',
        signaturePeriodId: signature.signaturePeriodId || null,
      }))

    const orphanSavedGradebooks = savedGradebooks
      .filter((entry: any) => !studentIds.has(String(entry.studentId || '')) || (entry.templateId && !templateIds.has(String(entry.templateId))))
      .slice(0, limit)
      .map((entry: any) => ({
        savedGradebookId: String(entry._id),
        studentId: String(entry.studentId || ''),
        templateId: String(entry.templateId || ''),
        schoolYearId: String(entry.schoolYearId || ''),
        missingStudent: !studentIds.has(String(entry.studentId || '')),
        missingTemplate: !!entry.templateId && !templateIds.has(String(entry.templateId)),
      }))

    const duplicateAssignments = duplicateAssignmentsRaw.map((group: any) => ({
      templateId: String(group?._id?.templateId || ''),
      studentId: String(group?._id?.studentId || ''),
      count: Number(group?.count || 0),
      assignmentIds: Array.isArray(group?.ids) ? group.ids.map((id: any) => String(id)) : []
    }))

    const checks = {
      duplicateAssignments,
      orphanAssignments,
      invalidTemplateVersion,
      invalidSemesterConsistency,
      signedWithoutSignature,
      orphanSignatures,
      orphanSavedGradebooks,
    }

    const totalIssues = Object.values(checks).reduce((sum, arr) => sum + arr.length, 0)
    const criticalIssues = duplicateAssignments.length + orphanAssignments.length + signedWithoutSignature.length + orphanSignatures.length

    if (criticalIssues > 0) {
      await createIntegrityAlert(
        req,
        `Integrity check detected ${criticalIssues} critical issue(s)`,
        {
          generatedAt: new Date().toISOString(),
          criticalIssues,
          totalIssues,
          checkCounts: Object.fromEntries(Object.entries(checks).map(([key, list]) => [key, list.length])),
          limit,
        }
      )
    }

    res.json({
      generatedAt: new Date().toISOString(),
      limit,
      summary: {
        students: students.length,
        templates: templates.length,
        assignments: assignments.length,
        signatures: signatures.length,
        savedGradebooks: savedGradebooks.length,
        totalIssues,
        criticalIssues,
        warnings: totalIssues - criticalIssues,
      },
      checks,
    })
  } catch (error: any) {
    console.error('Integrity check failed:', error)
    try {
      await createIntegrityAlert(req, 'Integrity check execution failed', {
        error: error?.message || 'Unexpected integrity check error',
      })
    } catch (logError) {
      console.error('Integrity alert creation failed:', logError)
    }
    res.status(500).json({ error: 'integrity_check_failed', message: error?.message || 'Unexpected integrity check error' })
  }
})
