import { Router } from 'express'
import { requireAuth } from '../auth'
import { User } from '../models/User'
import { ClassModel } from '../models/Class'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { SchoolYear } from '../models/SchoolYear'
import { Enrollment } from '../models/Enrollment'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { SystemAlert } from '../models/SystemAlert'
import { RoleScope } from '../models/RoleScope'
import { SubAdminAssignment } from '../models/SubAdminAssignment'

export const adminExtrasRouter = Router()

// 1. Progress (All Classes)
adminExtrasRouter.get('/progress', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const activeYear = await SchoolYear.findOne({ active: true }).lean()
        if (!activeYear) return res.status(400).json({ error: 'no_active_year' })

        // --- Classes Progress ---
        const classes = await ClassModel.find({ schoolYearId: String(activeYear._id) }).lean()
        
        const classIds = classes.map(c => String(c._id))

        const teacherAssignments = await TeacherClassAssignment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean()

        const teacherIds = [...new Set(teacherAssignments.map(ta => ta.teacherId))]
        const teachers = await User.find({ _id: { $in: teacherIds } }).lean()
        const teacherMap = new Map(teachers.map(t => [String(t._id), t]))

        const enrollments = await Enrollment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean()
        
        const studentIds = enrollments.map(e => e.studentId)

        const assignments = await TemplateAssignment.find({
            studentId: { $in: studentIds }
        }).lean()

        const templateIds = [...new Set(assignments.map(a => a.templateId))]
        const templates = await GradebookTemplate.find({ _id: { $in: templateIds } }).lean()
        
        const classesResult = classes.map(cls => {
            const clsId = String(cls._id)
            const clsTeachers = teacherAssignments
                .filter(ta => ta.classId === clsId)
                .map(ta => teacherMap.get(ta.teacherId)?.displayName || 'Unknown')
            
            const clsEnrollments = enrollments.filter(e => e.classId === clsId)
            const clsStudentIds = new Set(clsEnrollments.map(e => e.studentId))
            
            const clsAssignments = assignments.filter(a => clsStudentIds.has(a.studentId))

            let totalCompetencies = 0
            let filledCompetencies = 0
            const categoryStats: Record<string, { total: number, filled: number, name: string }> = {}

            clsAssignments.forEach(assignment => {
                const templateId = assignment.templateId
                const template = templates.find(t => String(t._id) === templateId)
                if (!template) return

                const assignmentData = assignment.data || {}
                const level = cls.level 

                template.pages.forEach((page: any, pageIdx: number) => {
                    (page.blocks || []).forEach((block: any, blockIdx: number) => {
                        if (block.type === 'language_toggle') {
                            const key = `language_toggle_${pageIdx}_${blockIdx}`
                            const overrideItems = assignmentData[key]
                            const items = overrideItems || block.props.items || []
                            
                            items.forEach((item: any) => {
                                let isAssigned = true
                                if (item.levels && Array.isArray(item.levels) && item.levels.length > 0) {
                                    if (!level || !item.levels.includes(level)) {
                                        isAssigned = false
                                    }
                                }
                                
                                if (isAssigned) {
                                    const lang = item.type || item.label || 'Autre'
                                    if (!categoryStats[lang]) categoryStats[lang] = { total: 0, filled: 0, name: lang }
                                    categoryStats[lang].total++
                                    totalCompetencies++
                                    if (item.active) {
                                        categoryStats[lang].filled++
                                        filledCompetencies++
                                    }
                                }
                            })
                        }
                    })
                })
            })

            return {
                classId: clsId,
                className: cls.name,
                level: cls.level,
                teachers: clsTeachers,
                studentCount: clsStudentIds.size,
                progress: {
                    total: totalCompetencies,
                    filled: filledCompetencies,
                    percentage: totalCompetencies > 0 ? Math.round((filledCompetencies / totalCompetencies) * 100) : 0
                },
                byCategory: Object.values(categoryStats).map(stat => ({
                    name: stat.name,
                    total: stat.total,
                    filled: stat.filled,
                    percentage: stat.total > 0 ? Math.round((stat.filled / stat.total) * 100) : 0
                }))
            }
        })

        // --- Sub-Admin Progress ---
        const subAdmins = await User.find({ role: 'SUBADMIN' }).lean()
        const subAdminProgress = await Promise.all(subAdmins.map(async (sa) => {
            const saId = String(sa._id)
            
            // Get assigned levels from RoleScope
            const scope = await RoleScope.findOne({ userId: saId }).lean()
            const assignedLevels = scope?.levels || []

            // Get directly assigned teachers
            const directAssignments = await SubAdminAssignment.find({ subAdminId: saId }).lean()
            const assignedTeacherIds = directAssignments.map(da => da.teacherId)

            // Find classes matching levels OR teachers
            // 1. By Level
            const levelClasses = await ClassModel.find({ 
                level: { $in: assignedLevels },
                schoolYearId: String(activeYear._id)
            }).lean()
            
            // 2. By Teacher
            const teacherClassesAssignments = await TeacherClassAssignment.find({
                teacherId: { $in: assignedTeacherIds },
                schoolYearId: String(activeYear._id)
            }).lean()
            const teacherClassIds = teacherClassesAssignments.map(tca => tca.classId)
            const teacherClasses = await ClassModel.find({ _id: { $in: teacherClassIds } }).lean()

            // Merge unique classes
            const allRelevantClasses = [...levelClasses, ...teacherClasses]
            const uniqueClassIds = [...new Set(allRelevantClasses.map(c => String(c._id)))]

            // Find students in these classes
            const saEnrollments = await Enrollment.find({
                classId: { $in: uniqueClassIds },
                schoolYearId: String(activeYear._id)
            }).lean()
            const saStudentIds = saEnrollments.map(e => e.studentId)

            // Find assignments for these students
            const saAssignments = await TemplateAssignment.find({
                studentId: { $in: saStudentIds }
            }).lean()

            const totalAssignments = saAssignments.length
            const signedAssignments = saAssignments.filter(a => {
                const anyA = a as any
                return anyA.signatures && anyA.signatures.some((s: any) => s.signedBy === saId)
            }).length

            return {
                subAdminId: saId,
                displayName: sa.displayName,
                assignedLevels,
                assignedTeacherCount: assignedTeacherIds.length,
                totalStudents: saStudentIds.length,
                totalAssignments,
                signedAssignments,
                percentage: totalAssignments > 0 ? Math.round((signedAssignments / totalAssignments) * 100) : 0
            }
        }))

        res.json({ classes: classesResult, subAdmins: subAdminProgress })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to fetch progress' })
    }
})

// 2. Online Users
adminExtrasRouter.get('/online-users', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
        const users = await User.find({ lastActive: { $gte: fiveMinutesAgo } }).select('displayName role lastActive email').lean()
        res.json(users)
    } catch (e) {
        res.status(500).json({ error: 'failed' })
    }
})

// 3. Alerts
adminExtrasRouter.post('/alert', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { message } = req.body
        await SystemAlert.updateMany({}, { active: false }) // Deactivate old alerts
        if (message) {
            await SystemAlert.create({ message, createdBy: (req as any).user.userId })
        }
        res.json({ success: true })
    } catch (e) {
        res.status(500).json({ error: 'failed' })
    }
})

adminExtrasRouter.get('/alert', async (req, res) => {
    try {
        const alert = await SystemAlert.findOne({ active: true }).sort({ createdAt: -1 }).lean()
        res.json(alert)
    } catch (e) {
        res.status(500).json({ error: 'failed' })
    }
})

// 4. Logout All
adminExtrasRouter.post('/logout-all', requireAuth(['ADMIN']), async (req, res) => {
    try {
        // Increment tokenVersion for all non-admins
        await User.updateMany({ role: { $ne: 'ADMIN' } }, { $inc: { tokenVersion: 1 } })
        res.json({ success: true })
    } catch (e) {
        res.status(500).json({ error: 'failed' })
    }
})

// 5. Permissions
adminExtrasRouter.get('/subadmins', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const subadmins = await User.find({ role: 'SUBADMIN' }).select('displayName email bypassScopes').lean()
        res.json(subadmins)
    } catch (e) {
        res.status(500).json({ error: 'failed' })
    }
})

adminExtrasRouter.post('/permissions', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { userId, bypassScopes } = req.body
        await User.findByIdAndUpdate(userId, { bypassScopes })
        res.json({ success: true })
    } catch (e) {
        res.status(500).json({ error: 'failed' })
    }
})
