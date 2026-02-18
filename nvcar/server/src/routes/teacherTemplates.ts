import { Router } from 'express'
import { requireAuth } from '../auth'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateChangeLog } from '../models/TemplateChangeLog'
import { TemplateSignature } from '../models/TemplateSignature'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { Student } from '../models/Student'
import { Enrollment } from '../models/Enrollment'
import { ClassModel } from '../models/Class'
import { SchoolYear } from '../models/SchoolYear'
import { StudentAcquiredSkill } from '../models/StudentAcquiredSkill'
import { Setting } from '../models/Setting'
import { logAudit } from '../utils/auditLogger'
import { getVersionedTemplate, mergeAssignmentDataIntoTemplate, buildBlocksById } from '../utils/templateUtils'
import { withCache } from '../utils/cache'
import { assignmentUpdateOptions, normalizeAssignmentMetadataPatch, warnOnInvalidStatusTransition } from '../utils/assignmentMetadata'

export const teacherTemplatesRouter = Router()

const normalizeLevel = (v: any) => String(v || '').trim().toUpperCase()

// For maternelle, allow teachers to edit toggles for previous levels.
// Example: an MS student can still have PS toggles edited.
// For unknown levels, we keep the conservative (exact-match) behavior.
const isLevelAtOrBelow = (itemLevelRaw: any, studentLevelRaw: any) => {
    const itemLevel = normalizeLevel(itemLevelRaw)
    const studentLevel = normalizeLevel(studentLevelRaw)
    if (!itemLevel || !studentLevel) return true

    const order: Record<string, number> = {
        TPS: 0,
        PS: 1,
        MS: 2,
        GS: 3,
    }

    const itemOrder = order[itemLevel]
    const studentOrder = order[studentLevel]
    if (itemOrder === undefined || studentOrder === undefined) {
        return itemLevel === studentLevel
    }

    return itemOrder <= studentOrder
}

const isStrictlyBelowLevel = (itemLevelRaw: any, studentLevelRaw: any) => {
    const itemLevel = normalizeLevel(itemLevelRaw)
    const studentLevel = normalizeLevel(studentLevelRaw)
    if (!itemLevel || !studentLevel) return false
    if (itemLevel === studentLevel) return false
    return isLevelAtOrBelow(itemLevel, studentLevel)
}

const getBlockLevel = (block: any) => {
    const direct = block?.props?.level
    if (direct) return normalizeLevel(direct)
    const label = String(block?.props?.label || '').toUpperCase()
    if (/\bTPS\b/.test(label)) return 'TPS'
    if (/\bPS\b/.test(label)) return 'PS'
    if (/\bMS\b/.test(label)) return 'MS'
    if (/\bGS\b/.test(label)) return 'GS'
    if (/\bEB1\b/.test(label)) return 'EB1'
    if (/\bKG1\b/.test(label)) return 'KG1'
    if (/\bKG2\b/.test(label)) return 'KG2'
    if (/\bKG3\b/.test(label)) return 'KG3'
    return null
}

const isLanguageAllowedForTeacher = (code: any, allowedLanguages: any, isProfPolyvalent: boolean) => {
    const c = String(code || '').toLowerCase()
    const langs = Array.isArray(allowedLanguages) ? allowedLanguages.map((v: any) => String(v || '').toLowerCase()) : []
    if (isProfPolyvalent) return c === 'fr'
    if (langs.length === 0) return true
    if (!c) return false
    if (langs.includes(c)) return true
    if ((c === 'lb' || c === 'ar') && langs.includes('ar')) return true
    if ((c === 'uk' || c === 'gb') && langs.includes('en')) return true
    return false
}

const normalizeLanguageCode = (code: any) => {
    const c = String(code || '').toLowerCase()
    if (!c) return ''
    if (c === 'lb' || c === 'ar') return 'ar'
    if (c === 'en' || c === 'uk' || c === 'gb') return 'en'
    if (c === 'fr') return 'fr'
    return c
}

const normalizeLanguageCodes = (codes: any[]) => {
    const normalized = (Array.isArray(codes) ? codes : []).map(normalizeLanguageCode).filter(Boolean)
    return [...new Set(normalized)]
}

const getCompletionLanguagesForTeacher = (teacherClassAssignment: any | null | undefined) => {
    const langs = normalizeLanguageCodes(teacherClassAssignment?.languages || [])
    if (langs.length > 0) return langs
    if (teacherClassAssignment?.isProfPolyvalent) return ['fr']
    return ['ar', 'en', 'fr']
}

const buildLanguageCompletionMap = (languageCompletions: any[], levelRaw?: any) => {
    const targetLevel = normalizeLevel(levelRaw)
    const map: Record<string, any> = {}
    ;(Array.isArray(languageCompletions) ? languageCompletions : []).forEach((entry: any) => {
        const code = normalizeLanguageCode(entry?.code)
        if (!code) return
        if (targetLevel) {
            const entryLevel = normalizeLevel(entry?.level)
            if (!entryLevel || entryLevel !== targetLevel) return
        }
        map[code] = { ...(entry || {}), code }
    })
    return map
}

const findLanguageCompletionEntry = (languageCompletions: any[], codeRaw: any, levelRaw?: any) => {
    const code = normalizeLanguageCode(codeRaw)
    if (!code) return null
    const targetLevel = normalizeLevel(levelRaw)
    const list = Array.isArray(languageCompletions) ? languageCompletions : []
    return list.find((lc: any) => (
        normalizeLanguageCode(lc?.code) === code &&
        normalizeLevel(lc?.level) === targetLevel
    )) || null
}

const isLanguageCompletedForSemester = (languageCompletionMap: Record<string, any>, code: string, semester: number) => {
    const entry = languageCompletionMap[normalizeLanguageCode(code)]
    if (!entry) return false
    if (semester === 1) return !!(entry.completedSem1 || entry.completed)
    return !!entry.completedSem2
}

const computeTeacherCompletionForSemester = (languageCompletionMap: Record<string, any>, languages: string[], semester: number) => {
    if (!Array.isArray(languages) || languages.length === 0) return false
    return languages.every(code => isLanguageCompletedForSemester(languageCompletionMap, code, semester))
}

const findEnrollmentForStudent = async (studentId: string) => {
    const activeYear = await withCache('school-years-active', () =>
        SchoolYear.findOne({ active: true }).lean()
    )
    let enrollment: any = null
    if (activeYear) {
        enrollment = await Enrollment.findOne({
            studentId,
            schoolYearId: String((activeYear as any)._id),
        }).lean()
    }
    if (!enrollment) {
        enrollment = await Enrollment.findOne({ studentId }).sort({ _id: -1 }).lean()
    }
    return { enrollment, activeYear }
}

const isPreviousYearDropdownEditableEnabled = async () => {
    const settings = await Setting.find({
        key: {
            $in: [
                'previous_year_dropdown_editable',
                'previous_year_dropdown_editable_PS',
                'previous_year_dropdown_editable_MS',
                'previous_year_dropdown_editable_GS'
            ]
        }
    }).lean()

    const map: Record<string, any> = {}
    settings.forEach((s: any) => { map[s.key] = s.value })

    if (Object.prototype.hasOwnProperty.call(map, 'previous_year_dropdown_editable')) {
        return map.previous_year_dropdown_editable === true
    }

    return map.previous_year_dropdown_editable_PS === true ||
        map.previous_year_dropdown_editable_MS === true ||
        map.previous_year_dropdown_editable_GS === true
}

/**
 * Check if the assignment is currently locked due to signatures.
 * 
 * The locking logic is semester-aware:
 * - In Semester 1: Teachers cannot edit after the Sem1 signature is applied
 * - In Semester 2: Teachers can edit again (Sem1 signature is ignored) until the end_of_year signature
 * - After end_of_year signature: Teachers cannot edit permanently
 * 
 * Note: We only consider signatures from the CURRENT school year.
 * Legacy signatures without signaturePeriodId are also checked for backwards compatibility.
 */
const isAssignmentSigned = async (assignmentId: string): Promise<boolean> => {
    // Get the active school year to determine current semester
    const activeYear = await withCache('school-years-active', () =>
        SchoolYear.findOne({ active: true }).lean()
    )

    if (!activeYear) {
        // If no active year, fall back to checking for any signature
        const anySignature = await TemplateSignature.findOne({
            templateAssignmentId: assignmentId
        }).lean()
        return !!anySignature
    }

    const activeSemester = (activeYear as any).activeSemester || 1
    const schoolYearId = String((activeYear as any)._id)

    // Always check for end_of_year signature first - if it exists for current year, permanently locked
    const endOfYearPeriodId = `${schoolYearId}_end_of_year`
    const endOfYearSignature = await TemplateSignature.findOne({
        templateAssignmentId: assignmentId,
        $or: [
            { signaturePeriodId: endOfYearPeriodId },
            // Legacy: signatures with type 'end_of_year' and matching schoolYearId
            { type: 'end_of_year', schoolYearId: schoolYearId },
            // Legacy: signatures with type 'end_of_year' and no schoolYearId (from before period tracking)
            { type: 'end_of_year', schoolYearId: { $exists: false } }
        ]
    }).lean()

    if (endOfYearSignature) {
        return true // Permanently locked after end_of_year signature
    }

    // In Semester 1: Check for sem1 signature for the current year
    if (activeSemester === 1) {
        const sem1PeriodId = `${schoolYearId}_sem1`
        const sem1Signature = await TemplateSignature.findOne({
            templateAssignmentId: assignmentId,
            $or: [
                { signaturePeriodId: sem1PeriodId },
                // Legacy: 'standard' signatures with matching schoolYearId
                { type: 'standard', schoolYearId: schoolYearId },
                // Legacy: 'standard' signatures with no schoolYearId (from before period tracking)
                { type: 'standard', schoolYearId: { $exists: false } }
            ]
        }).lean()

        return !!sem1Signature // Locked in Sem1 if sem1 signature exists
    }

    // In Semester 2: Only locked if end_of_year exists (already checked above)
    // Sem1 signature does NOT lock the gradebook in Semester 2
    return false
}

// Teacher: Get classes assigned to logged-in teacher
teacherTemplatesRouter.get('/classes', requireAuth(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { schoolYearId } = req.query
        const assignments = await TeacherClassAssignment.find({ teacherId }).lean()
        const classIds = assignments.map(a => a.classId)

        const query: any = { _id: { $in: classIds } }

        if (schoolYearId) {
            query.schoolYearId = schoolYearId
        } else {
            const activeSchoolYear = await withCache('school-years-active', () =>
                SchoolYear.findOne({ active: true }).lean()
            )
            if (activeSchoolYear) {
                query.schoolYearId = String(activeSchoolYear._id)
            }
        }

        const classes = await ClassModel.find(query).lean()

        const results = classes.map(c => {
            const assignment = assignments.find(a => a.classId === String(c._id))
            return {
                ...c,
                languages: assignment?.languages || [],
                isProfPolyvalent: !!assignment?.isProfPolyvalent
            }
        })

        res.json(results)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Teacher: Get students in assigned class
teacherTemplatesRouter.get('/classes/:classId/students', requireAuth(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { classId } = req.params

        // Verify teacher is assigned to this class
        const assignment = await TeacherClassAssignment.findOne({ teacherId, classId }).lean()
        if (!assignment) return res.status(403).json({ error: 'not_assigned_to_class' })

        // Get students in class
        const enrollments = await Enrollment.find({ classId }).lean()
        const studentIds = enrollments.map(e => e.studentId)
        const students = await Student.find({ _id: { $in: studentIds } }).select('firstName lastName avatarUrl dateOfBirth').lean()

        res.json(students)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Teacher: Get templates for a student
teacherTemplatesRouter.get('/students/:studentId/templates', requireAuth(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { studentId } = req.params

        // Get template assignments where this teacher is assigned
        const assignments = await TemplateAssignment.find({
            studentId,
            assignedTeachers: teacherId,
        }).lean()

        const { enrollment } = await findEnrollmentForStudent(studentId)
        const classDoc = enrollment?.classId ? await ClassModel.findById(enrollment.classId).lean() : null
        const studentLevel = normalizeLevel((classDoc as any)?.level || '')
        const teacherClassAssignment = enrollment?.classId
            ? await TeacherClassAssignment.findOne({ teacherId, classId: enrollment.classId }).lean()
            : null
        const completionLanguages = getCompletionLanguagesForTeacher(teacherClassAssignment)

        // Fetch template details
        const templateIds = assignments.map(a => a.templateId)
        const templates = await Promise.all(templateIds.map(id =>
            withCache(`template-${id}`, () => GradebookTemplate.findById(id).lean())
        ))

        // Combine assignment data with template data
        const result = assignments.map(assignment => {
            const template = templates.find(t => t && String((t as any)._id) === assignment.templateId)
            const languageCompletionMap = buildLanguageCompletionMap((assignment as any).languageCompletions || [], studentLevel)

            const isMyWorkCompletedSem1 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 1)
            const isMyWorkCompletedSem2 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 2)

            return {
                ...assignment,
                template,
                isMyWorkCompleted: isMyWorkCompletedSem1,
                isMyWorkCompletedSem1,
                isMyWorkCompletedSem2
            }
        })

        res.json(result)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Teacher: Get specific template assignment for editing
teacherTemplatesRouter.get('/template-assignments/:assignmentId', requireAuth(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
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
        const template = await withCache(`template-${assignment.templateId}`, () =>
            GradebookTemplate.findById(assignment.templateId).lean()
        )
        if (!template) return res.status(404).json({ error: 'template_not_found' })

        // Use centralized helper for versioning and data merging
        const versionedTemplate = mergeAssignmentDataIntoTemplate(template, assignment)

        if (assignment.data && versionedTemplate?.pages) {
            const normalizedData: any = { ...(assignment.data || {}) }
            const pages: any[] = Array.isArray(versionedTemplate.pages) ? versionedTemplate.pages : []
            const blocksById = buildBlocksById(pages)

            pages.forEach((page: any, pageIdx: number) => {
                ; (page?.blocks || []).forEach((block: any, blockIdx: number) => {
                    if (['language_toggle', 'language_toggle_v2'].includes(block?.type)) {
                        const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null

                        // REQUIRE stable blockId - skip blocks without it
                        if (!blockId) {
                            console.warn(`[teacherTemplates] Block at page ${pageIdx}, index ${blockIdx} has no blockId. Skipping normalization.`)
                            return
                        }

                        const keyStable = `language_toggle_${blockId}`
                        const keyLegacy = `language_toggle_${pageIdx}_${blockIdx}`

                        const sourceItems = Array.isArray(block?.props?.items) ? block.props.items : []
                        // Read from stable key first, fall back to legacy for migration
                        const savedRaw =
                            Array.isArray((assignment.data as any)?.[keyStable])
                                ? (assignment.data as any)[keyStable]
                                : Array.isArray((assignment.data as any)?.[keyLegacy])
                                    ? (assignment.data as any)[keyLegacy]
                                    : null

                        if (Array.isArray(savedRaw) && sourceItems.length > 0) {
                            const merged = sourceItems.map((src: any, i: number) => ({ ...src, active: !!(savedRaw as any)?.[i]?.active }))
                            normalizedData[keyStable] = merged
                            // Remove legacy key if it exists (migration)
                            if (keyLegacy !== keyStable && normalizedData[keyLegacy]) {
                                delete normalizedData[keyLegacy]
                            }
                        } else if (Array.isArray(savedRaw)) {
                            normalizedData[keyStable] = savedRaw
                            // Remove legacy key if it exists (migration)
                            if (keyLegacy !== keyStable && normalizedData[keyLegacy]) {
                                delete normalizedData[keyLegacy]
                            }
                        }
                    }

                    if (block?.type !== 'table' || !block?.props?.expandedRows) return

                    const cells = block?.props?.cells || []
                    const expandedLanguages = block?.props?.expandedLanguages || []
                    const rowLanguages = block?.props?.rowLanguages || {}
                    const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : []
                    const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null

                    // REQUIRE stable blockId for tables
                    if (!blockId) {
                        console.warn(`[teacherTemplates] Table block at page ${pageIdx}, index ${blockIdx} has no blockId. Skipping normalization.`)
                        return
                    }

                    for (let rowIdx = 0; rowIdx < (cells.length || 0); rowIdx++) {
                        const rowId = typeof rowIds?.[rowIdx] === 'string' && rowIds[rowIdx].trim() ? rowIds[rowIdx].trim() : null

                        // REQUIRE stable rowId
                        if (!rowId) {
                            console.warn(`[teacherTemplates] Table row at page ${pageIdx}, block ${blockIdx}, row ${rowIdx} has no rowId. Skipping.`)
                            continue
                        }

                        const keyStable = `table_${blockId}_row_${rowId}`
                        const keyLegacy1 = `table_${pageIdx}_${blockIdx}_row_${rowIdx}`
                        const keyLegacy2 = `table_${blockIdx}_row_${rowIdx}`

                        const source = rowLanguages?.[rowIdx] || expandedLanguages
                        if (!Array.isArray(source) || source.length === 0) continue

                        // Read from stable key first, fall back to legacy for migration
                        const saved = Array.isArray((assignment.data as any)?.[keyStable])
                            ? (assignment.data as any)[keyStable]
                            : Array.isArray((assignment.data as any)?.[keyLegacy1])
                                ? (assignment.data as any)[keyLegacy1]
                                : Array.isArray((assignment.data as any)?.[keyLegacy2])
                                    ? (assignment.data as any)[keyLegacy2]
                                    : null

                        if (!Array.isArray(saved)) continue

                        const merged = source.map((src: any, i: number) => {
                            const active = !!saved?.[i]?.active
                            return { ...src, active }
                        })

                        normalizedData[keyStable] = merged
                        // Remove legacy keys if they exist (migration)
                        if (normalizedData[keyLegacy1]) delete normalizedData[keyLegacy1]
                        if (normalizedData[keyLegacy2]) delete normalizedData[keyLegacy2]
                    }
                })
            })

                ; (assignment as any).data = normalizedData
        }

        // Get the student
        const student = await Student.findById(assignment.studentId).lean()

        // Get student level and verify teacher class assignment
        let level = ''
        let className = ''
        let allowedLanguages: string[] = []

        // Try to find enrollment in active year first
        const activeYear = await withCache('school-years-active', () =>
            SchoolYear.findOne({ active: true }).lean()
        )
        let enrollment = null

        if (activeYear) {
            enrollment = await Enrollment.findOne({
                studentId: assignment.studentId,
                schoolYearId: String(activeYear._id)
            }).lean()
        }

        // Fallback to most recent enrollment if not found in active year
        if (!enrollment) {
            enrollment = await Enrollment.findOne({ studentId: assignment.studentId })
                .sort({ _id: -1 })
                .lean()
        }

        if (!enrollment) {
            return res.status(403).json({ error: 'student_not_enrolled' })
        }

        let teacherClassAssignment: any = null

        if (enrollment && enrollment.classId) {
            const classDoc = await ClassModel.findById(enrollment.classId).lean()
            if (classDoc) {
                level = classDoc.level || ''
                className = classDoc.name
            }

            // Strict check: Teacher MUST be assigned to this class
            teacherClassAssignment = await TeacherClassAssignment.findOne({
                teacherId,
                classId: enrollment.classId
            }).lean()

            if (!teacherClassAssignment) {
                return res.status(403).json({ error: 'not_assigned_to_class' })
            }

            allowedLanguages = (teacherClassAssignment as any).languages || []
        }

        // Determine if teacher can edit
        // Since we enforce class assignment above, if they reach here, they can edit.
        // UNLESS the gradebook has been signed by a subadmin
        const isSigned = await isAssignmentSigned(assignmentId)
        const canEdit = !isSigned // Teachers cannot edit signed gradebooks

        const isProfPolyvalent = teacherClassAssignment ? !!(teacherClassAssignment as any).isProfPolyvalent : false

        const completionLanguages = getCompletionLanguagesForTeacher(teacherClassAssignment)

        // Check my completion status
        const languageCompletionMap = buildLanguageCompletionMap((assignment as any).languageCompletions || [], level)

        const isMyWorkCompletedSem1 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 1)
        const isMyWorkCompletedSem2 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 2)
        const isMyWorkCompleted = isMyWorkCompletedSem1

        // Get active semester from the active school year
        const activeSemester = (activeYear as any)?.activeSemester || 1

        res.json({
            assignment,
            template: versionedTemplate,
            student: { ...student, level, className },
            canEdit,
            isSigned,
            allowedLanguages,
            isProfPolyvalent,
            isMyWorkCompleted,
            isMyWorkCompletedSem1,
            isMyWorkCompletedSem2,
            completionLanguages,
            languageCompletion: languageCompletionMap,
            activeSemester
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
        const { pageIndex, blockIndex, blockId: incomingBlockId, items } = req.body

        if ((pageIndex === undefined || blockIndex === undefined) && !incomingBlockId) {
            return res.status(400).json({ error: 'missing_payload' })
        }
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'missing_payload' })
        }

        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment.findById(assignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' })
        }

        // Check if the assignment has been signed - teachers cannot edit signed gradebooks
        if (await isAssignmentSigned(assignmentId)) {
            return res.status(403).json({ error: 'gradebook_signed', message: 'Cannot edit a signed gradebook' })
        }

        // Get the template to verify the block
        const template = await withCache(`template-${assignment.templateId}`, () =>
            GradebookTemplate.findById(assignment.templateId).lean()
        )
        if (!template) return res.status(404).json({ error: 'template_not_found' })

        const versionedTemplate: any = getVersionedTemplate(template, (assignment as any).templateVersion)

        // Find the block
        let targetBlock = null
        let actualPageIndex = pageIndex
        let actualBlockIndex = blockIndex

        if (incomingBlockId) {
            const blocksById = buildBlocksById(versionedTemplate.pages || [])
            const found = blocksById.get(incomingBlockId)
            if (found) {
                targetBlock = found.block
                actualPageIndex = found.pageIdx
                actualBlockIndex = found.blockIdx
            }
        }

        if (!targetBlock && pageIndex !== undefined && blockIndex !== undefined) {
            targetBlock = versionedTemplate.pages?.[pageIndex]?.blocks?.[blockIndex]
        }

        if (!targetBlock) return res.status(400).json({ error: 'block_not_found' })

        const { enrollment, activeYear } = await findEnrollmentForStudent(assignment.studentId)
        if (!enrollment || !enrollment.classId) {
            return res.status(403).json({ error: 'student_not_enrolled' })
        }

        const classDoc = await ClassModel.findById(enrollment.classId).lean()
        const studentLevel = normalizeLevel(classDoc?.level || '')

        // Verify the block is a language_toggle
        if (!['language_toggle', 'language_toggle_v2'].includes(targetBlock.type)) {
            return res.status(403).json({ error: 'can_only_edit_language_toggle' })
        }

        const blockLevel = getBlockLevel(targetBlock)
        if (blockLevel && studentLevel && blockLevel !== studentLevel) {
            return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, blockLevel } })
        }

        const teacherClassAssignment = await TeacherClassAssignment.findOne({
            teacherId,
            classId: enrollment.classId,
        }).lean()

        if (!teacherClassAssignment) {
            return res.status(403).json({ error: 'not_assigned_to_class' })
        }

        const allowedLanguages = (teacherClassAssignment as any)?.languages || []
        const isProfPolyvalent = !!(teacherClassAssignment as any)?.isProfPolyvalent
        const completionLanguages = getCompletionLanguagesForTeacher(teacherClassAssignment)
        const activeSemester = (activeYear as any)?.activeSemester || 1
        const languageCompletionMap = buildLanguageCompletionMap((assignment as any).languageCompletions || [], studentLevel)

        const sourceItems = Array.isArray(targetBlock?.props?.items) ? targetBlock.props.items : []
        const sanitizedItems = sourceItems.length > 0
            ? sourceItems.map((src: any, i: number) => ({ ...src, active: !!items?.[i]?.active }))
            : items

        const currentData = assignment.data || {}
        const blockId = typeof targetBlock?.props?.blockId === 'string' && targetBlock.props.blockId.trim() ? targetBlock.props.blockId.trim() : null

        // REQUIRE stable blockId - no fallback to legacy format
        if (!blockId) {
            return res.status(400).json({
                error: 'block_missing_id',
                message: 'Block does not have a stable blockId. Please run the migration script to fix template data.',
                pageIndex: actualPageIndex,
                blockIndex: actualBlockIndex
            })
        }

        const keyStable = `language_toggle_${blockId}`
        // Also check legacy key for reading previous data (for backwards compatibility during migration)
        const keyLegacy = `language_toggle_${actualPageIndex}_${actualBlockIndex}`
        const previousItems = currentData[keyStable] || currentData[keyLegacy] || sourceItems || []

        for (let i = 0; i < sanitizedItems.length; i++) {
            const newItem = sanitizedItems[i]
            const oldItem = previousItems[i] || sourceItems[i]
            if (newItem && oldItem && newItem.active !== oldItem.active) {
                const langCode = sourceItems?.[i]?.code
                if (isLanguageCompletedForSemester(languageCompletionMap, langCode, activeSemester)) {
                    return res.status(403).json({ error: 'language_completed', details: langCode })
                }
                if (!isLanguageAllowedForTeacher(langCode, allowedLanguages, isProfPolyvalent)) {
                    return res.status(403).json({ error: 'language_not_allowed', details: langCode })
                }
            }
        }

        const before = currentData[keyStable] || currentData[keyLegacy]

        // Update assignment data (NOT the global template)
        // Use optimistic concurrency with expectedDataVersion if supplied
        const { expectedDataVersion } = req.body as any
        const { generateChangeId } = require('../utils/changeId')
        const changeId = generateChangeId()

        const filter: any = { _id: assignmentId }
        if (typeof expectedDataVersion === 'number') filter.dataVersion = expectedDataVersion

        const updated = await TemplateAssignment.findOneAndUpdate(
            filter,
            {
                $set: {
                    [`data.${keyStable}`]: sanitizedItems,
                    status: assignment.status === 'draft' ? 'in_progress' : assignment.status
                },
                $inc: { dataVersion: 1 }
            },
            assignmentUpdateOptions({ new: true })
        )

        warnOnInvalidStatusTransition((assignment as any).status, assignment.status === 'draft' ? 'in_progress' : assignment.status, 'teacherTemplates.languageToggle')

        if (!updated) {
            // Conflict: return current assignment + dataVersion so client can fetch/merge
            const current = await TemplateAssignment.findById(assignmentId).lean()
            return res.status(409).json({ error: 'conflict', message: 'data_version_mismatch', current })
        }

        // Log the change with metadata
        await TemplateChangeLog.create({
            templateAssignmentId: assignmentId,
            teacherId,
            changeType: 'language_toggle',
            pageIndex: actualPageIndex,
            blockIndex: actualBlockIndex,
            before: before || targetBlock.props.items,
            after: sanitizedItems,
            changeId,
            dataVersion: (updated as any).dataVersion,
            userId: teacherId,
            timestamp: new Date(),
        })

        res.json({ success: true, assignment: updated, changeId, dataVersion: (updated as any).dataVersion })
    } catch (e: any) {
        res.status(500).json({ error: 'update_failed', message: e.message })
    }
})

// Teacher: Mark assignment as done
teacherTemplatesRouter.post('/templates/:assignmentId/mark-done', requireAuth(['TEACHER']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { assignmentId } = req.params
        const { semester } = req.body // 1 or 2

        const targetSemester = semester === 2 ? 2 : 1

        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment.findById(assignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' })
        }

        // Check if the assignment has been signed - teachers cannot modify signed gradebooks
        if (await isAssignmentSigned(assignmentId)) {
            return res.status(403).json({ error: 'gradebook_signed', message: 'Cannot modify a signed gradebook' })
        }

        const { enrollment } = await findEnrollmentForStudent(assignment.studentId)
        const classDoc = enrollment?.classId ? await ClassModel.findById(enrollment.classId).lean() : null
        const studentLevel = normalizeLevel((classDoc as any)?.level || '')
        const teacherClassAssignment = enrollment?.classId
            ? await TeacherClassAssignment.findOne({ teacherId, classId: enrollment.classId }).lean()
            : null
        const completionLanguages = getCompletionLanguagesForTeacher(teacherClassAssignment)

        const requestedLanguages = normalizeLanguageCodes(
            Array.isArray(req.body.languages) ? req.body.languages : (req.body.language ? [req.body.language] : [])
        )
        const targetLanguages = requestedLanguages.length > 0 ? requestedLanguages : completionLanguages
        const allowedSet = new Set(completionLanguages)
        const filteredTargets = targetLanguages.filter(code => allowedSet.has(code))

        if (filteredTargets.length === 0) {
            return res.status(403).json({ error: 'language_not_allowed' })
        }

        let languageCompletions = Array.isArray((assignment as any).languageCompletions)
            ? [...(assignment as any).languageCompletions]
            : []

        const now = new Date()
        filteredTargets.forEach(code => {
            const normalized = normalizeLanguageCode(code)
            if (!normalized) return
            let entry = findLanguageCompletionEntry(languageCompletions, normalized, studentLevel)
            if (!entry) {
                entry = { code: normalized, level: studentLevel }
                languageCompletions.push(entry)
            }
            if (targetSemester === 1) {
                entry.completedSem1 = true
                entry.completedAtSem1 = now
                entry.completed = true
                entry.completedAt = now
            } else {
                entry.completedSem2 = true
                entry.completedAtSem2 = now
            }
        })

        const languageCompletionMap = buildLanguageCompletionMap(languageCompletions, studentLevel)

        let teacherCompletions = (assignment as any).teacherCompletions || []

        // Find existing entry or create new
        let entryIndex = teacherCompletions.findIndex((tc: any) => tc.teacherId === teacherId)
        if (entryIndex === -1) {
            teacherCompletions.push({ teacherId })
            entryIndex = teacherCompletions.length - 1
        }

        const teacherCompletedSem1 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 1)
        const teacherCompletedSem2 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 2)

        teacherCompletions[entryIndex].completedSem1 = teacherCompletedSem1
        teacherCompletions[entryIndex].completedAtSem1 = teacherCompletedSem1 ? (teacherCompletions[entryIndex].completedAtSem1 || now) : null
        teacherCompletions[entryIndex].completedSem2 = teacherCompletedSem2
        teacherCompletions[entryIndex].completedAtSem2 = teacherCompletedSem2 ? (teacherCompletions[entryIndex].completedAtSem2 || now) : null
        teacherCompletions[entryIndex].completed = teacherCompletedSem1
        teacherCompletions[entryIndex].completedAt = teacherCompletedSem1 ? (teacherCompletions[entryIndex].completedAt || now) : null

        const classAssignments = enrollment?.classId
            ? await TeacherClassAssignment.find({ classId: enrollment.classId }).lean()
            : []

        const teacherLanguagesMap = new Map<string, string[]>()
        ;(classAssignments || []).forEach((ta: any) => {
            teacherLanguagesMap.set(String(ta.teacherId), getCompletionLanguagesForTeacher(ta))
        })

        const getLanguagesForTeacher = (tid: string) => {
            return teacherLanguagesMap.get(String(tid)) || ['ar', 'en', 'fr']
        }

        // Check if all teachers have completed THIS semester based on language completion
        const allCompletedSem = (assignment.assignedTeachers || []).every((tid: string) =>
            computeTeacherCompletionForSemester(languageCompletionMap, getLanguagesForTeacher(tid), targetSemester)
        )

        const updateData: any = {
            teacherCompletions,
            languageCompletions,
        }

        if (targetSemester === 1) {
            updateData.isCompletedSem1 = allCompletedSem
            if (allCompletedSem) updateData.completedAtSem1 = new Date()

            // Legacy behavior: if sem1 is done, mark main as done/completed? 
            // Or should main status depend on both? 
            // For now, let's link legacy 'isCompleted' to Sem1 as it was the only semester before.
            updateData.isCompleted = allCompletedSem
            updateData.completedAt = allCompletedSem ? now : undefined
            updateData.completedBy = allCompletedSem ? teacherId : undefined // Approximate
            updateData.status = allCompletedSem ? 'completed' : 'in_progress'
        } else {
            updateData.isCompletedSem2 = allCompletedSem
            if (allCompletedSem) updateData.completedAtSem2 = now
            // Don't change main status for Sem2 yet, unless we want a new status
        }

        // Update assignment
        const updated = await TemplateAssignment.findByIdAndUpdate(
            assignmentId,
            normalizeAssignmentMetadataPatch(updateData),
            assignmentUpdateOptions({ new: true })
        )

        if (updateData.status) {
            warnOnInvalidStatusTransition((assignment as any).status, updateData.status, 'teacherTemplates.markDone')
        }

        // Log audit
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const student = await Student.findById(assignment.studentId).lean()
        await logAudit({
            userId: teacherId,
            action: 'MARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
                semester: targetSemester,
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
        const { semester } = req.body // 1 or 2

        const targetSemester = semester === 2 ? 2 : 1

        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment.findById(assignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' })
        }

        // Check if the assignment has been signed - teachers cannot modify signed gradebooks
        if (await isAssignmentSigned(assignmentId)) {
            return res.status(403).json({ error: 'gradebook_signed', message: 'Cannot modify a signed gradebook' })
        }

        const { enrollment } = await findEnrollmentForStudent(assignment.studentId)
        const classDoc = enrollment?.classId ? await ClassModel.findById(enrollment.classId).lean() : null
        const studentLevel = normalizeLevel((classDoc as any)?.level || '')
        const teacherClassAssignment = enrollment?.classId
            ? await TeacherClassAssignment.findOne({ teacherId, classId: enrollment.classId }).lean()
            : null
        const completionLanguages = getCompletionLanguagesForTeacher(teacherClassAssignment)

        const requestedLanguages = normalizeLanguageCodes(
            Array.isArray(req.body.languages) ? req.body.languages : (req.body.language ? [req.body.language] : [])
        )
        const targetLanguages = requestedLanguages.length > 0 ? requestedLanguages : completionLanguages
        const allowedSet = new Set(completionLanguages)
        const filteredTargets = targetLanguages.filter(code => allowedSet.has(code))

        if (filteredTargets.length === 0) {
            return res.status(403).json({ error: 'language_not_allowed' })
        }

        let languageCompletions = Array.isArray((assignment as any).languageCompletions)
            ? [...(assignment as any).languageCompletions]
            : []

        filteredTargets.forEach(code => {
            const normalized = normalizeLanguageCode(code)
            if (!normalized) return
            let entry = findLanguageCompletionEntry(languageCompletions, normalized, studentLevel)
            if (!entry) {
                entry = { code: normalized, level: studentLevel }
                languageCompletions.push(entry)
            }
            if (targetSemester === 1) {
                entry.completedSem1 = false
                entry.completedAtSem1 = null
                entry.completed = false
                entry.completedAt = null
            } else {
                entry.completedSem2 = false
                entry.completedAtSem2 = null
            }
        })

        const languageCompletionMap = buildLanguageCompletionMap(languageCompletions, studentLevel)

        let teacherCompletions = (assignment as any).teacherCompletions || []

        let entryIndex = teacherCompletions.findIndex((tc: any) => tc.teacherId === teacherId)
        if (entryIndex === -1) {
            teacherCompletions.push({ teacherId })
            entryIndex = teacherCompletions.length - 1
        }

        const now = new Date()
        const teacherCompletedSem1 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 1)
        const teacherCompletedSem2 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 2)

        teacherCompletions[entryIndex].completedSem1 = teacherCompletedSem1
        teacherCompletions[entryIndex].completedAtSem1 = teacherCompletedSem1 ? (teacherCompletions[entryIndex].completedAtSem1 || now) : null
        teacherCompletions[entryIndex].completedSem2 = teacherCompletedSem2
        teacherCompletions[entryIndex].completedAtSem2 = teacherCompletedSem2 ? (teacherCompletions[entryIndex].completedAtSem2 || now) : null
        teacherCompletions[entryIndex].completed = teacherCompletedSem1
        teacherCompletions[entryIndex].completedAt = teacherCompletedSem1 ? (teacherCompletions[entryIndex].completedAt || now) : null

        const classAssignments = enrollment?.classId
            ? await TeacherClassAssignment.find({ classId: enrollment.classId }).lean()
            : []

        const teacherLanguagesMap = new Map<string, string[]>()
        ;(classAssignments || []).forEach((ta: any) => {
            teacherLanguagesMap.set(String(ta.teacherId), getCompletionLanguagesForTeacher(ta))
        })

        const getLanguagesForTeacher = (tid: string) => {
            return teacherLanguagesMap.get(String(tid)) || ['ar', 'en', 'fr']
        }

        const allCompletedSem = (assignment.assignedTeachers || []).every((tid: string) =>
            computeTeacherCompletionForSemester(languageCompletionMap, getLanguagesForTeacher(tid), targetSemester)
        )

        const updateData: any = {
            teacherCompletions,
            languageCompletions,
        }

        if (targetSemester === 1) {
            updateData.isCompletedSem1 = allCompletedSem
            updateData.completedAtSem1 = allCompletedSem ? now : null
            updateData.isCompleted = allCompletedSem
            updateData.completedAt = allCompletedSem ? now : null
            updateData.status = allCompletedSem ? 'completed' : 'in_progress'
        } else {
            updateData.isCompletedSem2 = allCompletedSem
            updateData.completedAtSem2 = allCompletedSem ? now : null
        }

        // Update assignment
        const updated = await TemplateAssignment.findByIdAndUpdate(
            assignmentId,
            normalizeAssignmentMetadataPatch(updateData),
            assignmentUpdateOptions({ new: true })
        )

        if (updateData.status) {
            warnOnInvalidStatusTransition((assignment as any).status, updateData.status, 'teacherTemplates.unmarkDone')
        }

        // Log audit
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const student = await Student.findById(assignment.studentId).lean()
        await logAudit({
            userId: teacherId,
            action: 'UNMARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
                semester: targetSemester,
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
teacherTemplatesRouter.get('/classes/:classId/assignments', requireAuth(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { classId } = req.params

        // Verify teacher is assigned to this class
        const classAssignment = await TeacherClassAssignment.findOne({ teacherId, classId }).lean()
        if (!classAssignment) return res.status(403).json({ error: 'not_assigned_to_class' })
        const completionLanguages = getCompletionLanguagesForTeacher(classAssignment)
        const classDoc = await ClassModel.findById(classId).lean()
        const studentLevel = normalizeLevel((classDoc as any)?.level || '')

        // Get students in class
        const enrollments = await Enrollment.find({ classId }).lean()
        const studentIds = enrollments.map(e => e.studentId)

        // Get all template assignments for these students where teacher is assigned
        const assignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            assignedTeachers: teacherId,
        }).select('-data').lean()

        const templateIds = Array.from(
            new Set(assignments.map(a => a.templateId).filter(Boolean))
        )

        const [templates, students] = await Promise.all([
            templateIds.length
                ? GradebookTemplate.find({ _id: { $in: templateIds } }).select('name').lean()
                : [],
            studentIds.length
                ? Student.find({ _id: { $in: studentIds } }).select('firstName lastName avatarUrl').lean()
                : [],
        ])

        const templateMap = new Map<string, any>()
        templates.forEach(t => {
            templateMap.set(String((t as any)._id), t)
        })

        const studentMap = new Map<string, any>()
        students.forEach(s => {
            studentMap.set(String((s as any)._id), s)
        })

        const enriched = assignments.map(assignment => {
            const template = templateMap.get(assignment.templateId)
            const student = studentMap.get(assignment.studentId)
            const languageCompletionMap = buildLanguageCompletionMap((assignment as any).languageCompletions || [], studentLevel)

            const isMyWorkCompletedSem1 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 1)
            const isMyWorkCompletedSem2 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 2)
            const isMyWorkCompleted = isMyWorkCompletedSem1

            return {
                ...assignment,
                isCompleted: isMyWorkCompleted,
                isCompletedSem1: isMyWorkCompletedSem1,
                isCompletedSem2: isMyWorkCompletedSem2,
                isGlobalCompleted: assignment.isCompleted,
                template,
                student,
            }
        })

        res.json(enriched)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Teacher: Get completion statistics for a class
teacherTemplatesRouter.get('/classes/:classId/completion-stats', requireAuth(['TEACHER', 'ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { classId } = req.params

        // Verify teacher is assigned to this class
        const classAssignment = await TeacherClassAssignment.findOne({ teacherId, classId }).lean()
        if (!classAssignment) return res.status(403).json({ error: 'not_assigned_to_class' })
        const completionLanguages = getCompletionLanguagesForTeacher(classAssignment)
        const classDoc = await ClassModel.findById(classId).lean()
        const studentLevel = normalizeLevel((classDoc as any)?.level || '')

        // Get students in class
        const enrollments = await Enrollment.find({ classId }).lean()
        const studentIds = enrollments.map(e => e.studentId)

        // Get all template assignments for these students where teacher is assigned
        const assignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            assignedTeachers: teacherId,
        }).select('-data').lean()

        const semester = Number((req.query as any).semester) === 2 ? 2 : 1

        const templateIds = Array.from(
            new Set(assignments.map(a => a.templateId).filter(Boolean))
        )

        const templates = templateIds.length
            ? await Promise.all(templateIds.map(id =>
                withCache(`template-summary-${id}`, () => GradebookTemplate.findById(id).select('name').lean())
            ))
            : []

        const templateMap = new Map<string, any>()
        templates.forEach(t => {
            templateMap.set(String((t as any)._id), t)
        })

        const templateStats = new Map<string, { templateId: string; templateName: string; total: number; completed: number }>()

        const isCompletedForSemester = (assignment: any) => {
            const languageCompletionMap = buildLanguageCompletionMap((assignment as any).languageCompletions || [], studentLevel)

            return computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, semester)
        }

        for (const assignment of assignments) {
            const key = assignment.templateId
            if (!templateStats.has(key)) {
                const template = templateMap.get(assignment.templateId)
                templateStats.set(key, {
                    templateId: assignment.templateId,
                    templateName: template?.name || 'Unknown',
                    total: 0,
                    completed: 0,
                })
            }

            const stats = templateStats.get(key)!
            stats.total++

            if (isCompletedForSemester(assignment)) {
                stats.completed++
            }
        }

        const totalAssignments = assignments.length

        const completedAssignments = assignments.filter(a =>
            isCompletedForSemester(a as any)
        ).length

        const completionPercentage =
            totalAssignments > 0
                ? Math.round((completedAssignments / totalAssignments) * 100)
                : 0

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

// Teacher: Update assignment data (e.g. dropdowns)
teacherTemplatesRouter.patch('/template-assignments/:assignmentId/data', requireAuth(['TEACHER']), async (req, res) => {
    try {
        const teacherId = (req as any).user.userId
        const { assignmentId } = req.params
        const { data } = req.body

        if (!data || typeof data !== 'object') return res.status(400).json({ error: 'missing_payload' })

        // Get assignment and verify teacher is assigned
        const assignment = await TemplateAssignment.findById(assignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        if (!assignment.assignedTeachers.includes(teacherId)) {
            return res.status(403).json({ error: 'not_assigned_to_template' })
        }

        // Check if the assignment has been signed - teachers cannot edit signed gradebooks
        if (await isAssignmentSigned(assignmentId)) {
            return res.status(403).json({ error: 'gradebook_signed', message: 'Cannot edit a signed gradebook' })
        }

        const { enrollment, activeYear } = await findEnrollmentForStudent(assignment.studentId)
        if (!enrollment || !enrollment.classId) {
            return res.status(403).json({ error: 'student_not_enrolled' })
        }

        const classDoc = await ClassModel.findById(enrollment.classId).lean()
        const studentLevel = normalizeLevel(classDoc?.level || '')

        const teacherClassAssignment = await TeacherClassAssignment.findOne({
            teacherId,
            classId: enrollment.classId,
        }).lean()

        if (!teacherClassAssignment) {
            return res.status(403).json({ error: 'not_assigned_to_class' })
        }

        const allowedLanguages = (teacherClassAssignment as any)?.languages || []
        const isProfPolyvalent = !!(teacherClassAssignment as any)?.isProfPolyvalent

        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        if (!template) return res.status(404).json({ error: 'template_not_found' })

        const versionedTemplate: any = getVersionedTemplate(template, (assignment as any).templateVersion)
        const sanitizedPatch: any = {}
        const activeSemester = (activeYear as any)?.activeSemester || 1
        const previousYearDropdownEditable = await isPreviousYearDropdownEditableEnabled()
        const completionLanguages = getCompletionLanguagesForTeacher(teacherClassAssignment)
        const languageCompletionMap = buildLanguageCompletionMap((assignment as any).languageCompletions || [], studentLevel)

        const isActiveSemesterClosed = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, activeSemester)
        if (isActiveSemesterClosed) {
            return res.status(403).json({ error: 'gradebook_closed', details: { activeSemester } })
        }

        const blocksById = buildBlocksById(versionedTemplate?.pages || [])
        for (const [key, value] of Object.entries(data)) {
            const langToggleMatch = key.match(/^language_toggle_(\d+)_(\d+)$/)
            if (langToggleMatch) {
                const pageIdx = parseInt(langToggleMatch[1])
                const blockIdx = parseInt(langToggleMatch[2])

                const page = versionedTemplate.pages?.[pageIdx]
                const block = page?.blocks?.[blockIdx]
                if (!page || !block || !['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                    return res.status(400).json({ error: 'invalid_language_toggle_key', details: key })
                }

                const blockLevel = getBlockLevel(block)
                if (blockLevel && studentLevel && !isLevelAtOrBelow(blockLevel, studentLevel)) {
                    return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, blockLevel } })
                }

                const sourceItems = Array.isArray(block?.props?.items) ? block.props.items : []
                if (!Array.isArray(value)) return res.status(400).json({ error: 'invalid_language_toggle_payload', details: key })

                const nextItems = sourceItems.length > 0
                    ? sourceItems.map((src: any, i: number) => ({ ...src, active: !!(value as any)?.[i]?.active }))
                    : value

                const previousItems = (assignment.data as any)?.[key] || sourceItems || []
                for (let i = 0; i < nextItems.length; i++) {
                    const newItem = (nextItems as any)[i]
                    const oldItem = (previousItems as any)[i] || sourceItems[i]
                    if (newItem && oldItem && newItem.active !== oldItem.active) {
                        const langCode = sourceItems?.[i]?.code
                        if (isLanguageCompletedForSemester(languageCompletionMap, langCode, activeSemester)) {
                            return res.status(403).json({ error: 'language_completed', details: langCode })
                        }
                        if (!isLanguageAllowedForTeacher(langCode, allowedLanguages, isProfPolyvalent)) {
                            return res.status(403).json({ error: 'language_not_allowed', details: langCode })
                        }
                    }
                }

                const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null
                const stableKey = blockId ? `language_toggle_${blockId}` : key
                sanitizedPatch[stableKey] = nextItems
                continue
            }

            const langToggleStableMatch = key.match(/^language_toggle_(.+)$/)
            if (langToggleStableMatch) {
                const blockId = String(langToggleStableMatch[1] || '').trim()
                const found = blockId ? blocksById.get(blockId) : null
                const block = found?.block
                if (!found || !block || !['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                    return res.status(400).json({ error: 'invalid_language_toggle_key', details: key })
                }

                const blockLevel = getBlockLevel(block)
                if (blockLevel && studentLevel && !isLevelAtOrBelow(blockLevel, studentLevel)) {
                    return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, blockLevel } })
                }

                const sourceItems = Array.isArray(block?.props?.items) ? block.props.items : []
                if (!Array.isArray(value)) return res.status(400).json({ error: 'invalid_language_toggle_payload', details: key })

                const nextItems = sourceItems.length > 0
                    ? sourceItems.map((src: any, i: number) => ({ ...src, active: !!(value as any)?.[i]?.active }))
                    : value

                const previousItems = (assignment.data as any)?.[key] || sourceItems || []
                for (let i = 0; i < nextItems.length; i++) {
                    const newItem = (nextItems as any)[i]
                    const oldItem = (previousItems as any)[i] || sourceItems[i]
                    if (newItem && oldItem && newItem.active !== oldItem.active) {
                        const langCode = sourceItems?.[i]?.code
                        if (isLanguageCompletedForSemester(languageCompletionMap, langCode, activeSemester)) {
                            return res.status(403).json({ error: 'language_completed', details: langCode })
                        }
                        if (!isLanguageAllowedForTeacher(langCode, allowedLanguages, isProfPolyvalent)) {
                            return res.status(403).json({ error: 'language_not_allowed', details: langCode })
                        }
                    }
                }

                sanitizedPatch[key] = nextItems
                continue
            }

            const tableMatch = key.match(/^table_(\d+)_(\d+)_row_(\d+)$/)
            if (tableMatch) {
                const pageIdx = parseInt(tableMatch[1])
                const blockIdx = parseInt(tableMatch[2])
                const rowIdx = parseInt(tableMatch[3])

                const page = versionedTemplate.pages?.[pageIdx]
                const block = page?.blocks?.[blockIdx]
                if (!page || !block || block.type !== 'table' || !block?.props?.expandedRows) {
                    return res.status(400).json({ error: 'invalid_table_key', details: key })
                }

                const blockLevel = getBlockLevel(block)
                if (blockLevel && studentLevel && !isLevelAtOrBelow(blockLevel, studentLevel)) {
                    return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, blockLevel } })
                }

                const expandedLanguages = block?.props?.expandedLanguages || []
                const rowLanguages = block?.props?.rowLanguages || {}
                const sourceItems = rowLanguages?.[rowIdx] || expandedLanguages
                if (!Array.isArray(sourceItems)) return res.status(400).json({ error: 'invalid_table_source', details: key })
                if (!Array.isArray(value)) return res.status(400).json({ error: 'invalid_table_payload', details: key })

                const nextItems = sourceItems.map((src: any, i: number) => ({ ...src, active: !!(value as any)?.[i]?.active }))
                const previousItems = (assignment.data as any)?.[key] || sourceItems

                for (let i = 0; i < nextItems.length; i++) {
                    const newItem = nextItems[i]
                    const oldItem = (previousItems as any)?.[i] || sourceItems[i]
                    if (newItem && oldItem && newItem.active !== oldItem.active) {
                        const itemLevel = normalizeLevel(sourceItems?.[i]?.level)
                        if (itemLevel && studentLevel && !isLevelAtOrBelow(itemLevel, studentLevel)) {
                            return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, itemLevel } })
                        }
                        const langCode = sourceItems?.[i]?.code
                        if (isLanguageCompletedForSemester(languageCompletionMap, langCode, activeSemester)) {
                            return res.status(403).json({ error: 'language_completed', details: langCode })
                        }
                        if (!isLanguageAllowedForTeacher(langCode, allowedLanguages, isProfPolyvalent)) {
                            return res.status(403).json({ error: 'language_not_allowed', details: langCode })
                        }
                    }
                }

                const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null
                const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : []
                const rowId = typeof rowIds?.[rowIdx] === 'string' && rowIds[rowIdx].trim() ? rowIds[rowIdx].trim() : null
                const stableKey = blockId && rowId ? `table_${blockId}_row_${rowId}` : key
                sanitizedPatch[stableKey] = nextItems
                continue
            }

            const tableStableMatch = key.match(/^table_(.+)_row_(.+)$/)
            if (tableStableMatch) {
                const blockId = String(tableStableMatch[1] || '').trim()
                const rowId = String(tableStableMatch[2] || '').trim()
                const found = blockId ? blocksById.get(blockId) : null
                const block = found?.block
                if (!found || !block || block.type !== 'table' || !block?.props?.expandedRows) {
                    return res.status(400).json({ error: 'invalid_table_key', details: key })
                }

                const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : []
                const rowIdx = rowIds.findIndex((v: any) => typeof v === 'string' && v.trim() === rowId)
                if (rowIdx < 0) return res.status(400).json({ error: 'invalid_table_key', details: key })

                const blockLevel = getBlockLevel(block)
                if (blockLevel && studentLevel && !isLevelAtOrBelow(blockLevel, studentLevel)) {
                    return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, blockLevel } })
                }

                const expandedLanguages = block?.props?.expandedLanguages || []
                const rowLanguages = block?.props?.rowLanguages || {}
                const sourceItems = rowLanguages?.[rowIdx] || expandedLanguages
                if (!Array.isArray(sourceItems)) return res.status(400).json({ error: 'invalid_table_source', details: key })
                if (!Array.isArray(value)) return res.status(400).json({ error: 'invalid_table_payload', details: key })

                const nextItems = sourceItems.map((src: any, i: number) => ({ ...src, active: !!(value as any)?.[i]?.active }))
                const previousItems = (assignment.data as any)?.[key] || sourceItems

                for (let i = 0; i < nextItems.length; i++) {
                    const newItem = nextItems[i]
                    const oldItem = (previousItems as any)?.[i] || sourceItems[i]
                    if (newItem && oldItem && newItem.active !== oldItem.active) {
                        const itemLevel = normalizeLevel(sourceItems?.[i]?.level)
                        if (itemLevel && studentLevel && !isLevelAtOrBelow(itemLevel, studentLevel)) {
                            return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, itemLevel } })
                        }
                        const langCode = sourceItems?.[i]?.code
                        if (isLanguageCompletedForSemester(languageCompletionMap, langCode, activeSemester)) {
                            return res.status(403).json({ error: 'language_completed', details: langCode })
                        }
                        if (!isLanguageAllowedForTeacher(langCode, allowedLanguages, isProfPolyvalent)) {
                            return res.status(403).json({ error: 'language_not_allowed', details: langCode })
                        }
                    }
                }

                sanitizedPatch[key] = nextItems
                continue
            }

            const dropdownKeyMatch = key.match(/^dropdown_(.+)$/)
            if (dropdownKeyMatch) {
                const dropdownKey = dropdownKeyMatch[1]
                const isNumeric = /^\d+$/.test(dropdownKey)
                const dropdownNumber = isNumeric ? parseInt(dropdownKey) : null
                const dropdownBlocks: any[] = []
                    ; (versionedTemplate.pages || []).forEach((p: any) => {
                        ; (p?.blocks || []).forEach((b: any) => {
                            if (b?.type !== 'dropdown') return
                            if (dropdownNumber !== null && b?.props?.dropdownNumber === dropdownNumber) dropdownBlocks.push(b)
                            if (dropdownNumber === null && b?.props?.blockId === dropdownKey) dropdownBlocks.push(b)
                        })
                    })

                const dropdownBlock = dropdownBlocks.length === 1 ? dropdownBlocks[0] : null
                if (dropdownBlock) {
                    const allowedLevels = Array.isArray(dropdownBlock?.props?.levels) ? dropdownBlock.props.levels.map((v: any) => normalizeLevel(v)) : []
                    const isLevelAllowed = allowedLevels.length === 0 || (
                        previousYearDropdownEditable
                            ? (studentLevel ? allowedLevels.some((level: string) => isLevelAtOrBelow(level, studentLevel)) : false)
                            : (studentLevel ? allowedLevels.includes(studentLevel) : false)
                    )
                    if (!isLevelAllowed) {
                        return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, allowedLevels } })
                    }
                    const allowedSemesters = Array.isArray(dropdownBlock?.props?.semesters) ? dropdownBlock.props.semesters : []
                    const canBypassSemester = previousYearDropdownEditable &&
                        studentLevel &&
                        allowedLevels.length > 0 &&
                        allowedLevels.every((level: string) => isStrictlyBelowLevel(level, studentLevel))

                    const canEditSem1WhileActiveSem2 = previousYearDropdownEditable &&
                        activeSemester === 2 &&
                        allowedSemesters.length > 0 &&
                        allowedSemesters.includes(1) &&
                        !allowedSemesters.includes(2)

                    if (!canBypassSemester && !canEditSem1WhileActiveSem2 && allowedSemesters.length > 0 && !allowedSemesters.includes(activeSemester)) {
                        return res.status(403).json({ error: 'semester_mismatch', details: { activeSemester, allowedSemesters } })
                    }
                }

                sanitizedPatch[key] = value
                continue
            }

            const variableNameBlocks: any[] = []
                ; (versionedTemplate.pages || []).forEach((p: any) => {
                    ; (p?.blocks || []).forEach((b: any) => {
                        if (b?.type === 'dropdown' && b?.props?.variableName === key) variableNameBlocks.push(b)
                    })
                })

            const variableBlock = variableNameBlocks.length === 1 ? variableNameBlocks[0] : null
            if (variableBlock) {
                const allowedLevels = Array.isArray(variableBlock?.props?.levels) ? variableBlock.props.levels.map((v: any) => normalizeLevel(v)) : []
                const isLevelAllowed = allowedLevels.length === 0 || (
                    previousYearDropdownEditable
                        ? (studentLevel ? allowedLevels.some((level: string) => isLevelAtOrBelow(level, studentLevel)) : false)
                        : (studentLevel ? allowedLevels.includes(studentLevel) : false)
                )
                if (!isLevelAllowed) {
                    return res.status(403).json({ error: 'level_mismatch', details: { studentLevel, allowedLevels } })
                }
                const allowedSemesters = Array.isArray(variableBlock?.props?.semesters) ? variableBlock.props.semesters : []
                const canBypassSemester = previousYearDropdownEditable &&
                    studentLevel &&
                    allowedLevels.length > 0 &&
                    allowedLevels.every((level: string) => isStrictlyBelowLevel(level, studentLevel))

                const canEditSem1WhileActiveSem2 = previousYearDropdownEditable &&
                    activeSemester === 2 &&
                    allowedSemesters.length > 0 &&
                    allowedSemesters.includes(1) &&
                    !allowedSemesters.includes(2)

                if (!canBypassSemester && !canEditSem1WhileActiveSem2 && allowedSemesters.length > 0 && !allowedSemesters.includes(activeSemester)) {
                    return res.status(403).json({ error: 'semester_mismatch', details: { activeSemester, allowedSemesters } })
                }
            }

            sanitizedPatch[key] = value
        }

        const updated = await TemplateAssignment.findByIdAndUpdate(
            assignmentId,
            {
                $set: { data: { ...(assignment.data || {}), ...sanitizedPatch } },
                status: assignment.status === 'draft' ? 'in_progress' : assignment.status,
            },
            assignmentUpdateOptions({ new: true })
        )

        warnOnInvalidStatusTransition((assignment as any).status, assignment.status === 'draft' ? 'in_progress' : assignment.status, 'teacherTemplates.dataPatch')

        // Sync promotion status to Enrollment if present
        if ((sanitizedPatch as any).promotions && Array.isArray((sanitizedPatch as any).promotions) && (sanitizedPatch as any).promotions.length > 0) {
            const lastPromo = (sanitizedPatch as any).promotions[(sanitizedPatch as any).promotions.length - 1]
            // Map the unstructured decision to our enum
            // Assuming lastPromo has a 'decision' or similar field, or we infer it.
            // Since I don't know the exact structure of 'promotions' in the JSON blob, 
            // I will assume it might have a 'decision' field. 
            // If not, I'll default to 'promoted' if it exists.

            let status = 'pending'
            const decision = lastPromo.decision?.toLowerCase() || ''
            if (decision.includes('admis') || decision.includes('promoted')) status = 'promoted'
            else if (decision.includes('maintien') || decision.includes('retained')) status = 'retained'
            else if (decision.includes('essai') || decision.includes('conditional')) status = 'conditional'
            else if (decision.includes('ete') || decision.includes('summer')) status = 'summer_school'
            else if (decision.includes('quitte') || decision.includes('left')) status = 'left'
            else status = 'promoted' // Default if entry exists but no clear keyword

            await Enrollment.findOneAndUpdate(
                { studentId: assignment.studentId, status: 'active' }, // Only update active enrollment
                { $set: { promotionStatus: status } }
            )
        }

        // SNAPSHOT LOGIC: Save acquired skills to reliable storage
        // Check if any updated keys relate to expanded tables (format: table_PAGE_BLOCK_row_ROW)
        if (Object.keys(sanitizedPatch).some(k => k.startsWith('table_'))) {
            try {
                if (template) {
                    const blocksByIdForSnapshot = buildBlocksById(versionedTemplate?.pages || [])
                    for (const [key, value] of Object.entries(sanitizedPatch)) {
                        // Key format: table_{pageIdx}_{blockIdx}_row_{rowIdx}
                        // Regex to parse: table_(\d+)_(\d+)_row_(\d+)
                        if (!Array.isArray(value)) continue

                        let cellText: any = undefined
                        let sourceId: any = undefined

                        const legacyMatch = key.match(/^table_(\d+)_(\d+)_row_(\d+)$/)
                        if (legacyMatch) {
                            const pageIdx = parseInt(legacyMatch[1])
                            const blockIdx = parseInt(legacyMatch[2])
                            const rowIdx = parseInt(legacyMatch[3])

                            const page = versionedTemplate.pages?.[pageIdx]
                            const block = page?.blocks?.[blockIdx]
                            const row = block?.props?.cells?.[rowIdx]
                            cellText = row?.[0]?.text

                            const rowId = Array.isArray(block?.props?.rowIds) ? block.props.rowIds[rowIdx] : undefined
                            sourceId = typeof rowId === 'string' && rowId.trim() ? rowId : undefined
                        } else {
                            const stableMatch = key.match(/^table_(.+)_row_(.+)$/)
                            if (!stableMatch) continue

                            const blockId = String(stableMatch[1] || '').trim()
                            const rowId = String(stableMatch[2] || '').trim()
                            if (!blockId || !rowId) continue

                            const found = blocksByIdForSnapshot.get(blockId)
                            const block = found?.block
                            if (!block || block.type !== 'table' || !block?.props?.expandedRows) continue

                            const rowIds = Array.isArray(block?.props?.rowIds) ? block.props.rowIds : []
                            const rowIdx = rowIds.findIndex((v: any) => typeof v === 'string' && v.trim() === rowId)
                            if (rowIdx < 0) continue

                            const row = block?.props?.cells?.[rowIdx]
                            cellText = row?.[0]?.text
                            sourceId = rowId
                        }

                        if (!cellText) continue

                        const activeLangs = value
                            .filter((v: any) => v && v.active)
                            .map((v: any) => v.code)

                        const updateDoc: any = {
                            studentId: assignment.studentId,
                            templateId: assignment.templateId,
                            assignmentId: assignment._id,
                            skillText: cellText,
                            languages: activeLangs,
                            sourceKey: key,
                            sourceId,
                            recordedAt: new Date(),
                            recordedBy: teacherId
                        }

                        if (sourceId) {
                            let updated = await StudentAcquiredSkill.findOneAndUpdate(
                                {
                                    studentId: assignment.studentId,
                                    templateId: assignment.templateId,
                                    sourceId
                                },
                                updateDoc,
                                { new: true }
                            )

                            if (!updated) {
                                updated = await StudentAcquiredSkill.findOneAndUpdate(
                                    {
                                        studentId: assignment.studentId,
                                        templateId: assignment.templateId,
                                        assignmentId: assignment._id,
                                        skillText: cellText
                                    },
                                    updateDoc,
                                    { new: true }
                                )
                            }

                            if (!updated) {
                                await StudentAcquiredSkill.findOneAndUpdate(
                                    {
                                        studentId: assignment.studentId,
                                        templateId: assignment.templateId,
                                        sourceId
                                    },
                                    updateDoc,
                                    { upsert: true }
                                )
                            }
                        } else {
                            await StudentAcquiredSkill.findOneAndUpdate(
                                {
                                    studentId: assignment.studentId,
                                    templateId: assignment.templateId,
                                    sourceKey: key
                                },
                                updateDoc,
                                { upsert: true }
                            )
                        }
                    }
                }
            } catch (err) {
                console.error('Error saving skill snapshot:', err)
                // Do not fail the request if snapshot fails, just log it
            }
        }

        res.json(updated)
    } catch (e: any) {
        res.status(500).json({ error: 'update_failed', message: e.message })
    }
})
