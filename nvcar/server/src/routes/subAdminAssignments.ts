import { Router } from 'express'
import { requireAuth } from '../auth'
import { SubAdminAssignment } from '../models/SubAdminAssignment'
import { User } from '../models/User'
import { OutlookUser } from '../models/OutlookUser'
import { ClassModel } from '../models/Class'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { RoleScope } from '../models/RoleScope'
import { SchoolYear } from '../models/SchoolYear'
import { Enrollment } from '../models/Enrollment'
import { Student } from '../models/Student'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { Competency } from '../models/Competency'
import { CompetencyVisibilityRule } from '../models/CompetencyVisibilityRule'
import { StudentCompetencyStatus } from '../models/StudentCompetencyStatus'

export const subAdminAssignmentsRouter = Router()

// SubAdmin: Get student progress for assigned levels
subAdminAssignmentsRouter.get('/progress', requireAuth(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        
        // Get assigned levels from RoleScope
        const scope = await RoleScope.findOne({ userId: subAdminId }).lean()
        if (!scope || !scope.levels || scope.levels.length === 0) {
            return res.json([])
        }
        
        const levels = scope.levels

        // Get active school year
        const activeYear = await SchoolYear.findOne({ active: true }).lean()
        if (!activeYear) {
            return res.status(400).json({ error: 'no_active_year' })
        }

        // Find classes in these levels for the active year
        const classes = await ClassModel.find({ 
            level: { $in: levels },
            schoolYearId: String(activeYear._id)
        }).lean()
        
        const classIds = classes.map(c => String(c._id))
        
        if (classIds.length === 0) {
            return res.json([])
        }

        // Find enrollments
        const enrollments = await Enrollment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean()
        
        const studentIds = enrollments.map(e => e.studentId)
        
        if (studentIds.length === 0) {
            return res.json([])
        }

        // Find completed assignments (Carnet Done)
        const completedAssignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            isCompleted: true
        }).lean()
        
        const completedStudentIds = new Set(completedAssignments.map(a => a.studentId))
        
        // Filter students
        const students = await Student.find({ _id: { $in: Array.from(completedStudentIds) } }).lean()
        
        // Fetch templates used in assignments
        const templateIds = [...new Set(completedAssignments.map(a => a.templateId))]
        const templates = await GradebookTemplate.find({ _id: { $in: templateIds } }).lean()
        const templateMap = new Map(templates.map(t => [String(t._id), t]))

        const result = students.map(student => {
            const studentLevel = student.level || 'Unknown'
            const enrollment = enrollments.find(e => e.studentId === String(student._id))
            const cls = classes.find(c => String(c._id) === enrollment?.classId)
            const level = cls?.level || studentLevel
            
            // Find the assignment for this student
            const assignment = completedAssignments.find(a => a.studentId === String(student._id))
            const template = assignment ? templateMap.get(assignment.templateId) : null
            
            let totalAvailable = 0
            let activeCount = 0

            if (template && assignment) {
                const assignmentData = assignment.data || {}
                
                // Iterate through all pages and blocks to find language_toggle
                template.pages.forEach((page: any, pageIdx: number) => {
                    (page.blocks || []).forEach((block: any, blockIdx: number) => {
                        if (block.type === 'language_toggle') {
                            // Check for override in assignment data
                            const key = `language_toggle_${pageIdx}_${blockIdx}`
                            const overrideItems = assignmentData[key]
                            
                            const items = overrideItems || block.props.items || []
                            
                            items.forEach((item: any) => {
                                // Check if item is assigned to student's level
                                let isAssigned = true
                                if (item.levels && Array.isArray(item.levels) && item.levels.length > 0) {
                                    if (!level || !item.levels.includes(level)) {
                                        isAssigned = false
                                    }
                                }
                                
                                if (isAssigned) {
                                    totalAvailable++
                                    if (item.active) activeCount++
                                }
                            })
                        }
                    })
                })
            }

            return {
                _id: student._id,
                firstName: student.firstName,
                lastName: student.lastName,
                level,
                className: cls?.name,
                activeCount,
                totalAvailable
            }
        })

        res.json(result)

    } catch (e: any) {
        console.error(e)
        res.status(500).json({ error: 'fetch_progress_failed', message: e.message })
    }
})

// Admin: Assign sub-admin to all teachers in a level
subAdminAssignmentsRouter.post('/bulk-level', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { subAdminId, level } = req.body
        if (!subAdminId || !level) return res.status(400).json({ error: 'missing_payload' })

        // Verify sub-admin exists
        let subAdmin = await User.findById(subAdminId).lean() as any
        if (!subAdmin) {
            subAdmin = await OutlookUser.findById(subAdminId).lean()
        }

        if (!subAdmin || subAdmin.role !== 'SUBADMIN') {
            return res.status(400).json({ error: 'invalid_subadmin' })
        }

        // Find the active school year
        const activeYear = await SchoolYear.findOne({ active: true }).lean()
        if (!activeYear) return res.status(400).json({ error: 'no_active_year' })

        // Find all classes in this level for the active school year
        const classes = await ClassModel.find({ level, schoolYearId: String(activeYear._id) }).lean()
        const classIds = classes.map(c => String(c._id))

        if (classIds.length === 0) {
            return res.json({ count: 0, message: 'No classes found for this level in active year' })
        }

        // Find all teachers assigned to these classes
        const teacherAssignments = await TeacherClassAssignment.find({ classId: { $in: classIds } }).lean()
        const teacherIds = [...new Set(teacherAssignments.map(ta => ta.teacherId))]

        if (teacherIds.length === 0) {
            return res.json({ count: 0, message: 'No teachers found for this level' })
        }

        // Create assignments
        let count = 0
        for (const teacherId of teacherIds) {
            await SubAdminAssignment.findOneAndUpdate(
                { subAdminId, teacherId },
                {
                    subAdminId,
                    teacherId,
                    assignedBy: (req as any).user.userId,
                    assignedAt: new Date(),
                },
                { upsert: true }
            )
            count++
        }

        // Also update RoleScope to persist the level assignment
        await RoleScope.findOneAndUpdate(
            { userId: subAdminId },
            { $addToSet: { levels: level } },
            { upsert: true, new: true }
        )

        res.json({ count, message: `Assigned ${count} teachers to sub-admin` })
    } catch (e: any) {
        res.status(500).json({ error: 'bulk_assign_failed', message: e.message })
    }
})

// Admin: Assign teachers to sub-admin
subAdminAssignmentsRouter.post('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { subAdminId, teacherId } = req.body
        if (!subAdminId || !teacherId) return res.status(400).json({ error: 'missing_payload' })

        // Verify sub-admin exists and has SUBADMIN role
        let subAdmin = await User.findById(subAdminId).lean() as any
        if (!subAdmin) {
            subAdmin = await OutlookUser.findById(subAdminId).lean()
        }

        if (!subAdmin || subAdmin.role !== 'SUBADMIN') {
            return res.status(400).json({ error: 'invalid_subadmin' })
        }

        // Verify teacher exists and has TEACHER role
        let teacher = await User.findById(teacherId).lean() as any
        if (!teacher) {
            teacher = await OutlookUser.findById(teacherId).lean()
        }

        if (!teacher || teacher.role !== 'TEACHER') {
            return res.status(400).json({ error: 'invalid_teacher' })
        }

        // Create or update assignment
        const assignment = await SubAdminAssignment.findOneAndUpdate(
            { subAdminId, teacherId },
            {
                subAdminId,
                teacherId,
                assignedBy: (req as any).user.userId,
                assignedAt: new Date(),
            },
            { upsert: true, new: true }
        )

        res.json(assignment)
    } catch (e: any) {
        res.status(500).json({ error: 'create_failed', message: e.message })
    }
})

// Get teachers for a sub-admin
subAdminAssignmentsRouter.get('/subadmin/:subAdminId', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const { subAdminId } = req.params
        const assignments = await SubAdminAssignment.find({ subAdminId }).lean()
        const teacherIds = assignments.map(a => a.teacherId)
        
        const [teachers, outlookTeachers] = await Promise.all([
            User.find({ _id: { $in: teacherIds } }).lean(),
            OutlookUser.find({ _id: { $in: teacherIds } }).lean()
        ])
        
        const allTeachers = [...teachers, ...outlookTeachers]

        res.json(allTeachers)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Get all sub-admin level assignments
subAdminAssignmentsRouter.get('/levels', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const scopes = await RoleScope.find({ levels: { $exists: true, $not: { $size: 0 } } }).lean()
        
        const userIds = scopes.map(s => s.userId)
        const [users, outlookUsers] = await Promise.all([
            User.find({ _id: { $in: userIds } }).lean(),
            OutlookUser.find({ _id: { $in: userIds } }).lean()
        ])
        const allUsers = [...users, ...outlookUsers] as any[]

        const result = scopes.map(scope => {
            const user = allUsers.find(u => String(u._id) === scope.userId)
            return {
                subAdminId: scope.userId,
                subAdminName: user ? (user.displayName || user.email) : 'Unknown',
                levels: scope.levels
            }
        })
        
        res.json(result)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Remove a level assignment from a sub-admin
subAdminAssignmentsRouter.delete('/levels/:subAdminId/:level', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { subAdminId, level } = req.params
        await RoleScope.findOneAndUpdate(
            { userId: subAdminId },
            { $pull: { levels: level } }
        )
        res.json({ ok: true })
    } catch (e: any) {
        res.status(500).json({ error: 'delete_failed', message: e.message })
    }
})

// Admin: Delete assignment
subAdminAssignmentsRouter.delete('/:id', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params
        await SubAdminAssignment.findByIdAndDelete(id)
        res.json({ ok: true })
    } catch (e: any) {
        res.status(500).json({ error: 'delete_failed', message: e.message })
    }
})

// Admin: Get all assignments
subAdminAssignmentsRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const assignments = await SubAdminAssignment.find({}).lean()
        const subAdminIds = assignments.map(a => a.subAdminId)
        const teacherIds = assignments.map(a => a.teacherId)
        const allUserIds = [...new Set([...subAdminIds, ...teacherIds])]
        
        const [users, outlookUsers] = await Promise.all([
            User.find({ _id: { $in: allUserIds } }).lean(),
            OutlookUser.find({ _id: { $in: allUserIds } }).lean()
        ])
        
        const allUsers = [...users, ...outlookUsers] as any[]
        
        const result = assignments.map(a => {
            const subAdmin = allUsers.find(u => String(u._id) === a.subAdminId)
            const teacher = allUsers.find(u => String(u._id) === a.teacherId)
            return {
                ...a,
                subAdminName: subAdmin ? (subAdmin.displayName || subAdmin.email) : 'Unknown',
                teacherName: teacher ? (teacher.displayName || teacher.email) : 'Unknown'
            }
        })
        res.json(result)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})
