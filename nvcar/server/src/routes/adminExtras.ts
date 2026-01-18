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
        const { type = 'standard', signaturePeriodId, signatureSchoolYearId } = req.body

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
                level: signatureLevel || undefined,
                signaturePeriodId,
                signatureSchoolYearId
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

// ============================================================================
// PS-TO-MS ONBOARDING ENDPOINTS
// ============================================================================

import { Level } from '../models/Level'
import { logAudit } from '../utils/auditLogger'
import { computeSignaturePeriodId } from '../utils/readinessUtils'

// Helper: Get next level based on order
const getNextLevelName = async (currentLevel: string): Promise<string | null> => {
    const currentDoc = await Level.findOne({ name: currentLevel }).lean()
    if (!currentDoc) return null
    const nextDoc = await Level.findOne({ order: (currentDoc as any).order + 1 }).lean()
    return nextDoc ? (nextDoc as any).name : null
}

// PS Onboarding: Get PS students for the previous school year
adminExtrasRouter.get('/ps-onboarding/students', requireAuth(['ADMIN']), async (req, res) => {
    try {
        // Find active school year (for reference)
        const activeYear = await SchoolYear.findOne({ active: true }).lean()

        // If schoolYearId is provided, use that; otherwise try to find previous year
        const { schoolYearId } = req.query
        let selectedYear: any = null

        if (schoolYearId && typeof schoolYearId === 'string') {
            // User selected a specific year
            selectedYear = await SchoolYear.findById(schoolYearId).lean()
            if (!selectedYear) {
                return res.status(400).json({ error: 'year_not_found', message: 'Selected school year not found' })
            }
        } else {
            // Auto-detect previous year
            if (!activeYear) return res.status(400).json({ error: 'no_active_year' })

            if ((activeYear as any).sequence && (activeYear as any).sequence > 1) {
                selectedYear = await SchoolYear.findOne({ sequence: (activeYear as any).sequence - 1 }).lean()
            }
            if (!selectedYear && activeYear.startDate) {
                selectedYear = await SchoolYear.findOne({ endDate: { $lt: activeYear.startDate } })
                    .sort({ endDate: -1 }).lean()
            }
            if (!selectedYear) {
                // Try parsing from name
                const match = String(activeYear.name || '').match(/(\d{4})([-/.])(\d{4})/)
                if (match) {
                    const startYear = parseInt(match[1], 10)
                    const sep = match[2]
                    const endYear = parseInt(match[3], 10)
                    const prevName = `${startYear - 1}${sep}${endYear - 1}`
                    selectedYear = await SchoolYear.findOne({ name: prevName }).lean()
                }
            }
            if (!selectedYear) {
                return res.status(400).json({ error: 'no_previous_year', message: 'Cannot find previous school year' })
            }
        }

        const selectedYearId = String(selectedYear._id)
        const activeYearId = activeYear ? String(activeYear._id) : ''

        // Get ALL classes from the selected year
        const allClasses = await ClassModel.find({ schoolYearId: selectedYearId }).lean()
        console.log(`[PS-Onboarding] Year ${selectedYear.name}: Found ${allClasses.length} classes`)

        // Debug: show all class levels
        const classLevels = [...new Set(allClasses.map(c => c.level || 'undefined'))]
        console.log(`[PS-Onboarding] Unique levels in classes: ${classLevels.join(', ')}`)

        // Filter for PS classes - use simple matching like the rest of the app
        const psClasses = allClasses.filter(c => {
            const level = (c.level || '').toUpperCase()
            return level === 'PS' || level === 'TPS'
        })
        console.log(`[PS-Onboarding] Found ${psClasses.length} PS classes: ${psClasses.map(c => c.name).join(', ')}`)

        const psClassIds = psClasses.map(c => String(c._id))

        // Get ALL enrollments from the selected year
        const allEnrollments = await Enrollment.find({
            schoolYearId: selectedYearId
        }).lean()
        console.log(`[PS-Onboarding] Found ${allEnrollments.length} total enrollments`)

        // Filter to find PS enrollments (students in PS classes)
        const psEnrollments = allEnrollments.filter(e => psClassIds.includes(String(e.classId)))
        console.log(`[PS-Onboarding] Found ${psEnrollments.length} PS enrollments`)
        const enrolledPsStudentIds = psEnrollments.map(e => String(e.studentId))

        // Get students: either enrolled in PS classes OR currently at PS level  
        const psStudents = await Student.find({
            $or: [
                { _id: { $in: enrolledPsStudentIds } },
                { level: { $in: ['PS', 'TPS', 'ps', 'tps'] } }
            ]
        }).lean()
        console.log(`[PS-Onboarding] Found ${psStudents.length} PS students`)

        // Map: studentId -> enrollment in selected year (use PS enrollments for accurate mapping)
        const enrollmentMap = new Map(psEnrollments.map(e => [String(e.studentId), e]))
        const classMap = new Map(psClasses.map(c => [String(c._id), c]))

        // Get template assignments for these students
        const studentIds = psStudents.map(s => String(s._id))
        const assignments = await TemplateAssignment.find({ studentId: { $in: studentIds } }).lean()
        const assignmentMap = new Map(assignments.map(a => [String(a.studentId), a]))

        // Get signatures
        const assignmentIds = assignments.map(a => String(a._id))
        const signatures = assignmentIds.length > 0
            ? await TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } }).lean()
            : []

        // Build signature lookup by assignmentId
        const sigByAssignment = new Map<string, any[]>()
        signatures.forEach(s => {
            const key = String(s.templateAssignmentId)
            if (!sigByAssignment.has(key)) sigByAssignment.set(key, [])
            sigByAssignment.get(key)!.push(s)
        })

        // Compute signaturePeriodIds for selected year
        const sem1PeriodId = computeSignaturePeriodId(selectedYearId, 'sem1')
        const endOfYearPeriodId = computeSignaturePeriodId(selectedYearId, 'end_of_year')

        // Build student list
        const studentList = psStudents.map(student => {
            const sid = String(student._id)
            const enrollment = enrollmentMap.get(sid)
            const cls = enrollment?.classId ? classMap.get(String(enrollment.classId)) : null
            const assignment = assignmentMap.get(sid)
            const assignmentId = assignment ? String(assignment._id) : null
            const sigs = assignmentId ? sigByAssignment.get(assignmentId) || [] : []

            // Find sem1 and end_of_year signatures
            const sem1Sig = sigs.find(s =>
                s.type !== 'end_of_year' &&
                (!s.signaturePeriodId || s.signaturePeriodId === sem1PeriodId)
            )
            const sem2Sig = sigs.find(s =>
                s.type === 'end_of_year' &&
                (!s.signaturePeriodId || s.signaturePeriodId === endOfYearPeriodId)
            )

            // Check if promoted from this year
            const isPromoted = Array.isArray(student.promotions) &&
                student.promotions.some((p: any) => String(p.schoolYearId) === selectedYearId)

            const promotionInfo = isPromoted
                ? student.promotions?.find((p: any) => String(p.schoolYearId) === selectedYearId)
                : null

            return {
                _id: sid,
                firstName: student.firstName,
                lastName: student.lastName,
                dateOfBirth: student.dateOfBirth,
                avatarUrl: student.avatarUrl,
                previousClassName: cls?.name || null,
                previousClassId: cls ? String(cls._id) : null,
                hasEnrollment: !!enrollment,
                assignmentId,
                isCompletedSem1: assignment?.isCompletedSem1 || assignment?.isCompleted || false,
                isCompletedSem2: (assignment as any)?.isCompletedSem2 || false,
                signatures: {
                    sem1: sem1Sig ? { signedAt: sem1Sig.signedAt, signedBy: sem1Sig.subAdminId } : null,
                    sem2: sem2Sig ? { signedAt: sem2Sig.signedAt, signedBy: sem2Sig.subAdminId } : null
                },
                isPromoted,
                promotedAt: promotionInfo?.date || null
            }
        })

        res.json({
            students: studentList,
            selectedYear: { _id: selectedYearId, name: selectedYear.name },
            activeYear: activeYear ? { _id: activeYearId, name: activeYear.name } : null,
            previousYearClasses: psClasses.map(c => ({ _id: String(c._id), name: c.name, level: c.level }))
        })
    } catch (e: any) {
        console.error('ps-onboarding/students error:', e)
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// PS Onboarding: Assign a student to a PS class in the previous year
adminExtrasRouter.post('/ps-onboarding/assign-class', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const adminId = (req as any).user.userId
        const { studentId, classId, schoolYearId } = req.body

        if (!studentId || !classId || !schoolYearId) {
            return res.status(400).json({ error: 'missing_params' })
        }

        // Verify class exists and is PS level
        const cls = await ClassModel.findById(classId).lean()
        if (!cls) return res.status(404).json({ error: 'class_not_found' })
        if (cls.level !== 'PS') return res.status(400).json({ error: 'class_not_ps', message: 'Class must be PS level' })

        // Check for existing enrollment
        let enrollment = await Enrollment.findOne({ studentId, schoolYearId }).lean()

        if (enrollment) {
            // Update existing enrollment
            await Enrollment.findByIdAndUpdate(enrollment._id, { classId, status: 'active' })
        } else {
            // Create new enrollment
            await Enrollment.create({ studentId, schoolYearId, classId, status: 'active' })
        }

        await logAudit({
            userId: adminId,
            action: 'PS_ONBOARDING_ASSIGN_CLASS',
            details: { studentId, classId, schoolYearId, className: cls.name },
            req
        })

        res.json({ success: true, className: cls.name })
    } catch (e: any) {
        console.error('ps-onboarding/assign-class error:', e)
        res.status(500).json({ error: 'assign_failed', message: e.message })
    }
})

// PS Onboarding: Batch sign gradebooks
adminExtrasRouter.post('/ps-onboarding/batch-sign', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const adminId = (req as any).user.userId
        const {
            scope, // 'student' | 'class' | 'all'
            studentIds = [],
            classId,
            signatureType, // 'sem1' | 'sem2' | 'both'
            signatureSource, // 'admin' | 'subadmin'
            subadminId,
            schoolYearId,
            sem1SignedAt, // optional custom date for sem1
            sem2SignedAt  // optional custom date for sem2
        } = req.body

        if (!schoolYearId) return res.status(400).json({ error: 'missing_school_year' })
        if (!signatureType) return res.status(400).json({ error: 'missing_signature_type' })
        if (!signatureSource) return res.status(400).json({ error: 'missing_signature_source' })
        if (signatureSource === 'subadmin' && !subadminId) {
            return res.status(400).json({ error: 'missing_subadmin_id' })
        }

        // Get signer ID and signature URL
        const signerId = signatureSource === 'subadmin' ? subadminId : adminId
        let signatureUrl: string | undefined

        if (signatureSource === 'admin') {
            const adminSig = await AdminSignature.findOne({ isActive: true }).lean()
            signatureUrl = adminSig?.dataUrl
        } else {
            // Get subadmin signature
            let subadmin = await User.findById(subadminId).lean() as any
            if (!subadmin) {
                subadmin = await OutlookUser.findById(subadminId).lean()
            }
            signatureUrl = subadmin?.signatureUrl
        }

        // Get PS classes for the school year
        const psClasses = await ClassModel.find({ schoolYearId, level: 'PS' }).lean()
        const psClassIds = psClasses.map(c => String(c._id))

        // Get enrollments
        let targetEnrollments: any[]
        if (scope === 'student' && studentIds.length > 0) {
            targetEnrollments = await Enrollment.find({
                studentId: { $in: studentIds },
                schoolYearId,
                classId: { $in: psClassIds }
            }).lean()
        } else if (scope === 'class' && classId) {
            targetEnrollments = await Enrollment.find({ schoolYearId, classId }).lean()
        } else {
            // All PS students
            targetEnrollments = await Enrollment.find({
                schoolYearId,
                classId: { $in: psClassIds }
            }).lean()
        }

        const targetStudentIds = targetEnrollments.map(e => String(e.studentId))

        // Get assignments for these students
        const assignments = await TemplateAssignment.find({ studentId: { $in: targetStudentIds } }).lean()

        // Get school year name for signature data
        const schoolYear = await SchoolYear.findById(schoolYearId).lean()
        const schoolYearName = schoolYear?.name || ''

        // Compute signature period IDs
        const sem1PeriodId = computeSignaturePeriodId(schoolYearId, 'sem1')
        const endOfYearPeriodId = computeSignaturePeriodId(schoolYearId, 'end_of_year')

        const results = { success: 0, failed: 0, errors: [] as any[] }

        for (const assignment of assignments) {
            const assignmentId = String(assignment._id)

            // Get student to determine level and class
            const student = await Student.findById(assignment.studentId).lean()
            const level = 'PS' // We know these are PS students

            // Get student's enrollment to find class name
            const enrollment = targetEnrollments.find(e => String(e.studentId) === String(assignment.studentId))
            let className = ''
            if (enrollment?.classId) {
                const cls = psClasses.find(c => String(c._id) === String(enrollment.classId))
                className = (cls as any)?.name || ''
            }

            const typesToSign: { type: 'standard' | 'end_of_year', periodId: string }[] = []
            if (signatureType === 'sem1' || signatureType === 'both') {
                typesToSign.push({ type: 'standard', periodId: sem1PeriodId })
            }
            if (signatureType === 'sem2' || signatureType === 'both') {
                typesToSign.push({ type: 'end_of_year', periodId: endOfYearPeriodId })
            }

            for (const { type, periodId } of typesToSign) {
                try {
                    // Check if already signed
                    const existing = await TemplateSignature.findOne({
                        templateAssignmentId: assignmentId,
                        type,
                        signaturePeriodId: periodId
                    }).lean()

                    if (existing) {
                        // Skip, already signed
                        continue
                    }

                    // Use custom date if provided, otherwise use current date
                    let signedAt: Date
                    if (type === 'standard' && sem1SignedAt) {
                        signedAt = new Date(sem1SignedAt)
                    } else if (type === 'end_of_year' && sem2SignedAt) {
                        signedAt = new Date(sem2SignedAt)
                    } else {
                        signedAt = new Date()
                    }

                    // Create signature
                    await TemplateSignature.create({
                        templateAssignmentId: assignmentId,
                        subAdminId: signerId,
                        signedAt,
                        status: 'signed',
                        type,
                        signatureUrl,
                        level,
                        signaturePeriodId: periodId,
                        schoolYearId,
                        schoolYearName
                    })

                    // Also add signature to assignment.data.signatures for CarnetPrint to find
                    const assignmentDoc = await TemplateAssignment.findById(assignmentId)
                    if (assignmentDoc) {
                        if (!assignmentDoc.data) assignmentDoc.data = {}
                        if (!assignmentDoc.data.signatures) assignmentDoc.data.signatures = []
                        assignmentDoc.data.signatures.push({
                            type,
                            signedAt,
                            signatureUrl,
                            level,
                            schoolYearName,
                            schoolYearId,
                            signaturePeriodId: periodId
                        })
                        assignmentDoc.status = 'signed'
                        assignmentDoc.dataVersion = (assignmentDoc.dataVersion || 0) + 1
                        assignmentDoc.markModified('data')
                        await assignmentDoc.save()
                    } else {
                        // Fallback if doc not found
                        await TemplateAssignment.findByIdAndUpdate(assignmentId, {
                            $set: { status: 'signed' },
                            $inc: { dataVersion: 1 }
                        })
                    }

                    results.success++
                } catch (signError: any) {
                    if (!signError.message?.includes('E11000')) {
                        results.failed++
                        results.errors.push({
                            studentId: assignment.studentId,
                            type,
                            error: signError.message
                        })
                    }
                }
            }
        }

        await logAudit({
            userId: adminId,
            action: 'PS_ONBOARDING_BATCH_SIGN',
            details: {
                scope,
                signatureType,
                signatureSource,
                subadminId: signatureSource === 'subadmin' ? subadminId : undefined,
                schoolYearId,
                success: results.success,
                failed: results.failed
            },
            req
        })

        res.json(results)
    } catch (e: any) {
        console.error('ps-onboarding/batch-sign error:', e)
        res.status(500).json({ error: 'batch_sign_failed', message: e.message })
    }
})

// PS Onboarding: Batch unsign gradebooks (undo)
adminExtrasRouter.post('/ps-onboarding/batch-unsign', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const adminId = (req as any).user.userId
        const {
            scope,
            studentIds = [],
            classId,
            signatureType,
            schoolYearId
        } = req.body

        if (!schoolYearId) return res.status(400).json({ error: 'missing_school_year' })
        if (!signatureType) return res.status(400).json({ error: 'missing_signature_type' })

        // Get PS classes for the school year
        const psClasses = await ClassModel.find({ schoolYearId, level: 'PS' }).lean()
        const psClassIds = psClasses.map(c => String(c._id))

        // Get enrollments
        let targetEnrollments: any[]
        if (scope === 'student' && studentIds.length > 0) {
            targetEnrollments = await Enrollment.find({
                studentId: { $in: studentIds },
                schoolYearId,
                classId: { $in: psClassIds }
            }).lean()
        } else if (scope === 'class' && classId) {
            targetEnrollments = await Enrollment.find({ schoolYearId, classId }).lean()
        } else {
            targetEnrollments = await Enrollment.find({
                schoolYearId,
                classId: { $in: psClassIds }
            }).lean()
        }

        const targetStudentIds = targetEnrollments.map(e => String(e.studentId))
        const assignments = await TemplateAssignment.find({ studentId: { $in: targetStudentIds } }).lean()
        const assignmentIds = assignments.map(a => String(a._id))

        // Build query for deletion
        const deleteQuery: any = { templateAssignmentId: { $in: assignmentIds } }

        if (signatureType === 'sem1') {
            deleteQuery.type = { $ne: 'end_of_year' }
        } else if (signatureType === 'sem2') {
            deleteQuery.type = 'end_of_year'
        }
        // 'both' = delete all

        const result = await TemplateSignature.deleteMany(deleteQuery)

        await logAudit({
            userId: adminId,
            action: 'PS_ONBOARDING_BATCH_UNSIGN',
            details: { scope, signatureType, schoolYearId, deleted: result.deletedCount },
            req
        })

        res.json({ success: true, deleted: result.deletedCount })
    } catch (e: any) {
        console.error('ps-onboarding/batch-unsign error:', e)
        res.status(500).json({ error: 'batch_unsign_failed', message: e.message })
    }
})

// PS Onboarding: Batch promote students from PS to MS
adminExtrasRouter.post('/ps-onboarding/batch-promote', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const adminId = (req as any).user.userId
        const {
            scope,
            studentIds = [],
            classId,
            schoolYearId // This is the PREVIOUS year ID (where we're promoting FROM)
        } = req.body

        if (!schoolYearId) return res.status(400).json({ error: 'missing_school_year' })

        // Find active (next) school year
        const activeYear = await SchoolYear.findOne({ active: true }).lean()
        if (!activeYear) return res.status(400).json({ error: 'no_active_year' })
        const activeYearId = String(activeYear._id)

        // Verify this is the previous year
        if (schoolYearId === activeYearId) {
            return res.status(400).json({ error: 'wrong_year', message: 'Cannot promote from active year to itself' })
        }

        // Get next level for PS
        const nextLevel = await getNextLevelName('PS')
        if (!nextLevel) {
            return res.status(400).json({ error: 'no_next_level', message: 'Cannot determine next level from PS' })
        }

        // Get PS classes for the previous year
        const psClasses = await ClassModel.find({ schoolYearId, level: 'PS' }).lean()
        const psClassIds = psClasses.map(c => String(c._id))

        // Get target enrollments
        let targetEnrollments: any[]
        if (scope === 'student' && studentIds.length > 0) {
            targetEnrollments = await Enrollment.find({
                studentId: { $in: studentIds },
                schoolYearId,
                classId: { $in: psClassIds }
            }).lean()
        } else if (scope === 'class' && classId) {
            targetEnrollments = await Enrollment.find({ schoolYearId, classId }).lean()
        } else {
            targetEnrollments = await Enrollment.find({
                schoolYearId,
                classId: { $in: psClassIds }
            }).lean()
        }

        const targetStudentIds = targetEnrollments.map(e => e.studentId)

        // Get school year name for promotion data
        const prevSchoolYear = await SchoolYear.findById(schoolYearId).lean()
        const prevSchoolYearName = prevSchoolYear?.name || ''

        // Get assignments
        const assignments = await TemplateAssignment.find({ studentId: { $in: targetStudentIds } }).lean()
        const assignmentMap = new Map(assignments.map(a => [String(a.studentId), a]))

        // Get signatures to verify end-of-year signing
        const assignmentIds = assignments.map(a => String(a._id))
        const endOfYearPeriodId = computeSignaturePeriodId(schoolYearId, 'end_of_year')
        const signatures = await TemplateSignature.find({
            templateAssignmentId: { $in: assignmentIds },
            type: 'end_of_year',
            signaturePeriodId: endOfYearPeriodId
        }).lean()
        const signedAssignments = new Set(signatures.map(s => String(s.templateAssignmentId)))

        const results = { success: 0, failed: 0, errors: [] as any[], skipped: 0 }

        for (const studentId of targetStudentIds) {
            const sid = String(studentId)

            // Check if already promoted
            const student = await Student.findById(sid).lean()
            if (!student) {
                results.failed++
                results.errors.push({ studentId: sid, error: 'student_not_found' })
                continue
            }

            const alreadyPromoted = Array.isArray(student.promotions) &&
                student.promotions.some((p: any) => String(p.schoolYearId) === schoolYearId)
            if (alreadyPromoted) {
                results.skipped++
                continue
            }

            // Check if signed
            const assignment = assignmentMap.get(sid)
            if (!assignment) {
                results.failed++
                results.errors.push({ studentId: sid, error: 'no_assignment' })
                continue
            }

            if (!signedAssignments.has(String(assignment._id))) {
                results.failed++
                results.errors.push({ studentId: sid, error: 'not_signed_end_of_year' })
                continue
            }

            try {
                // Create promotion record
                const promotion = {
                    schoolYearId,
                    date: new Date(),
                    fromLevel: 'PS',
                    toLevel: nextLevel,
                    promotedBy: adminId
                }

                await Student.findByIdAndUpdate(sid, {
                    $push: { promotions: promotion },
                    $set: { level: nextLevel, nextLevel: null }
                })

                // Update old enrollment to promoted status
                const oldEnrollment = targetEnrollments.find(e => String(e.studentId) === sid)
                if (oldEnrollment) {
                    await Enrollment.findByIdAndUpdate(oldEnrollment._id, { status: 'promoted' })
                }

                // Create new enrollment in active year (without class assignment)
                const existingActiveEnrollment = await Enrollment.findOne({
                    studentId: sid,
                    schoolYearId: activeYearId
                }).lean()

                if (!existingActiveEnrollment) {
                    await Enrollment.create({
                        studentId: sid,
                        schoolYearId: activeYearId,
                        status: 'active',
                        classId: null
                    })
                }

                // Get student's class name from enrollment
                const enrollment = targetEnrollments.find(e => String(e.studentId) === sid)
                let className = ''
                if (enrollment?.classId) {
                    const cls = psClasses.find(c => String(c._id) === String(enrollment.classId))
                    className = (cls as any)?.name || ''
                }

                // Add promotion to assignment data for history
                const assignmentForUpdate = await TemplateAssignment.findById(assignment._id)
                if (assignmentForUpdate) {
                    if (!assignmentForUpdate.data) assignmentForUpdate.data = {}
                    if (!assignmentForUpdate.data.promotions) assignmentForUpdate.data.promotions = []
                    assignmentForUpdate.data.promotions.push({
                        from: 'PS',
                        to: nextLevel,
                        date: new Date(),
                        by: adminId,
                        year: prevSchoolYearName,
                        class: className,
                        schoolYearId
                    })
                    assignmentForUpdate.markModified('data')
                    await assignmentForUpdate.save()
                }

                results.success++
            } catch (promoteError: any) {
                results.failed++
                results.errors.push({ studentId: sid, error: promoteError.message })
            }
        }

        await logAudit({
            userId: adminId,
            action: 'PS_ONBOARDING_BATCH_PROMOTE',
            details: {
                scope,
                schoolYearId,
                fromLevel: 'PS',
                toLevel: nextLevel,
                success: results.success,
                failed: results.failed,
                skipped: results.skipped
            },
            req
        })

        res.json(results)
    } catch (e: any) {
        console.error('ps-onboarding/batch-promote error:', e)
        res.status(500).json({ error: 'batch_promote_failed', message: e.message })
    }
})

// PS Onboarding: Get available subadmins for signature selection
adminExtrasRouter.get('/ps-onboarding/subadmins', requireAuth(['ADMIN']), async (req, res) => {
    try {
        // Get all subadmins with signatures
        const [users, outlookUsers] = await Promise.all([
            User.find({ role: 'SUBADMIN', signatureUrl: { $exists: true, $ne: '' } })
                .select('displayName email signatureUrl').lean(),
            OutlookUser.find({ role: 'SUBADMIN', signatureUrl: { $exists: true, $ne: '' } })
                .select('displayName email signatureUrl').lean()
        ])

        const subadmins = [...users, ...outlookUsers].map(u => ({
            _id: String(u._id),
            displayName: (u as any).displayName || (u as any).email,
            hasSignature: !!(u as any).signatureUrl,
            signatureUrl: (u as any).signatureUrl || null
        }))

        res.json(subadmins)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// PS Onboarding: Batch export PDFs (without signature blocks)
adminExtrasRouter.post('/ps-onboarding/batch-export', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const {
            scope, // 'student' | 'class' | 'all'
            studentIds = [],
            classId,
            schoolYearId
        } = req.body

        if (!schoolYearId) return res.status(400).json({ error: 'missing_school_year' })

        // Get PS classes for the school year
        const psClasses = await ClassModel.find({ schoolYearId, level: 'PS' }).lean()
        const psClassIds = psClasses.map(c => String(c._id))

        // Get target enrollments
        let targetEnrollments: any[]
        if (scope === 'student' && studentIds.length > 0) {
            targetEnrollments = await Enrollment.find({
                studentId: { $in: studentIds },
                schoolYearId,
                classId: { $in: psClassIds }
            }).lean()
        } else if (scope === 'class' && classId) {
            targetEnrollments = await Enrollment.find({ schoolYearId, classId }).lean()
        } else {
            targetEnrollments = await Enrollment.find({
                schoolYearId,
                classId: { $in: psClassIds }
            }).lean()
        }

        const targetStudentIds = targetEnrollments.map(e => String(e.studentId))

        // Get assignments for these students
        const assignments = await TemplateAssignment.find({ studentId: { $in: targetStudentIds } }).lean()

        // Return assignment IDs for the frontend to use with the existing batch export
        // Frontend will add hideSignatures=true to the print URLs
        const assignmentIds = assignments.map(a => String(a._id))

        // Get class name for groupLabel
        let groupLabel = 'PS'
        if (scope === 'class' && classId) {
            const cls = psClasses.find(c => String(c._id) === classId)
            groupLabel = (cls as any)?.name || 'PS'
        } else if (scope === 'student' && studentIds.length === 1) {
            const student = await Student.findById(studentIds[0]).lean()
            groupLabel = student ? `${student.lastName}-${student.firstName}` : 'PS'
        }

        res.json({
            assignmentIds,
            groupLabel,
            count: assignmentIds.length
        })
    } catch (e: any) {
        console.error('ps-onboarding/batch-export error:', e)
        res.status(500).json({ error: 'batch_export_failed', message: e.message })
    }
})

// ============================================================================
// END PS-TO-MS ONBOARDING ENDPOINTS
// ============================================================================

// --- Server tests: list available test files (recursive) ---
adminExtrasRouter.get('/run-tests/list', requireAuth(['ADMIN']), async (req, res) => {
    try {
        // Search recursively under server `src` for test files so we include nested suites
        const startDir = path.join(__dirname, '..') // server/src
        const matches: string[] = []

        async function walk(dir: string) {
            const entries = await fs.readdir(dir, { withFileTypes: true })
            for (const ent of entries) {
                const p = path.join(dir, ent.name)
                if (ent.isDirectory()) {
                    await walk(p)
                } else if (ent.isFile() && (/\.(?:test|spec)\.[tj]s$/).test(ent.name)) {
                    // return paths relative to server/src for client-friendly display
                    matches.push(path.relative(startDir, p))
                }
            }
        }

        await walk(startDir)
        matches.sort()
        res.json({ tests: matches })
    } catch (e: any) {
        console.error('run-tests/list error', e)
        res.status(500).json({ error: 'failed' })
    }
})

// --- Server tests: run tests (admin only) ---
adminExtrasRouter.post('/run-tests', requireAuth(['ADMIN']), async (req, res) => {
    const { pattern, patterns } = req.body || {}
    try {
        const argsBase = ['--json', '--runInBand']
        const patternArgs: string[] = []

        const addPatterns = (p: any) => {
            if (Array.isArray(p)) {
                for (const it of p) if (typeof it === 'string' && it.trim()) patternArgs.push(it)
            } else if (typeof p === 'string' && p.trim()) patternArgs.push(p)
        }

        addPatterns(patterns)
        addPatterns(pattern)

        const cwd = path.join(__dirname, '..', '..') // server root
        // Try to prefer local node_modules binary if available, otherwise fallback to npx
        let cmd = 'npx'
        let cmdArgs: string[] = ['jest', ...argsBase, ...patternArgs]
        try {
            const jestPath = path.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'jest.cmd' : 'jest')
            await fs.access(jestPath)
            cmd = jestPath
            cmdArgs = [...argsBase, ...patternArgs]
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

        let responded = false
        const proc = spawn(cmd, cmdArgs, { cwd, env: { ...process.env, CI: 'true' }, shell: process.platform === 'win32' })
        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (d) => { stdout += String(d) })
        proc.stderr.on('data', (d) => { stderr += String(d) })

        proc.on('error', (err) => {
            console.error('run-tests spawn error', err)
            // return a helpful error to client
            if (responded || res.headersSent) return
            responded = true
            return res.status(500).json({ error: 'spawn_failed', message: String(err) })
        })

        proc.on('close', (code) => {
            if (responded || res.headersSent) return
            responded = true
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
