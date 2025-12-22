import { Router } from 'express'
import { requireAuth } from '../auth'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { Student } from '../models/Student'
import { User } from '../models/User'
import { Enrollment } from '../models/Enrollment'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { ClassModel } from '../models/Class'
import { SchoolYear } from '../models/SchoolYear'

export const templateAssignmentsRouter = Router()

// Admin: Assign template to all students in a level
templateAssignmentsRouter.post('/bulk-level', requireAuth(['ADMIN']), async (req, res) => {
    try {
        console.log('[template-assignments] POST /bulk-level', { time: new Date().toISOString(), body: req.body, user: (req as any).user })
        const { templateId, level, schoolYearId } = req.body
        if (!templateId || !level) return res.status(400).json({ error: 'missing_payload' })

        // Verify template exists
        const template = await GradebookTemplate.findById(templateId).lean()
        if (!template) return res.status(404).json({ error: 'template_not_found' })

        let targetYearId = schoolYearId;
        if (!targetYearId) {
            // Find the active school year
            const activeYear = await SchoolYear.findOne({ active: true }).lean()
            if (!activeYear) return res.status(400).json({ error: 'no_active_year' })
            targetYearId = String(activeYear._id)
        }

        // Find all classes in this level for the active school year
        const classes = await ClassModel.find({ level, schoolYearId: targetYearId }).lean()
        const classIds = classes.map(c => String(c._id))

        if (classIds.length === 0) {
            return res.json({ count: 0, message: 'No classes found for this level in active year' })
        }

        // Find all students in these classes with active enrollments
        const enrollments = await Enrollment.find({ 
            classId: { $in: classIds },
            status: { $ne: 'archived' }
        }).lean()
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
        const enrollmentByStudent = new Map<string, any>()
        const statusPriority: Record<string, number> = { active: 3, promoted: 2, archived: 1 }
        const isBetterEnrollment = (candidate: any, current: any) => {
            if (!current) return true
            const candScore = (statusPriority[candidate?.status] ?? 0) - (candidate?.classId ? 0 : 1)
            const curScore = (statusPriority[current?.status] ?? 0) - (current?.classId ? 0 : 1)
            if (candScore !== curScore) return candScore > curScore
            return String(candidate?._id || '') > String(current?._id || '')
        }

        for (const e of enrollments) {
            const sid = String(e.studentId)
            const cur = enrollmentByStudent.get(sid)
            if (isBetterEnrollment(e, cur)) enrollmentByStudent.set(sid, e)
        }

        const now = new Date()
        const assignedBy = (req as any).user.userId
        const ops = Array.from(enrollmentByStudent.values()).map((enrollment: any) => {
            const teachers = (enrollment.classId && teacherMap.get(enrollment.classId)) || []
            return {
                updateOne: {
                    filter: { templateId, studentId: enrollment.studentId, completionSchoolYearId: String(targetYearId) },
                    update: {
                        $set: {
                            templateId,
                            templateVersion: template.currentVersion || 1,
                            studentId: enrollment.studentId,
                            assignedTeachers: teachers,
                            assignedBy,
                            assignedAt: now,
                            status: 'draft',
                            completionSchoolYearId: String(targetYearId),
                            isCompleted: false,
                            completedAt: null,
                            completedBy: null,
                            isCompletedSem1: false,
                            completedAtSem1: null,
                            isCompletedSem2: false,
                            completedAtSem2: null,
                            teacherCompletions: [],
                        },
                    },
                    upsert: true,
                },
            }
        })

        const chunkSize = 1000
        for (let i = 0; i < ops.length; i += chunkSize) {
            const chunk = ops.slice(i, i + chunkSize)
            if (chunk.length) await TemplateAssignment.bulkWrite(chunk, { ordered: false })
        }
        const count = ops.length

        res.json({ count, message: `Assigned template to ${count} students` })
    } catch (e: any) {
        res.status(500).json({ error: 'bulk_assign_failed', message: e.message })
    }
})

// Admin: Delete bulk level assignments
templateAssignmentsRouter.delete('/bulk-level/:templateId/:level', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { templateId, level } = req.params
        const { schoolYearId } = req.query
        
        let targetYearId = schoolYearId as string;
        if (!targetYearId) {
            // Find students in this level for active year
            const activeYear = await SchoolYear.findOne({ active: true }).lean()
            if (!activeYear) return res.status(400).json({ error: 'no_active_year' })
            targetYearId = String(activeYear._id)
        }

        const classes = await ClassModel.find({ level, schoolYearId: targetYearId }).lean()
        const classIds = classes.map(c => String(c._id))
        
        if (classIds.length === 0) return res.json({ ok: true, count: 0 })

        const enrollments = await Enrollment.find({ classId: { $in: classIds } }).lean()
        const studentIds = enrollments.map(e => e.studentId)

        if (studentIds.length === 0) return res.json({ ok: true, count: 0 })

        const result = await TemplateAssignment.deleteMany({
            templateId,
            studentId: { $in: studentIds },
            completionSchoolYearId: String(targetYearId)
        })

        res.json({ ok: true, count: result.deletedCount })
    } catch (e: any) {
        res.status(500).json({ error: 'delete_failed', message: e.message })
    }
})

// Admin: Assign template to student with teachers
templateAssignmentsRouter.post('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { templateId, studentId, assignedTeachers, schoolYearId } = req.body
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

        let targetYearId = schoolYearId
        if (!targetYearId) {
            const activeYear = await SchoolYear.findOne({ active: true }).lean()
            if (!activeYear) return res.status(400).json({ error: 'no_active_year' })
            targetYearId = String(activeYear._id)
        }

        // Create or update assignment
        const assignment = await TemplateAssignment.findOneAndUpdate(
            { templateId, studentId, completionSchoolYearId: String(targetYearId) },
            {
                templateId,
                templateVersion: template.currentVersion || 1,
                studentId,
                assignedTeachers: teachersToAssign,
                assignedBy: (req as any).user.userId,
                assignedAt: new Date(),
                status: 'draft',
                completionSchoolYearId: String(targetYearId),
                isCompleted: false,
                completedAt: null,
                completedBy: null,
                isCompletedSem1: false,
                completedAtSem1: null,
                isCompletedSem2: false,
                completedAtSem2: null,
                teacherCompletions: [],
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
        const user = (req as any).user

        if (!['draft', 'in_progress', 'completed', 'signed'].includes(status)) {
            return res.status(400).json({ error: 'invalid_status' })
        }

        // Retrieve existing assignment to check current state
        const assignment = await TemplateAssignment.findById(id).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        let newStatus = status
        let teacherCompletions = (assignment as any).teacherCompletions || []
        let isCompleted = assignment.isCompleted
        let completedAt = assignment.completedAt
        let completedBy = assignment.completedBy

        // Special handling for TEACHER role: only update their part
        if (user.role === 'TEACHER') {
            // Verify teacher is assigned
            if (assignment.assignedTeachers && assignment.assignedTeachers.includes(user.userId)) {
                const isMarkingDone = status === 'completed'
                
                // Update this teacher's completion status
                teacherCompletions = teacherCompletions.filter((tc: any) => tc.teacherId !== user.userId)
                
                teacherCompletions.push({
                    teacherId: user.userId,
                    completed: isMarkingDone,
                    completedAt: new Date()
                })

                // Check if ALL assigned teachers are done
                // If assignedTeachers is empty, this returns true, which is acceptable
                const allDone = assignment.assignedTeachers.every((tid: string) => 
                   teacherCompletions.some((tc: any) => tc.teacherId === tid && tc.completed)
                )

                if (allDone) {
                    newStatus = 'completed'
                    isCompleted = true
                    completedAt = new Date()
                    completedBy = user.userId // Last one to complete
                } else {
                    // If not all done, status should be in_progress
                    newStatus = 'in_progress'
                    isCompleted = false
                    completedAt = undefined
                    completedBy = undefined
                }
            }
        }

        const updated = await TemplateAssignment.findByIdAndUpdate(
            id,
            { 
                status: newStatus,
                teacherCompletions,
                isCompleted,
                completedAt,
                completedBy
            },
            { new: true }
        )

        res.json(updated)
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
        const { schoolYearId } = req.query
        
        let dateFilter: any = {}
        let studentIds: string[] = []
        let enrollments: any[] = []
        
        if (schoolYearId) {
            // We don't filter by date because assignments might be created before the school year starts (during setup)
            /*
            const sy = await SchoolYear.findById(schoolYearId).lean()
            if (sy) {
                dateFilter = {
                    assignedAt: {
                        $gte: sy.startDate,
                        $lte: sy.endDate
                    }
                }
            }
            */
            
            enrollments = await Enrollment.find({ schoolYearId }).lean()
            studentIds = enrollments.map(e => e.studentId)
        } else {
             // Fallback: get all enrollments (might be slow and incorrect for history)
             enrollments = await Enrollment.find({}).lean()
             // We don't filter assignments by date if no year specified
        }

        const query: any = { ...dateFilter }
        if (studentIds.length > 0) {
            query.studentId = { $in: studentIds }
        } else if (schoolYearId) {
            // If year specified but no students found, return empty
            return res.json([])
        }

        const assignments = await TemplateAssignment.find(query).lean()
        const templateIds = assignments.map(a => a.templateId)
        const assignmentStudentIds = assignments.map(a => a.studentId)
        
        const templates = await GradebookTemplate.find({ _id: { $in: templateIds } }).lean()
        const students = await Student.find({ _id: { $in: assignmentStudentIds } }).lean()
        
        // We already have enrollments for the year if schoolYearId is present.
        // If not, we need to fetch them.
        if (!schoolYearId) {
             enrollments = await Enrollment.find({ studentId: { $in: assignmentStudentIds } }).lean()
        }
        
        const classIds = enrollments.map(e => e.classId).filter(Boolean)
        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
        
        const result = assignments.map(a => {
            const template = templates.find(t => String(t._id) === a.templateId)
            const student = students.find(s => String(s._id) === a.studentId)
            
            // Find enrollment for this student
            // If schoolYearId is present, enrollments are already filtered by year.
            // If not, we might pick a random one.
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
