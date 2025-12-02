import { Router } from 'express'
import { requireAuth } from '../auth'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { Student } from '../models/Student'
import { User } from '../models/User'
import { Enrollment } from '../models/Enrollment'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { ClassModel } from '../models/Class'

export const templateAssignmentsRouter = Router()

// Admin: Assign template to all students in a level
templateAssignmentsRouter.post('/bulk-level', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { templateId, level } = req.body
        if (!templateId || !level) return res.status(400).json({ error: 'missing_payload' })

        // Verify template exists
        const template = await GradebookTemplate.findById(templateId).lean()
        if (!template) return res.status(404).json({ error: 'template_not_found' })

        // Find all classes in this level
        const classes = await ClassModel.find({ level }).lean()
        const classIds = classes.map(c => String(c._id))

        if (classIds.length === 0) {
            return res.json({ count: 0, message: 'No classes found for this level' })
        }

        // Find all students in these classes
        const enrollments = await Enrollment.find({ classId: { $in: classIds } }).lean()
        const studentIds = [...new Set(enrollments.map(e => e.studentId))]

        if (studentIds.length === 0) {
            return res.json({ count: 0, message: 'No students found for this level' })
        }

        // Pre-fetch teacher assignments for all classes involved
        const allTeacherAssignments = await TeacherClassAssignment.find({ classId: { $in: classIds } }).lean()
        const teacherMap = new Map<string, string[]>() // classId -> teacherIds[]
        
        for (const ta of allTeacherAssignments) {
            if (!teacherMap.has(ta.classId)) teacherMap.set(ta.classId, [])
            teacherMap.get(ta.classId)?.push(ta.teacherId)
        }

        // Create assignments
        let count = 0
        for (const enrollment of enrollments) {
            const teachers = teacherMap.get(enrollment.classId) || []
            
            await TemplateAssignment.findOneAndUpdate(
                { templateId, studentId: enrollment.studentId },
                {
                    templateId,
                    templateVersion: template.currentVersion || 1,
                    studentId: enrollment.studentId,
                    assignedTeachers: teachers,
                    assignedBy: (req as any).user.userId,
                    assignedAt: new Date(),
                    status: 'draft',
                },
                { upsert: true }
            )
            count++
        }

        res.json({ count, message: `Assigned template to ${count} students` })
    } catch (e: any) {
        res.status(500).json({ error: 'bulk_assign_failed', message: e.message })
    }
})

// Admin: Assign template to student with teachers
templateAssignmentsRouter.post('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { templateId, studentId, assignedTeachers } = req.body
        if (!templateId || !studentId) return res.status(400).json({ error: 'missing_payload' })

        // Verify template exists
        const template = await GradebookTemplate.findById(templateId).lean()
        if (!template) return res.status(404).json({ error: 'template_not_found' })

        // Verify student exists
        const student = await Student.findById(studentId).lean()
        if (!student) return res.status(404).json({ error: 'student_not_found' })

        // Verify all assigned teachers exist and have TEACHER role
        let teachersToAssign = assignedTeachers || []
        
        // If no teachers are explicitly assigned, try to auto-assign teachers from the student's class
        if (!teachersToAssign || teachersToAssign.length === 0) {
            // Find student's enrollment to get their class
            const enrollment = await Enrollment.findOne({ studentId }).lean()
            if (enrollment && enrollment.classId) {
                // Find teachers assigned to this class
                const teacherAssignments = await TeacherClassAssignment.find({ classId: enrollment.classId }).lean()
                teachersToAssign = teacherAssignments.map(ta => ta.teacherId)
            }
        }
        
        // Verify all assigned teachers exist and have TEACHER role
        if (teachersToAssign && Array.isArray(teachersToAssign) && teachersToAssign.length > 0) {
            for (const teacherId of teachersToAssign) {
                const teacher = await User.findById(teacherId).lean()
                if (!teacher || teacher.role !== 'TEACHER') {
                    return res.status(400).json({ error: 'invalid_teacher', teacherId })
                }
            }
        }

        // Create or update assignment
        const assignment = await TemplateAssignment.findOneAndUpdate(
            { templateId, studentId },
            {
                templateId,
                templateVersion: template.currentVersion || 1,
                studentId,
                assignedTeachers: teachersToAssign,
                assignedBy: (req as any).user.userId,
                assignedAt: new Date(),
                status: 'draft',
            },
            { upsert: true, new: true }
        )

        res.json(assignment)
    } catch (e: any) {
        res.status(500).json({ error: 'create_failed', message: e.message })
    }
})

// Get templates for a student
templateAssignmentsRouter.get('/student/:studentId', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { studentId } = req.params
        const assignments = await TemplateAssignment.find({ studentId }).lean()

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

// Get all template assignments for a teacher
templateAssignmentsRouter.get('/teacher/:teacherId', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { teacherId } = req.params
        const assignments = await TemplateAssignment.find({ assignedTeachers: teacherId }).lean()

        // Fetch template and student details
        const templateIds = assignments.map(a => a.templateId)
        const studentIds = assignments.map(a => a.studentId)
        const templates = await GradebookTemplate.find({ _id: { $in: templateIds } }).lean()
        const students = await Student.find({ _id: { $in: studentIds } }).lean()

        // Combine data
        const result = assignments.map(assignment => {
            const template = templates.find(t => String(t._id) === assignment.templateId)
            const student = students.find(s => String(s._id) === assignment.studentId)
            return {
                ...assignment,
                template,
                student,
            }
        })

        res.json(result)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Update assignment status
templateAssignmentsRouter.patch('/:id/status', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    try {
        const { id } = req.params
        const { status } = req.body

        if (!['draft', 'in_progress', 'completed', 'signed'].includes(status)) {
            return res.status(400).json({ error: 'invalid_status' })
        }

        const assignment = await TemplateAssignment.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        )

        if (!assignment) return res.status(404).json({ error: 'not_found' })
        res.json(assignment)
    } catch (e: any) {
        res.status(500).json({ error: 'update_failed', message: e.message })
    }
})

// Admin: Delete assignment
templateAssignmentsRouter.delete('/:id', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params
        await TemplateAssignment.findByIdAndDelete(id)
        res.json({ ok: true })
    } catch (e: any) {
        res.status(500).json({ error: 'delete_failed', message: e.message })
    }
})

// Admin: Get all assignments
templateAssignmentsRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const assignments = await TemplateAssignment.find({}).lean()
        const templateIds = assignments.map(a => a.templateId)
        const studentIds = assignments.map(a => a.studentId)
        const templates = await GradebookTemplate.find({ _id: { $in: templateIds } }).lean()
        const students = await Student.find({ _id: { $in: studentIds } }).lean()
        
        // Fetch enrollments and classes
        const enrollments = await Enrollment.find({ studentId: { $in: studentIds } }).lean()
        const classIds = enrollments.map(e => e.classId)
        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
        
        const result = assignments.map(a => {
            const template = templates.find(t => String(t._id) === a.templateId)
            const student = students.find(s => String(s._id) === a.studentId)
            
            const enrollment = enrollments.find(e => e.studentId === a.studentId)
            const cls = enrollment ? classes.find(c => String(c._id) === enrollment.classId) : null

            return {
                ...a,
                templateName: template ? template.name : 'Unknown',
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
                className: cls ? cls.name : '',
                classId: cls ? cls._id : '',
                level: cls ? cls.level : ''
            }
        })
        res.json(result)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})
