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
import { OutlookUser } from '../models/OutlookUser'
import { TemplateSignature } from '../models/TemplateSignature'
import { Student } from '../models/Student'
import { AdminSignature } from '../models/AdminSignature'
import { signTemplateAssignment, unsignTemplateAssignment } from '../services/signatureService'

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
        const [users, outlookUsers] = await Promise.all([
            User.find({ _id: { $in: teacherIds } }).lean(),
            OutlookUser.find({ _id: { $in: teacherIds } }).lean()
        ])
        const allTeachers = [...users, ...outlookUsers]
        const teacherMap = new Map(allTeachers.map(t => [String(t._id), t]))

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
            
            const clsTeacherAssignments = teacherAssignments.filter(ta => ta.classId === clsId)
            const clsTeachers = clsTeacherAssignments.map(ta => teacherMap.get(ta.teacherId)?.displayName || 'Unknown')

            // Categorize teachers
            const polyvalentTeachers: string[] = []
            const englishTeachers: string[] = []
            const arabicTeachers: string[] = []

            clsTeacherAssignments.forEach(ta => {
                const teacherName = teacherMap.get(ta.teacherId)?.displayName || 'Unknown'
                const langs = ta.languages || []

                if (ta.isProfPolyvalent) {
                    polyvalentTeachers.push(teacherName)
                } 
                
                if (langs.includes('ar')) {
                    arabicTeachers.push(teacherName)
                } 
                
                if (langs.includes('en')) {
                    englishTeachers.push(teacherName)
                }
            })

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
                teachersCheck: {
                    polyvalent: polyvalentTeachers,
                    english: englishTeachers,
                    arabic: arabicTeachers,
                    hasPolyvalent: polyvalentTeachers.length > 0,
                    hasEnglish: englishTeachers.length > 0,
                    hasArabic: arabicTeachers.length > 0
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
        const { message, duration } = req.body
        await SystemAlert.updateMany({}, { active: false }) // Deactivate old alerts
        if (message) {
            const alertData: any = {
                message,
                createdBy: (req as any).user.userId,
                active: true
            }
            if (duration && !isNaN(Number(duration))) {
                alertData.expiresAt = new Date(Date.now() + Number(duration) * 60 * 1000)
            }
            await SystemAlert.create(alertData)
        }
        res.json({ success: true })
    } catch (e) {
        res.status(500).json({ error: 'failed' })
    }
})

adminExtrasRouter.post('/alert/stop', requireAuth(['ADMIN']), async (req, res) => {
    try {
        await SystemAlert.updateMany({ active: true }, { active: false })
        res.json({ success: true })
    } catch (e) {
        res.status(500).json({ error: 'failed' })
    }
})

adminExtrasRouter.get('/alert', async (req, res) => {
    try {
        const alert = await SystemAlert.findOne({ active: true }).sort({ createdAt: -1 }).lean()

        if (alert && alert.expiresAt && new Date() > new Date(alert.expiresAt)) {
            await SystemAlert.updateOne({ _id: alert._id }, { active: false })
            return res.json(null)
        }

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

// Admin: Get ALL gradebooks for active year
adminExtrasRouter.get('/all-gradebooks', requireAuth(['ADMIN']), async (req, res) => {
    try {
        // Get active school year
        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
        if (!activeSchoolYear) {
            return res.json([])
        }

        // Get ALL classes for active year
        const classes = await ClassModel.find({ schoolYearId: activeSchoolYear._id }).lean()
        const classIds = classes.map(c => String(c._id))
        const classMap = new Map(classes.map(c => [String(c._id), c]))

        // Get ALL enrollments
        const enrollments = await Enrollment.find({ classId: { $in: classIds } }).lean()
        const studentIds = enrollments.map(e => e.studentId)
        const studentClassMap = new Map(enrollments.map(e => [String(e.studentId), String(e.classId)]))

        // Get ALL template assignments
        const templateAssignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
        }).lean()

        // Get signature information
        const assignmentIds = templateAssignments.map(a => String(a._id))
        const signatures = await TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } }).lean()
        const signatureMap = new Map()
        signatures.forEach(s => {
            if (!signatureMap.has(s.templateAssignmentId)) {
                signatureMap.set(s.templateAssignmentId, [])
            }
            signatureMap.get(s.templateAssignmentId).push(s)
        })

        // Enrich
        const enrichedAssignments = await Promise.all(templateAssignments.map(async (assignment) => {
            const template = await GradebookTemplate.findById(assignment.templateId).lean()
            const student = await Student.findById(assignment.studentId).lean()
            const assignmentSignatures = signatureMap.get(String(assignment._id)) || []
            const signature = assignmentSignatures.length > 0 ? assignmentSignatures[0] : null

            const classId = studentClassMap.get(String(assignment.studentId))
            const classInfo = classId ? classMap.get(classId) : null

            return {
                ...assignment,
                template,
                student,
                signature,
                signatures: assignmentSignatures,
                className: classInfo?.name,
                level: classInfo?.level,
            }
        }))

        res.json(enrichedAssignments)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Admin: Sign gradebook (Unrestricted)
adminExtrasRouter.post('/templates/:templateAssignmentId/sign', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const adminId = (req as any).user.userId
        const { templateAssignmentId } = req.params
        const { type = 'standard' } = req.body

        // Get active admin signature
        const activeSig = await AdminSignature.findOne({ isActive: true }).lean()

        try {
            const signature = await signTemplateAssignment({
                templateAssignmentId,
                signerId: adminId,
                type: type as any,
                signatureUrl: activeSig ? activeSig.dataUrl : undefined,
                req
            })
            res.json(signature)
        } catch (e: any) {
            if (e.message === 'already_signed') return res.status(400).json({ error: 'already_signed' })
            if (e.message === 'not_found') return res.status(404).json({ error: 'not_found' })
            throw e
        }
    } catch (e: any) {
        res.status(500).json({ error: 'sign_failed', message: e.message })
    }
})

// Admin: Unsign gradebook
adminExtrasRouter.delete('/templates/:templateAssignmentId/sign', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { templateAssignmentId } = req.params
        const { type } = req.body

        try {
            await unsignTemplateAssignment({
                templateAssignmentId,
                signerId: (req as any).user.userId,
                type,
                req
            })
            res.json({ success: true })
        } catch (e: any) {
            if (e.message === 'not_found') return res.status(404).json({ error: 'not_found' })
            throw e
        }
    } catch (e: any) {
        res.status(500).json({ error: 'unsign_failed', message: e.message })
    }
})

// Admin: Update assignment data (Unrestricted)
adminExtrasRouter.patch('/templates/:assignmentId/data', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { assignmentId } = req.params
        const { type, pageIndex, blockIndex, items, data } = req.body

        // Get assignment
        const assignment = await TemplateAssignment.findById(assignmentId)
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        if (type === 'language_toggle') {
            if (pageIndex === undefined || blockIndex === undefined || !items) {
                return res.status(400).json({ error: 'missing_payload' })
            }

            const key = `language_toggle_${pageIndex}_${blockIndex}`

            // Update assignment data
            if (!assignment.data) assignment.data = {}
            assignment.data[key] = items
            assignment.markModified('data')
            await assignment.save()

            return res.json({ success: true })
        } else if (data) {
            // Generic data update (for dropdowns etc)
            if (!assignment.data) assignment.data = {}
            for (const key in data) {
                assignment.data[key] = data[key]
            }
            assignment.markModified('data')
            await assignment.save()

            return res.json({ success: true })
        }

        res.status(400).json({ error: 'unknown_update_type' })
    } catch (e: any) {
        res.status(500).json({ error: 'update_failed', message: e.message })
    }
})

// Admin: Get gradebook review data (Unrestricted)
adminExtrasRouter.get('/templates/:templateAssignmentId/review', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const adminId = (req as any).user.userId
        const { templateAssignmentId } = req.params

        // Get the template assignment
        const assignment = await TemplateAssignment.findById(templateAssignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const student = await Student.findById(assignment.studentId).lean()

        const signature = await TemplateSignature.findOne({ templateAssignmentId, type: { $ne: 'end_of_year' } }).sort({ signedAt: -1 }).lean()
        const finalSignature = await TemplateSignature.findOne({ templateAssignmentId, type: 'end_of_year' }).lean()

        // Apply language toggles from assignment data
        const versionedTemplate = JSON.parse(JSON.stringify(template))
        if (assignment.data) {
            for (const [key, value] of Object.entries(assignment.data)) {
                if (key.startsWith('language_toggle_')) {
                    const parts = key.split('_')
                    if (parts.length >= 4) {
                        const pageIndex = parseInt(parts[2])
                        const blockIndex = parseInt(parts[3])
                        if (versionedTemplate.pages?.[pageIndex]?.blocks?.[blockIndex]?.props?.items) {
                            versionedTemplate.pages[pageIndex].blocks[blockIndex].props.items = value
                        }
                    }
                }
            }
        }

        // Check if signed by ME
        const isSignedByMe = !!(signature && String(signature.subAdminId) === String(adminId))

        // Get active semester
        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
        const activeSemester = activeSchoolYear?.activeSemester || 1

        // Check if promoted
        const isPromoted = student?.promotions?.some((p: any) => p.schoolYearId === String(activeSchoolYear?._id))

        // Enrich student with current class level and name for accurate display
        let level = student?.level || ''
        let className = ''
        if (student) {
            const enrollment = await Enrollment.findOne({ studentId: assignment.studentId, status: 'active' }).lean()
            if (enrollment && enrollment.classId) {
                const classDoc = await ClassModel.findById(enrollment.classId).lean()
                if (classDoc) {
                    level = classDoc.level || level
                    className = classDoc.name || ''
                }
            }
        }

        res.json({
            template: versionedTemplate,
            student: { ...student, level, className },
            assignment,
            signature,
            finalSignature,
            canEdit: true,
            isPromoted,
            isSignedByMe,
            activeSemester
        })
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})
