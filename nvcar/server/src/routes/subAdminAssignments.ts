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
import { Category } from '../models/Category'
import { CompetencyVisibilityRule } from '../models/CompetencyVisibilityRule'
import { StudentCompetencyStatus } from '../models/StudentCompetencyStatus'
import { withCache } from '../utils/cache'

export const subAdminAssignmentsRouter = Router()

// SubAdmin: Get student progress for assigned levels
subAdminAssignmentsRouter.get('/progress', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId

        // Get assigned levels from RoleScope
        const scope = await RoleScope.findOne({ userId: subAdminId }).lean()
        if (!scope || !scope.levels || scope.levels.length === 0) {
            return res.json([])
        }

        const assignedLevels = scope.levels
        const normalizedAssignedLevels = new Set(
            assignedLevels.map((lvl: string) => String(lvl || '').trim().toUpperCase()).filter(Boolean)
        )

        // Get active school year
        const activeYear = await SchoolYear.findOne({ active: true }).lean()
        if (!activeYear) {
            return res.status(400).json({ error: 'no_active_year' })
        }

        // Find classes in these levels for the active year
        const classes = await ClassModel.find({
            level: { $in: assignedLevels },
            schoolYearId: String(activeYear._id)
        }).lean()

        const classIds = classes.map(c => String(c._id))

        const teacherAssignments = await TeacherClassAssignment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean()

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

        // Find assignments for active school year, then filter by level-scoped completion.
        const yearAssignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            $and: [
                {
                    $or: [
                        { completionSchoolYearId: String(activeYear._id) },
                        { completionSchoolYearId: { $exists: false }, assignedAt: { $gte: new Date(activeYear.startDate) } }
                    ]
                }
            ]
        }).lean()

        const normalizeCode = (code: any) => {
            const c = String(code || '').toLowerCase()
            if (c === 'lb' || c === 'ar') return 'ar'
            if (c === 'en' || c === 'uk' || c === 'gb') return 'en'
            if (c === 'fr') return 'fr'
            return c
        }

        const completedAssignments = yearAssignments.filter((assignment: any) => {
            const enrollment = enrollments.find(e => e.studentId === assignment.studentId)
            const cls = classes.find(c => String(c._id) === enrollment?.classId)
            const currentLevel = String(cls?.level || '').trim().toUpperCase()
            const languageCompletions = Array.isArray((assignment as any).languageCompletions) ? (assignment as any).languageCompletions : []

            const scoped = languageCompletions.filter((entry: any) => {
                const entryLevel = String(entry?.level || '').trim().toUpperCase()
                if (!currentLevel) return false
                return !!entryLevel && entryLevel === currentLevel
            })

            if (scoped.length > 0) {
                return scoped.some((entry: any) => {
                    const normalizedCode = normalizeCode(entry?.code)
                    if (!normalizedCode) return false
                    return !!(entry?.completed || entry?.completedSem1 || entry?.completedSem2)
                })
            }

            return !!((assignment as any).isCompleted || (assignment as any).isCompletedSem1 || (assignment as any).isCompletedSem2 || (assignment as any).status === 'completed')
        })

        const completedStudentIds = new Set(completedAssignments.map(a => a.studentId))

        // Filter students
        const students = await Student.find({ _id: { $in: Array.from(completedStudentIds) } }).lean()

        // Fetch templates used in assignments
        const templateIds = [...new Set(completedAssignments.map(a => a.templateId))]
        const templates = (await Promise.all(templateIds.map(id =>
            withCache(`template-${id}`, () => GradebookTemplate.findById(id).lean())
        ))).filter((t): t is any => !!t)
        const templateMap = new Map(templates.map(t => [String(t._id), t]))

        const result = students.map(student => {
            const enrollment = enrollments.find(e => e.studentId === String(student._id))
            const cls = classes.find(c => String(c._id) === enrollment?.classId)
            const currentLevel = cls?.level || student.level || 'Unknown'
            const normalizedCurrentLevel = String(currentLevel || '').trim().toUpperCase()

            // Find all assignments for this student
            const studentAssignments = completedAssignments.filter(a => a.studentId === String(student._id))

            // Structure to hold stats per level
            const statsByLevel: Record<string, {
                total: number,
                filled: number,
                byCategory: Record<string, { total: number, filled: number, name: string }>
            }> = {}

            studentAssignments.forEach(assignment => {
                const template = templateMap.get(assignment.templateId)
                if (!template) return

                const assignmentData = assignment.data || {}

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
                            const code = (item.code || '').toLowerCase()
                            const rawLang = item.type || item.label || ''
                            const lang = (() => {
                                const ll = rawLang.toLowerCase()
                                if (code === 'fr' || code === 'fra' || ll.includes('français') || ll.includes('french')) return 'Polyvalent'
                                if (code === 'ar' || code === 'ara' || code === 'arab' || code === 'lb' || ll.includes('arabe') || ll.includes('arabic') || ll.includes('العربية')) return 'Arabe'
                                if (code === 'en' || code === 'eng' || code === 'uk' || code === 'gb' || ll.includes('anglais') || ll.includes('english')) return 'Anglais'
                                return rawLang || 'Autre'
                            })()

                            const itemLevelsRaw: string[] = (() => {
                                let levelsArr = item.levels && Array.isArray(item.levels) ? item.levels : []
                                if (levelsArr.length === 0 && item.level) levelsArr = [item.level]
                                return levelsArr
                            })()

                            if (!normalizedCurrentLevel || normalizedCurrentLevel === 'UNKNOWN') return

                            // A sub-admin should only see/count progress for the student's current class level.
                            if (itemLevelsRaw.length > 0) {
                                const appliesToCurrentLevel = itemLevelsRaw
                                    .map(lvl => String(lvl || '').trim().toUpperCase())
                                    .includes(normalizedCurrentLevel)
                                if (!appliesToCurrentLevel) return
                            }

                            const targetLevel = currentLevel
                            if (!normalizedAssignedLevels.has(String(targetLevel || '').trim().toUpperCase())) return

                            if (!statsByLevel[targetLevel]) {
                                statsByLevel[targetLevel] = {
                                    total: 0,
                                    filled: 0,
                                    byCategory: {}
                                }
                            }

                            if (!statsByLevel[targetLevel].byCategory[lang]) {
                                statsByLevel[targetLevel].byCategory[lang] = { total: 0, filled: 0, name: lang }
                            }

                            statsByLevel[targetLevel].total++
                            statsByLevel[targetLevel].byCategory[lang].total++

                            const isActive = item.active === true || item.active === 'true'
                            if (isActive) {
                                statsByLevel[targetLevel].filled++
                                statsByLevel[targetLevel].byCategory[lang].filled++
                            }
                        })
                    })
                })
            })

            // Format the output
            const levelsData = Object.keys(statsByLevel).map(lvl => {
                const stats = statsByLevel[lvl]
                // Ensure we have at least these categories initialized if they exist in data
                const categories = Object.values(stats.byCategory)

                return {
                    level: lvl,
                    activeCount: stats.filled,
                    totalAvailable: stats.total,
                    percentage: stats.total > 0 ? Math.round((stats.filled / stats.total) * 100) : 0,
                    byCategory: categories.map(cat => ({
                        name: cat.name,
                        total: cat.total,
                        filled: cat.filled,
                        percentage: cat.total > 0 ? Math.round((cat.filled / cat.total) * 100) : 0
                    }))
                }
            })

            // If no levels data found (e.g. empty assignment or level mismatch), return default empty structure
            // But only if we have student info
            if (levelsData.length === 0 && student.level) {
                levelsData.push({
                    level: student.level,
                    activeCount: 0,
                    totalAvailable: 0,
                    percentage: 0,
                    byCategory: []
                })
            }

            return {
                _id: student._id,
                firstName: student.firstName,
                lastName: student.lastName,
                currentLevel,
                className: cls?.name,
                levelsData // New field containing stats per level
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
        const { subAdminId, level, schoolYearId } = req.body
        if (!subAdminId || !level) return res.status(400).json({ error: 'missing_payload' })

        // Verify sub-admin exists
        let subAdmin = await User.findById(subAdminId).lean() as any
        if (!subAdmin) {
            subAdmin = await OutlookUser.findById(subAdminId).lean()
        }

        if (!subAdmin || (subAdmin.role !== 'SUBADMIN' && subAdmin.role !== 'AEFE')) {
            return res.status(400).json({ error: 'invalid_subadmin' })
        }

        let targetYearId = schoolYearId;
        if (!targetYearId) {
            // Find the active school year
            const activeYear = await SchoolYear.findOne({ active: true }).lean()
            if (!activeYear) return res.status(400).json({ error: 'no_active_year' })
            targetYearId = String(activeYear._id)
        }

        // Find all classes in this level for the target school year
        const classes = await ClassModel.find({ level, schoolYearId: targetYearId }).lean()
        const classIds = classes.map(c => String(c._id))

        if (classIds.length === 0) {
            return res.json({ count: 0, message: 'No classes found for this level in active year' })
        }

        // Find all teachers assigned to these classes
        const teacherAssignments = await TeacherClassAssignment.find({ classId: { $in: classIds } }).lean()
        const teacherIds = [...new Set(teacherAssignments.map(ta => ta.teacherId))]

        if (teacherIds.length === 0) {
            // Still persist level assignment even if no teachers are currently assigned
            await RoleScope.findOneAndUpdate(
                { userId: subAdminId },
                { $addToSet: { levels: level } },
                { upsert: true, new: true }
            )
            return res.json({ count: 0, message: 'No teachers found for this level (level assigned)' })
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

// SubAdmin: Get teacher progress overview
// SubAdmin: Get detailed student progress
subAdminAssignmentsRouter.get('/teacher-progress-detailed', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { schoolYearId } = req.query

        // Get assigned levels
        const scope = await RoleScope.findOne({ userId: subAdminId }).lean()
        if (!scope || !scope.levels || scope.levels.length === 0) {
            return res.json([])
        }

        const levels = scope.levels

        // Get school year - use provided schoolYearId or fall back to active year
        let activeYear
        if (schoolYearId && typeof schoolYearId === 'string') {
            activeYear = await SchoolYear.findById(schoolYearId).lean()
        }
        if (!activeYear) {
            activeYear = await SchoolYear.findOne({ active: true }).lean()
        }
        if (!activeYear) {
            return res.status(400).json({ error: 'no_active_year' })
        }

        // Find classes
        const classes = await ClassModel.find({
            level: { $in: levels },
            schoolYearId: String(activeYear._id)
        }).lean()

        if (classes.length === 0) return res.json([])

        const classIds = classes.map(c => String(c._id))

        const teacherAssignments = await TeacherClassAssignment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean()

        // Find enrollments
        const enrollments = await Enrollment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean()

        const studentIds = enrollments.map(e => e.studentId)
        const students = await Student.find({ _id: { $in: studentIds } }).lean()
        const studentMap = new Map(students.map(s => [String(s._id), s]))

        // Find assignments for active school year
        const assignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            $or: [
                { completionSchoolYearId: String(activeYear._id) },
                { completionSchoolYearId: { $exists: false }, assignedAt: { $gte: new Date(activeYear.startDate) } }
            ]
        }).lean()

        // Get Templates
        const templateIds = [...new Set(assignments.map(a => a.templateId))]
        const templates = (await Promise.all(templateIds.map(id =>
            withCache(`template-${id}`, () => GradebookTemplate.findById(id).lean())
        ))).filter((t): t is any => !!t)
        const templateMap = new Map(templates.map(t => [String(t._id), t]))

        const normalizeLanguageCode = (value: any) => {
            const code = String(value || '').trim().toLowerCase()
            if (!code) return ''
            if (code === 'ar' || code === 'lb' || code === 'ara' || code === 'arab') return 'ar'
            if (code === 'en' || code === 'eng' || code === 'uk' || code === 'gb') return 'en'
            if (code === 'fr' || code === 'fra') return 'fr'
            return code
        }

        const isArabicLanguage = (codeRaw: any, labelRaw: any) => {
            const code = normalizeLanguageCode(codeRaw)
            const label = String(labelRaw || '').toLowerCase()
            return code === 'ar' || label.includes('arabe') || label.includes('arabic') || label.includes('العربية')
        }

        const isEnglishLanguage = (codeRaw: any, labelRaw: any) => {
            const code = normalizeLanguageCode(codeRaw)
            const label = String(labelRaw || '').toLowerCase()
            return code === 'en' || label.includes('anglais') || label.includes('english')
        }

        const isTeacherResponsibleForCategory = (ta: any, category: 'Arabe' | 'Anglais' | 'Polyvalent') => {
            const langs = ((ta as any).languages || []).map((tl: string) => String(tl || '').toLowerCase())
            if (category === 'Arabe') {
                if (langs.length === 0) return !(ta as any).isProfPolyvalent
                return langs.some((v: string) => isArabicLanguage(v, v))
            }
            if (category === 'Anglais') {
                if (langs.length === 0) return !(ta as any).isProfPolyvalent
                return langs.some((v: string) => isEnglishLanguage(v, v))
            }
            return (ta as any).isProfPolyvalent || (langs.length === 0 && !(ta as any).isProfPolyvalent)
        }

        // Build result
        const result = classes.map(cls => {
            const clsId = String(cls._id)
            const clsEnrollments = enrollments.filter(e => e.classId === clsId)

            const clsStudents = clsEnrollments.map(enrollment => {
                const student = studentMap.get(enrollment.studentId)
                if (!student) return null

                const studentAssignments = assignments.filter(a => a.studentId === enrollment.studentId)

                let arabicTotal = 0, arabicFilled = 0
                let englishTotal = 0, englishFilled = 0
                let polyvalentTotal = 0, polyvalentFilled = 0

                studentAssignments.forEach(assignment => {
                    const template = templateMap.get(assignment.templateId)
                    if (!template) return

                    const assignmentData = assignment.data || {}
                    const level = cls.level ? cls.level.trim() : ''
                    const normalizedCurrentLevel = String(level || '').trim().toUpperCase()
                    const languageCompletions = (assignment as any).languageCompletions || []
                    const languageCompletionMap: Record<string, any> = {}
                    ;(Array.isArray(languageCompletions) ? languageCompletions : []).forEach((entry: any) => {
                        const entryLevel = String(entry?.level || '').trim().toUpperCase()
                        if (normalizedCurrentLevel) {
                            if (!entryLevel || entryLevel !== normalizedCurrentLevel) return
                        }
                        const normalized = normalizeLanguageCode(entry?.code)
                        if (!normalized) return
                        languageCompletionMap[normalized] = { ...(entry || {}), code: normalized }
                    })

                    template.pages.forEach((page: any, pageIdx: number) => {
                        (page.blocks || []).forEach((block: any, blockIdx: number) => {
                        let itemsToProcess: any[] = []

                        if (block.type === 'language_toggle' || block.type === 'language_toggle_v2') {
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
                                // Check level
                                let isAssigned = true
                                let itemLevels = item.levels && Array.isArray(item.levels) ? item.levels : []
                                if (itemLevels.length === 0 && item.level) itemLevels = [item.level]

                                if (itemLevels.length > 0) {
                                    if (!level || !itemLevels.some((l: string) => l.trim() === level)) {
                                        isAssigned = false
                                    }
                                }

                                if (isAssigned) {
                                    const lang = (item.type || item.label || 'Autre').toLowerCase()
                                    const code = (item.code || '').toLowerCase()
                                    const isActive = item.active === true || item.active === 'true'

                                    const isCategoryCompleted = () => {
                                        const isArabic = isArabicLanguage(code, lang)
                                        const isEnglish = isEnglishLanguage(code, lang)
                                        const normalized = isArabic ? 'ar' : isEnglish ? 'en' : 'fr'
                                        const lc = languageCompletionMap[normalized]
                                        return !!(lc && (lc.completedSem1 || lc.completedSem2 || lc.completed))
                                    }

                                    const completed = isActive || isCategoryCompleted()

                                    if (isArabicLanguage(code, lang)) {
                                        arabicTotal++
                                        if (completed) arabicFilled++
                                    } else if (isEnglishLanguage(code, lang)) {
                                        englishTotal++
                                        if (completed) englishFilled++
                                    } else {
                                        // Default to Polyvalent (usually French/General)
                                        polyvalentTotal++
                                        if (completed) polyvalentFilled++
                                    }
                                }
                            })
                        })
                    })
                })

                return {
                    studentId: String(student._id),
                    firstName: student.firstName,
                    lastName: student.lastName,
                    arabic: arabicTotal > 0 && arabicTotal === arabicFilled,
                    english: englishTotal > 0 && englishTotal === englishFilled,
                    polyvalent: polyvalentTotal > 0 && polyvalentTotal === polyvalentFilled,
                    hasArabic: arabicTotal > 0,
                    hasEnglish: englishTotal > 0,
                    hasPolyvalent: polyvalentTotal > 0,
                    arabicFilledCount: arabicFilled,
                    arabicTotalCount: arabicTotal,
                    englishFilledCount: englishFilled,
                    englishTotalCount: englishTotal,
                    polyvalentFilledCount: polyvalentFilled,
                    polyvalentTotalCount: polyvalentTotal
                }
            }).filter(Boolean)

            // Sort students by last name
            clsStudents.sort((a: any, b: any) => a.lastName.localeCompare(b.lastName))

            return {
                classId: clsId,
                className: cls.name,
                level: cls.level,
                students: clsStudents
            }
        })

        res.json(result)

    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to fetch detailed teacher progress' })
    }
})

subAdminAssignmentsRouter.get('/teacher-progress', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { schoolYearId } = req.query

        // Get assigned levels
        const scope = await RoleScope.findOne({ userId: subAdminId }).lean()
        if (!scope || !scope.levels || scope.levels.length === 0) {
            return res.json([])
        }

        const levels = scope.levels

        // Get school year - use provided schoolYearId or fall back to active year
        let activeYear
        if (schoolYearId && typeof schoolYearId === 'string') {
            activeYear = await SchoolYear.findById(schoolYearId).lean()
        }
        if (!activeYear) {
            activeYear = await SchoolYear.findOne({ active: true }).lean()
        }
        if (!activeYear) {
            return res.status(400).json({ error: 'no_active_year' })
        }

        // Find classes
        const classes = await ClassModel.find({
            level: { $in: levels },
            schoolYearId: String(activeYear._id)
        }).lean()

        if (classes.length === 0) return res.json([])

        const classIds = classes.map(c => String(c._id))

        // Find teachers for these classes
        const teacherAssignments = await TeacherClassAssignment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean()

        const teacherIds = [...new Set(teacherAssignments.map(ta => ta.teacherId))]
        const teachers = await User.find({ _id: { $in: teacherIds } }).lean()
        const outlookTeachers = await OutlookUser.find({ _id: { $in: teacherIds } }).lean()
        const teacherMap = new Map([...teachers, ...outlookTeachers].map((t: any) => [String(t._id), t]))
        const formatNameFromEmail = (email: string): string => {
            const localPart = String(email || '').split('@')[0] || ''
            const cleaned = localPart.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
            if (!cleaned) return email
            return cleaned
                .split(' ')
                .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : '')
                .join(' ')
                .trim()
        }
        const resolveTeacherName = (teacherId: any): string | null => {
            const teacher = teacherMap.get(String(teacherId))
            if (!teacher) return null
            const displayName = String(teacher.displayName || '').trim()
            if (displayName) return displayName
            const email = String(teacher.email || '').trim()
            if (email) return formatNameFromEmail(email)
            return null
        }

        // Find enrollments
        const enrollments = await Enrollment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean()

        const studentIds = enrollments.map(e => e.studentId)

        // Find assignments for active school year
        const assignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            $or: [
                { completionSchoolYearId: String(activeYear._id) },
                { completionSchoolYearId: { $exists: false }, assignedAt: { $gte: new Date(activeYear.startDate) } }
            ]
        }).lean()

        // Get Templates and Competencies info
        const templateIds = [...new Set(assignments.map(a => a.templateId))]
        const templates = (await Promise.all(templateIds.map(id =>
            withCache(`template-${id}`, () => GradebookTemplate.findById(id).lean())
        ))).filter((t): t is any => !!t)

        const allCompetencies = await withCache('competencies-active', () =>
            Competency.find({ active: true }).lean()
        )
        const compMap = new Map(allCompetencies.map(c => [String(c._id), c]))

        const allCategories = await withCache('categories-active', () =>
            Category.find({ active: true }).lean()
        )
        const catMap = new Map(allCategories.map(c => [String(c._id), c]))

        // Helper to extract competencies from template
        // (Not used for language_toggle logic anymore, but kept if needed for other things)
        const getTemplateCompetencies = (template: any) => {
            // ...
            return new Set<string>()
        }

        const normalizeLanguageCode = (value: any) => {
            const code = String(value || '').trim().toLowerCase()
            if (!code) return ''
            if (code === 'ar' || code === 'lb' || code === 'ara' || code === 'arab') return 'ar'
            if (code === 'en' || code === 'eng' || code === 'uk' || code === 'gb') return 'en'
            if (code === 'fr' || code === 'fra') return 'fr'
            return code
        }

        const isArabicLanguage = (codeRaw: any, labelRaw: any) => {
            const code = normalizeLanguageCode(codeRaw)
            const label = String(labelRaw || '').toLowerCase()
            return code === 'ar' || label.includes('arabe') || label.includes('arabic') || label.includes('العربية')
        }

        const isEnglishLanguage = (codeRaw: any, labelRaw: any) => {
            const code = normalizeLanguageCode(codeRaw)
            const label = String(labelRaw || '').toLowerCase()
            return code === 'en' || label.includes('anglais') || label.includes('english')
        }

        const isTeacherResponsibleForCategory = (ta: any, category: 'Arabe' | 'Anglais' | 'Polyvalent') => {
            const langs = ((ta as any).languages || []).map((tl: string) => String(tl || '').toLowerCase())
            if (category === 'Arabe') {
                if (langs.length === 0) return !(ta as any).isProfPolyvalent
                return langs.some((v: string) => isArabicLanguage(v, v))
            }
            if (category === 'Anglais') {
                if (langs.length === 0) return !(ta as any).isProfPolyvalent
                return langs.some((v: string) => isEnglishLanguage(v, v))
            }
            return (ta as any).isProfPolyvalent || (langs.length === 0 && !(ta as any).isProfPolyvalent)
        }

        // Build result per class
        const result = classes.map(cls => {
            const clsId = String(cls._id)
            const clsTeachers = teacherAssignments
                .filter(ta => String(ta.classId) === clsId)
                .map(ta => resolveTeacherName(ta.teacherId))
                .filter((name): name is string => !!name)

            const clsEnrollments = enrollments.filter(e => e.classId === clsId)
            const clsStudentIds = new Set(clsEnrollments.map(e => e.studentId))

            const clsAssignments = assignments.filter(a => clsStudentIds.has(a.studentId))

            let totalCompetencies = 0
            let filledCompetencies = 0
            const categoryStats: Record<string, { total: number, filled: number, name: string, teachers: string[] }> = {}

            const classTeacherAssignments = teacherAssignments.filter((ta: any) => String(ta.classId) === clsId)
            const getCategoryTeachers = (category: 'Arabe' | 'Anglais' | 'Polyvalent') => {
                const assignedTeachers = classTeacherAssignments
                    .filter((ta: any) => isTeacherResponsibleForCategory(ta, category))
                    .map((ta: any) => resolveTeacherName(ta.teacherId))
                    .filter((name: any): name is string => !!name)
                return Array.from(new Set(assignedTeachers))
            }

            clsEnrollments.forEach(enrollment => {
                const studentAssignments = clsAssignments.filter(a => a.studentId === enrollment.studentId)
                const level = cls.level
                const normalizedCurrentLevel = String(level || '').trim().toUpperCase()

                let arabicTotal = 0, arabicFilled = 0
                let englishTotal = 0, englishFilled = 0
                let polyvalentTotal = 0, polyvalentFilled = 0

                studentAssignments.forEach(assignment => {
                    const templateId = assignment.templateId
                    const template = templates.find(t => String(t._id) === templateId)
                    if (!template) return

                    const assignmentData = assignment.data || {}
                    const languageCompletions = (assignment as any).languageCompletions || []
                    const languageCompletionMap: Record<string, any> = {}
                    ;(Array.isArray(languageCompletions) ? languageCompletions : []).forEach((entry: any) => {
                        const entryLevel = String(entry?.level || '').trim().toUpperCase()
                        if (normalizedCurrentLevel) {
                            if (!entryLevel || entryLevel !== normalizedCurrentLevel) return
                        }
                        const normalized = normalizeLanguageCode(entry?.code)
                        if (!normalized) return
                        languageCompletionMap[normalized] = { ...(entry || {}), code: normalized }
                    })

                    const isCategoryCompleted = (categoryName: string, langCode?: string) => {
                        const l = categoryName.toLowerCase()
                        const isArabic = isArabicLanguage(langCode, l)
                        const isEnglish = isEnglishLanguage(langCode, l)
                        const normalized = isArabic ? 'ar' : isEnglish ? 'en' : 'fr'
                        const lc = languageCompletionMap[normalized]
                        return !!(lc && (lc.completedSem1 || lc.completedSem2 || lc.completed))
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
                                    if (!level || !itemLevels.some((l: string) => l.trim() === level)) {
                                        isAssigned = false
                                    }
                                }

                                if (!isAssigned) return

                                const code = (item.code || '').toLowerCase()
                                const lang = (item.type || item.label || 'Autre').toLowerCase()
                                const isActive = item.active === true || item.active === 'true'
                                const completed = isActive || isCategoryCompleted(lang, code)

                                if (isArabicLanguage(code, lang)) {
                                    arabicTotal++
                                    if (completed) arabicFilled++
                                } else if (isEnglishLanguage(code, lang)) {
                                    englishTotal++
                                    if (completed) englishFilled++
                                } else {
                                    polyvalentTotal++
                                    if (completed) polyvalentFilled++
                                }
                            })
                        })
                    })
                })

                const applyCategory = (name: 'Arabe' | 'Anglais' | 'Polyvalent', total: number, filled: number) => {
                    if (total <= 0) return
                    if (!categoryStats[name]) {
                        categoryStats[name] = {
                            total: 0,
                            filled: 0,
                            name,
                            teachers: getCategoryTeachers(name)
                        }
                    }
                    categoryStats[name].total++
                    totalCompetencies++
                    if (filled === total) {
                        categoryStats[name].filled++
                        filledCompetencies++
                    }
                }

                applyCategory('Arabe', arabicTotal, arabicFilled)
                applyCategory('Anglais', englishTotal, englishFilled)
                applyCategory('Polyvalent', polyvalentTotal, polyvalentFilled)
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
                    percentage: stat.total > 0 ? Math.round((stat.filled / stat.total) * 100) : 0,
                    teachers: stat.teachers
                }))
            }
        })

        res.json(result)

    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to fetch teacher progress' })
    }
})

// SubAdmin: Get list of teachers for assigned levels
subAdminAssignmentsRouter.get('/my-teachers', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { schoolYearId } = req.query

        // Get assigned levels
        const scope = await RoleScope.findOne({ userId: subAdminId }).lean()
        if (!scope || !scope.levels || scope.levels.length === 0) {
            return res.json([])
        }

        const levels = scope.levels

        // Get school year
        let activeYear
        if (schoolYearId && typeof schoolYearId === 'string') {
            activeYear = await SchoolYear.findById(schoolYearId).lean()
        }
        if (!activeYear) {
            activeYear = await SchoolYear.findOne({ active: true }).lean()
        }
        if (!activeYear) {
            return res.status(400).json({ error: 'no_active_year' })
        }

        // Find classes
        const classes = await ClassModel.find({
            level: { $in: levels },
            schoolYearId: String(activeYear._id)
        }).lean()

        if (classes.length === 0) return res.json([])

        const classIds = classes.map(c => String(c._id))
        const classMap = new Map(classes.map(c => [String(c._id), c]))

        // Find teachers for these classes
        const teacherAssignments = await TeacherClassAssignment.find({
            classId: { $in: classIds },
            schoolYearId: String(activeYear._id)
        }).lean()

        const teacherIds = [...new Set(teacherAssignments.map(ta => ta.teacherId))]
        const teachers = await User.find({ _id: { $in: teacherIds } }).lean()
        const outlookTeachers = await OutlookUser.find({ _id: { $in: teacherIds } }).lean()
        const teacherMap = new Map([...teachers, ...outlookTeachers].map((t: any) => [String(t._id), t]))

        // Group by teacher
        const result: any[] = []

        for (const teacherId of teacherIds) {
            const teacherInfo = teacherMap.get(teacherId)
            if (!teacherInfo) continue

            const assignmentsForTeacher = teacherAssignments.filter(ta => ta.teacherId === teacherId)
            
            const teacherClasses = assignmentsForTeacher.map(ta => {
                const cls = classMap.get(ta.classId)
                return {
                    classId: ta.classId,
                    className: cls ? cls.name : 'Unknown',
                    level: cls ? cls.level : 'Unknown',
                    isProfPolyvalent: ta.isProfPolyvalent,
                    languages: ta.languages || []
                }
            })

            result.push({
                teacherId,
                displayName: teacherInfo.displayName || teacherInfo.email || 'Unknown',
                email: teacherInfo.email,
                classes: teacherClasses
            })
        }

        // Sort by display name
        result.sort((a, b) => a.displayName.localeCompare(b.displayName))

        res.json(result)

    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to fetch teachers' })
    }
})
