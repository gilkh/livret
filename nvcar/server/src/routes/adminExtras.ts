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
import { mergeAssignmentDataIntoTemplate } from '../utils/templateUtils'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'

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
            , status: { $ne: 'archived' }
        }).lean()

        const studentIds = enrollments.map(e => e.studentId)

        const assignments = await TemplateAssignment.find({
            studentId: { $in: studentIds }
        }).lean()

        const templateIds = [...new Set(assignments.map(a => a.templateId))]
        const templates = await GradebookTemplate.find({ _id: { $in: templateIds } }).lean()
        const templateMap = new Map(templates.map(t => [String((t as any)._id), t]))

        const teacherAssignmentsByClassId = new Map<string, any[]>()
        for (const ta of teacherAssignments) {
            const classId = String((ta as any).classId)
            if (!teacherAssignmentsByClassId.has(classId)) teacherAssignmentsByClassId.set(classId, [])
            teacherAssignmentsByClassId.get(classId)!.push(ta)
        }

        const studentToClassId = new Map<string, string>()
        for (const e of enrollments) {
            if (e.studentId && e.classId) studentToClassId.set(String(e.studentId), String(e.classId))
        }

        const assignmentsByClassId = new Map<string, any[]>()
        for (const a of assignments as any[]) {
            const classId = studentToClassId.get(String(a.studentId))
            if (!classId) continue
            if (!assignmentsByClassId.has(classId)) assignmentsByClassId.set(classId, [])
            assignmentsByClassId.get(classId)!.push(a)
        }

        const classesResult = classes.map(cls => {
            const clsId = String(cls._id)

            const clsTeacherAssignments = teacherAssignmentsByClassId.get(clsId) || []
            const clsTeachers = clsTeacherAssignments.map(ta => {
                const t = teacherMap.get(String((ta as any).teacherId)) as any
                return t?.displayName || t?.email || 'Unknown'
            })

            // Categorize teachers
            const polyvalentTeachers: string[] = []
            const englishTeachers: string[] = []
            const arabicTeachers: string[] = []

            clsTeacherAssignments.forEach(ta => {
                const t = teacherMap.get(String((ta as any).teacherId)) as any
                const teacherName = t?.displayName || t?.email || 'Unknown'
                const langs = ((ta as any).languages || []).map((l: string) => String(l).toLowerCase())

                if ((ta as any).isProfPolyvalent) {
                    polyvalentTeachers.push(teacherName)
                }

                if (langs.includes('ar') || langs.includes('lb')) {
                    arabicTeachers.push(teacherName)
                }

                if (langs.includes('en') || langs.includes('uk') || langs.includes('gb')) {
                    englishTeachers.push(teacherName)
                }
            })

            const clsEnrollments = enrollments.filter(e => String(e.classId) === clsId)
            const clsStudentIds = new Set(clsEnrollments.map(e => String(e.studentId)))
            const clsAssignments = assignmentsByClassId.get(clsId) || []

            let totalCompetencies = 0
            let filledCompetencies = 0
            const categoryStats: Record<string, { total: number, filled: number, name: string }> = {}

            clsAssignments.forEach(assignment => {
                const templateId = String((assignment as any).templateId)
                const template = templateMap.get(templateId) as any
                if (!template) return

                const assignmentData = (assignment as any).data || {}
                const level = cls.level
                const teacherCompletions = ((assignment as any).teacherCompletions || []) as any[]
                const completionMemo = new Map<string, boolean>()

                const isCategoryCompleted = (categoryName: string, langCode?: string) => {
                    const key = `${categoryName}|${langCode || ''}`
                    if (completionMemo.has(key)) return completionMemo.get(key)!

                    const l = categoryName.toLowerCase()
                    const code = (langCode || '').toLowerCase()
                    const isArabic = code === 'ar' || code === 'lb' || l.includes('arabe') || l.includes('arabic') || l.includes('العربية')
                    const isEnglish = code === 'en' || code === 'uk' || code === 'gb' || l.includes('anglais') || l.includes('english')

                    let responsibleTeachers = (clsTeacherAssignments as any[])
                        .filter((ta: any) => {
                            const langs = (ta.languages || []).map((tl: string) => String(tl).toLowerCase())
                            if (isArabic) {
                                if (langs.length === 0) return !ta.isProfPolyvalent
                                return langs.some((v: string) => v === 'ar' || v === 'lb' || v.includes('arabe') || v.includes('arabic') || v.includes('العربية'))
                            }
                            if (isEnglish) {
                                if (langs.length === 0) return !ta.isProfPolyvalent
                                return langs.some((v: string) => v === 'en' || v === 'uk' || v === 'gb' || v.includes('anglais') || v.includes('english'))
                            }
                            return !!ta.isProfPolyvalent
                        })
                        .map((ta: any) => String(ta.teacherId))

                    if (responsibleTeachers.length === 0) {
                        responsibleTeachers = (((assignment as any).assignedTeachers || []) as any[]).map(id => String(id))
                    }

                    const completed = responsibleTeachers.some(tid =>
                        teacherCompletions.some(tc =>
                            String(tc.teacherId) === String(tid) &&
                            (tc.completed || tc.completedSem1 || tc.completedSem2)
                        )
                    )

                    completionMemo.set(key, completed)
                    return completed
                }

                template.pages.forEach((page: any, pageIdx: number) => {
                    (page.blocks || []).forEach((block: any, blockIdx: number) => {
                        let itemsToProcess: any[] = []

                        if (['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                            const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null
                            const keyStable = blockId ? `language_toggle_${blockId}` : null
                            const keyLegacy = `language_toggle_${pageIdx}_${blockIdx}`
                            const overrideItems = (keyStable ? assignmentData[keyStable] : null) || assignmentData[keyLegacy]
                            itemsToProcess = overrideItems || block.props.items || []
                        } else if (block.type === 'table' && block.props.expandedRows) {
                            const rows = block.props.cells || []
                            const expandedLanguages = block.props.expandedLanguages || []
                            const rowLanguages = block.props.rowLanguages || {}
                            const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : []
                            const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null

                            rows.forEach((_: any, ri: number) => {
                                const rowId = typeof rowIds?.[ri] === 'string' && rowIds[ri].trim() ? rowIds[ri].trim() : null
                                const keyStable = blockId && rowId ? `table_${blockId}_row_${rowId}` : null
                                const keyLegacy1 = `table_${pageIdx}_${blockIdx}_row_${ri}`
                                const keyLegacy2 = `table_${blockIdx}_row_${ri}`
                                const rowLangs = rowLanguages[ri] || expandedLanguages
                                const currentItems = (keyStable ? assignmentData[keyStable] : null) || assignmentData[keyLegacy1] || assignmentData[keyLegacy2] || rowLangs || []
                                if (Array.isArray(currentItems)) {
                                    itemsToProcess.push(...currentItems)
                                }
                            })
                        }

                        if (itemsToProcess.length === 0) return

                        itemsToProcess.forEach((item: any) => {
                            let isAssigned = true
                            let itemLevels = item.levels && Array.isArray(item.levels) ? item.levels : []
                            if (itemLevels.length === 0 && item.level) itemLevels = [item.level]

                            if (itemLevels.length > 0) {
                                if (!level || !itemLevels.includes(level)) {
                                    isAssigned = false
                                }
                            }

                            if (!isAssigned) return

                            const code = (item.code || '').toLowerCase()
                            const rawLang = item.type || item.label || ''
                            const lang = (() => {
                                const ll = String(rawLang).toLowerCase()
                                if (code === 'fr' || ll.includes('français') || ll.includes('french')) return 'Polyvalent'
                                if (code === 'ar' || code === 'lb' || ll.includes('arabe') || ll.includes('arabic') || ll.includes('العربية')) return 'Arabe'
                                if (code === 'en' || code === 'uk' || code === 'gb' || ll.includes('anglais') || ll.includes('english')) return 'Anglais'
                                return 'Autre'
                            })()

                            if (!categoryStats[lang]) categoryStats[lang] = { total: 0, filled: 0, name: lang }

                            categoryStats[lang].total++
                            totalCompetencies++

                            if (isCategoryCompleted(lang, code) || item.active) {
                                categoryStats[lang].filled++
                                filledCompetencies++
                            }
                        })
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
            const assignedTeacherIds = [...new Set(directAssignments.map(da => String(da.teacherId)))]

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
                , status: { $ne: 'archived' }
            }).lean()
            const saStudentIds = [...new Set(saEnrollments.map(e => String(e.studentId)))]

            // Find assignments for these students
            const saAssignments = await TemplateAssignment.find({
                studentId: { $in: saStudentIds }
            }).lean()

            const totalAssignments = saAssignments.length
            const saAssignmentIds = saAssignments.map(a => String((a as any)._id))
            const signatures = saAssignmentIds.length
                ? await TemplateSignature.find({ templateAssignmentId: { $in: saAssignmentIds }, subAdminId: saId }).lean()
                : []
            const signedAssignments = new Set(signatures.map(s => String((s as any).templateAssignmentId))).size

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

        const assignment = await TemplateAssignment.findById(templateAssignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        let signatureLevel = ''
        const studentForSig = await Student.findById(assignment.studentId).lean()
        if (studentForSig) {
            signatureLevel = studentForSig.level || ''
            const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
            if (activeSchoolYear) {
                const enrollment = await Enrollment.findOne({
                    studentId: assignment.studentId,
                    schoolYearId: activeSchoolYear._id,
                    status: 'active'
                }).lean()
                if (enrollment && enrollment.classId) {
                    const cls = await ClassModel.findById(enrollment.classId).lean()
                    if (cls && cls.level) signatureLevel = cls.level
                }
            }
        }

        // Get active admin signature
        const activeSig = await AdminSignature.findOne({ isActive: true }).lean()

        try {
            const signature = await signTemplateAssignment({
                templateAssignmentId,
                signerId: adminId,
                type: type as any,
                signatureUrl: activeSig ? activeSig.dataUrl : undefined,
                req,
                level: signatureLevel || undefined
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

            const template = await GradebookTemplate.findById(assignment.templateId).select('pages').lean()
            const block = template?.pages?.[pageIndex]?.blocks?.[blockIndex]
            const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null
            const keyStable = blockId ? `language_toggle_${blockId}` : `language_toggle_${pageIndex}_${blockIndex}`

            // Update assignment data
            if (!assignment.data) assignment.data = {}
            assignment.data[keyStable] = items
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

        // Use centralized helper for versioning and data merging
        const versionedTemplate = mergeAssignmentDataIntoTemplate(template, assignment)

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

// --- Server tests: list available test files ---
adminExtrasRouter.get('/run-tests/list', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const testsDir = path.join(__dirname, '..', '__tests__')
        const files = await fs.readdir(testsDir)
        const testFiles = files.filter((f: string) => f.endsWith('.test.ts') || f.endsWith('.test.js') || f.endsWith('.spec.ts') || f.endsWith('.spec.js'))
        res.json({ tests: testFiles })
    } catch (e: any) {
        console.error('run-tests/list error', e)
        res.status(500).json({ error: 'failed' })
    }
})

// --- Server tests: run tests (admin only) ---
adminExtrasRouter.post('/run-tests', requireAuth(['ADMIN']), async (req, res) => {
    const { pattern } = req.body || {}
    try {
        const args = ['jest', '--json', '--runInBand']
        if (pattern && typeof pattern === 'string' && pattern.trim()) args.push(pattern)

        const cwd = path.join(__dirname, '..', '..') // server root
        // Try to prefer local node_modules binary if available, otherwise fallback to npx
        let cmd = 'npx'
        let cmdArgs = args
        try {
            const jestPath = path.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'jest.cmd' : 'jest')
            await fs.access(jestPath)
            cmd = jestPath
            cmdArgs = ['--json', '--runInBand']
            if (pattern && typeof pattern === 'string' && pattern.trim()) cmdArgs.push(pattern)
        } catch (e) {
            // fallback stays as npx with args
        }

        // If we are still set to use 'npx' and it's not available on the system, return 501 with clear message
        if (cmd === 'npx') {
            try {
                const childProc = require('child_process').spawnSync(process.platform === 'win32' ? 'where' : 'which', ['npx'])
                if (childProc.status !== 0) {
                    return res.status(501).json({ error: 'npx_not_found', message: 'npx is not available on PATH and local jest binary not found' })
                }
            } catch (e) {
                return res.status(501).json({ error: 'npx_check_failed', message: String(e) })
            }
        }

        const proc = spawn(cmd, cmdArgs, { cwd, env: { ...process.env, CI: 'true' } })
        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (d) => { stdout += String(d) })
        proc.stderr.on('data', (d) => { stderr += String(d) })

        proc.on('error', (err) => {
            console.error('run-tests spawn error', err)
            // return a helpful error to client
            return res.status(500).json({ error: 'spawn_failed', message: String(err) })
        })

        proc.on('close', (code) => {
            try {
                const parsed = JSON.parse(stdout)
                return res.json({ ok: true, code, results: parsed, stdout, stderr })
            } catch (e: any) {
                return res.json({ ok: code === 0, code, stdout, stderr, parseError: String(e) })
            }
        })
    } catch (e: any) {
        console.error('run-tests error', e)
        res.status(500).json({ error: 'run_failed', message: e.message })
    }
})
