import { Router } from 'express'
import { requireAuth } from '../auth'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateChangeLog } from '../models/TemplateChangeLog'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { Student } from '../models/Student'
import { Enrollment } from '../models/Enrollment'
import { ClassModel } from '../models/Class'
import { logAudit } from '../utils/auditLogger'

export const teacherTemplatesRouter = Router()

// Teacher: Get classes assigned to logged-in teacher
teacherTemplatesRouter.get('/classes', requireAuth(['TEACHER']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const assignments = await TeacherClassAssignment.find({ teacherId }).lean()
        const classIds = assignments.map(a => a.classId)
        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()

        res.json(classes)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Teacher: Get students in assigned class
teacherTemplatesRouter.get('/classes/:classId/students', requireAuth(['TEACHER']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { classId } = req.params

        // Verify teacher is assigned to this class
        const assignment = await TeacherClassAssignment.findOne({ teacherId, classId }).lean()
        if (!assignment) return res.status(403).json({ error: 'not_assigned_to_class' })

        // Get students in class
        const enrollments = await Enrollment.find({ classId }).lean()
        const studentIds = enrollments.map(e => e.studentId)
        const students = await Student.find({ _id: { $in: studentIds } }).lean()

        res.json(students)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Teacher: Get templates for a student
teacherTemplatesRouter.get('/students/:studentId/templates', requireAuth(['TEACHER']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { studentId } = req.params

        // Get template assignments where this teacher is assigned
        const assignments = await TemplateAssignment.find({
            studentId,
            assignedTeachers: teacherId,
        }).lean()

        // Fetch template details
        const templateIds = assignments.map(a => a.templateId)
        const templates = await GradebookTemplate.find({ _id: { $in: templateIds } }).lean()

        // Combine assignment data with template data
        const result = assignments.map(assignment => {
            const template = templates.find(t => String(t._id) === assignment.templateId)
            return {
                ...assignment,
                template,
            }
        })

        res.json(result)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Teacher: Get specific template assignment for editing
teacherTemplatesRouter.get('/template-assignments/:assignmentId', requireAuth(['TEACHER']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { assignmentId } = req.params

        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment.findById(assignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' })
        }

        // Get the template
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        if (!template) return res.status(404).json({ error: 'template_not_found' })

        // Get the specific version if available in history, otherwise use current
        let versionedTemplate = template
        if (assignment.templateVersion && assignment.templateVersion !== template.currentVersion) {
            const versionData = template.versionHistory?.find(v => v.version === assignment.templateVersion)
            if (versionData) {
                // Use the versioned data but keep the template ID and metadata
                versionedTemplate = {
                    ...template,
                    pages: versionData.pages,
                    variables: versionData.variables || {},
                    watermark: versionData.watermark,
                    _versionUsed: assignment.templateVersion,
                    _isOldVersion: assignment.templateVersion < (template.currentVersion || 1)
                }
            }
        }

        // Get the student
        const student = await Student.findById(assignment.studentId).lean()

        res.json({
            assignment,
            template: versionedTemplate,
            student,
        })
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Teacher: Edit only language_toggle in template
teacherTemplatesRouter.patch('/template-assignments/:assignmentId/language-toggle', requireAuth(['TEACHER']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { assignmentId } = req.params
        const { pageIndex, blockIndex, items } = req.body

        if (pageIndex === undefined || blockIndex === undefined || !items) {
            return res.status(400).json({ error: 'missing_payload' })
        }

        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment.findById(assignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' })
        }

        // Get the template
        const template = await GradebookTemplate.findById(assignment.templateId)
        if (!template) return res.status(404).json({ error: 'template_not_found' })

        // Verify the block is a language_toggle
        const page = template.pages[pageIndex]
        if (!page) return res.status(400).json({ error: 'invalid_page_index' })

        const block = page.blocks[blockIndex]
        if (!block) return res.status(400).json({ error: 'invalid_block_index' })

        if (block.type !== 'language_toggle') {
            return res.status(403).json({ error: 'can_only_edit_language_toggle' })
        }

        // Store before state for change log
        const before = { ...block.props }

        // Update the block
        template.pages[pageIndex].blocks[blockIndex].props.items = items
        template.updatedAt = new Date()
        await template.save()

        // Log the change
        await TemplateChangeLog.create({
            templateAssignmentId: assignmentId,
            teacherId,
            changeType: 'language_toggle',
            pageIndex,
            blockIndex,
            before,
            after: { items },
            timestamp: new Date(),
        })

        // Update assignment status if still draft
        if (assignment.status === 'draft') {
            await TemplateAssignment.findByIdAndUpdate(assignmentId, { status: 'in_progress' })
        }

        // Log audit
        const student = await Student.findById(assignment.studentId).lean()
        await logAudit({
            userId: teacherId,
            action: 'EDIT_TEMPLATE',
            details: {
                templateId: assignment.templateId,
                templateName: template.name,
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
                pageIndex,
                blockIndex,
            },
            req,
        })

        res.json({ ok: true, template })
    } catch (e: any) {
        res.status(500).json({ error: 'update_failed', message: e.message })
    }
})

// Teacher: Mark assignment as done
teacherTemplatesRouter.post('/templates/:assignmentId/mark-done', requireAuth(['TEACHER']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { assignmentId } = req.params

        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment.findById(assignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' })
        }

        // Update assignment
        const updated = await TemplateAssignment.findByIdAndUpdate(
            assignmentId,
            {
                isCompleted: true,
                completedAt: new Date(),
                completedBy: teacherId,
            },
            { new: true }
        )

        // Log audit
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const student = await Student.findById(assignment.studentId).lean()
        await logAudit({
            userId: teacherId,
            action: 'MARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
                templateId: assignment.templateId,
                templateName: template?.name,
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            },
            req,
        })

        res.json(updated)
    } catch (e: any) {
        res.status(500).json({ error: 'update_failed', message: e.message })
    }
})

// Teacher: Unmark assignment as done
teacherTemplatesRouter.post('/templates/:assignmentId/unmark-done', requireAuth(['TEACHER']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { assignmentId } = req.params

        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment.findById(assignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' })
        }

        // Update assignment
        const updated = await TemplateAssignment.findByIdAndUpdate(
            assignmentId,
            {
                isCompleted: false,
                completedAt: null,
                completedBy: null,
            },
            { new: true }
        )

        // Log audit
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const student = await Student.findById(assignment.studentId).lean()
        await logAudit({
            userId: teacherId,
            action: 'UNMARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
                templateId: assignment.templateId,
                templateName: template?.name,
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            },
            req,
        })

        res.json(updated)
    } catch (e: any) {
        res.status(500).json({ error: 'update_failed', message: e.message })
    }
})

// Teacher: Get all template assignments for a class with completion stats
teacherTemplatesRouter.get('/classes/:classId/assignments', requireAuth(['TEACHER']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { classId } = req.params

        // Verify teacher is assigned to this class
        const classAssignment = await TeacherClassAssignment.findOne({ teacherId, classId }).lean()
        if (!classAssignment) return res.status(403).json({ error: 'not_assigned_to_class' })

        // Get students in class
        const enrollments = await Enrollment.find({ classId }).lean()
        const studentIds = enrollments.map(e => e.studentId)

        // Get all template assignments for these students where teacher is assigned
        const assignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            assignedTeachers: teacherId,
        }).lean()

        // Enrich with template and student data
        const enriched = await Promise.all(assignments.map(async (assignment) => {
            const template = await GradebookTemplate.findById(assignment.templateId).lean()
            const student = await Student.findById(assignment.studentId).lean()

            return {
                ...assignment,
                template,
                student,
            }
        }))

        res.json(enriched)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Teacher: Get completion statistics for a class
teacherTemplatesRouter.get('/classes/:classId/completion-stats', requireAuth(['TEACHER']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { classId } = req.params

        // Verify teacher is assigned to this class
        const classAssignment = await TeacherClassAssignment.findOne({ teacherId, classId }).lean()
        if (!classAssignment) return res.status(403).json({ error: 'not_assigned_to_class' })

        // Get students in class
        const enrollments = await Enrollment.find({ classId }).lean()
        const studentIds = enrollments.map(e => e.studentId)

        // Get all template assignments for these students where teacher is assigned
        const assignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            assignedTeachers: teacherId,
        }).lean()

        // Calculate stats per template
        const templateStats = new Map<string, { templateId: string; templateName: string; total: number; completed: number }>()

        for (const assignment of assignments) {
            const key = assignment.templateId
            if (!templateStats.has(key)) {
                const template = await GradebookTemplate.findById(assignment.templateId).lean()
                templateStats.set(key, {
                    templateId: assignment.templateId,
                    templateName: template?.name || 'Unknown',
                    total: 0,
                    completed: 0,
                })
            }

            const stats = templateStats.get(key)!
            stats.total++
            if (assignment.isCompleted) {
                stats.completed++
            }
        }

        // Calculate overall stats
        const totalAssignments = assignments.length
        const completedAssignments = assignments.filter(a => a.isCompleted).length
        const completionPercentage = totalAssignments > 0 ? Math.round((completedAssignments / totalAssignments) * 100) : 0

        res.json({
            totalAssignments,
            completedAssignments,
            completionPercentage,
            byTemplate: Array.from(templateStats.values()),
        })
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})
