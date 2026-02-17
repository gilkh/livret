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
import { populateSignatures } from '../services/signatureService'
import { getRolloverUpdate, archiveYearCompletions } from '../services/rolloverService'
import { withTransaction } from '../utils/transactionUtils'
import { assignmentUpdateOptions, normalizeAssignmentMetadataPatch, warnOnInvalidStatusTransition } from '../utils/assignmentMetadata'

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

        const selectedStudentIds = Array.from(enrollmentByStudent.keys())

        const now = new Date()
        const assignedBy = (req as any).user.userId
        const force = !!req.body.force

        // Execute bulk assignment within a transaction
        const result = await withTransaction(async (session) => {
            const ops = Array.from(enrollmentByStudent.values()).map((enrollment: any) => {
                const teachers = (enrollment.classId && teacherMap.get(enrollment.classId)) || []

                const setOnInsert: any = {
                    templateId,
                    studentId: enrollment.studentId,
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
                    createdAt: now,
                    assignedBy,
                    assignedAt: now,
                }

                const setFields: any = {
                    templateVersion: template.currentVersion || 1,
                    assignedTeachers: teachers,
                }

                if (force) {
                    // When force:true we intentionally reset progress/status fields
                    const rolloverUpdate = getRolloverUpdate(String(targetYearId), assignedBy)
                    Object.assign(setFields, rolloverUpdate)

                    // Remove colliding fields from setOnInsert
                    Object.keys(rolloverUpdate).forEach(key => {
                        delete setOnInsert[key]
                    })
                }

                const updateObj: any = { $setOnInsert: setOnInsert, $set: setFields }

                return {
                    updateOne: {
                        filter: { templateId, studentId: enrollment.studentId },
                        update: updateObj,
                        upsert: true,
                    },
                }
            })

            const chunkSize = 1000
            let totalProcessed = 0

            for (let i = 0; i < ops.length; i += chunkSize) {
                const chunk = ops.slice(i, i + chunkSize)
                if (!chunk.length) continue
                try {
                    await TemplateAssignment.bulkWrite(chunk, { ordered: false, session })
                    totalProcessed += chunk.length
                } catch (e: any) {
                    const writeErrors = e?.writeErrors || []
                    const hasNonDup = writeErrors.some((we: any) => (we?.code !== 11000))
                    // With a unique (templateId, studentId) index, concurrent upserts can produce
                    // duplicate-key errors; treat those as benign.
                    if (writeErrors.length > 0 && !hasNonDup) {
                        totalProcessed += chunk.length - writeErrors.length
                    } else {
                        throw e
                    }
                }
            }

            // If the carnet already exists from a previous year, roll it over to this year
            // by archiving the current year's completions and resetting workflow fields.
            const existingFromOtherYear = await TemplateAssignment.find({
                templateId,
                studentId: { $in: selectedStudentIds },
                completionSchoolYearId: { $ne: String(targetYearId) }
            }).session(session).lean()

            for (const existing of existingFromOtherYear) {
                const fromYearId = String((existing as any).completionSchoolYearId || '')
                const archiveUpdates = archiveYearCompletions(existing, fromYearId)
                const rolloverUpdates = getRolloverUpdate(String(targetYearId), assignedBy)
                const normalizedSet = normalizeAssignmentMetadataPatch({ ...rolloverUpdates, ...archiveUpdates })

                await TemplateAssignment.updateOne(
                    { _id: existing._id },
                    {
                        $set: normalizedSet,
                        $inc: { dataVersion: 1 }
                    },
                    assignmentUpdateOptions({ session })
                )
            }

            return { count: ops.length, totalProcessed }
        })

        if (!result.success) {
            return res.status(500).json({
                error: 'bulk_assign_failed',
                message: result.error,
                transactionUsed: result.usedTransaction
            })
        }

        const { count } = result.data!
        res.json({
            count,
            message: `Assigned template to ${count} students`,
            transactionUsed: result.usedTransaction
        })
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
            studentId: { $in: studentIds }
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

        const existing = await TemplateAssignment.findOne({ templateId, studentId }).lean()

        const existingYearId = String((existing as any)?.completionSchoolYearId || '')
        const yearChanged = !!existing && existingYearId !== String(targetYearId)

        // Create or update assignment (respect existing progress unless force:true)
        const forceSingle = !!req.body.force
        const assignedAt = new Date()
        const setOnInsertSingle: any = {
            templateId,
            studentId,
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
            createdAt: assignedAt,
            assignedBy: (req as any).user.userId,
            assignedAt: assignedAt,
        }

        const setFieldsSingle: any = {
            templateVersion: template.currentVersion || 1,
            assignedTeachers: teachersToAssign,
        }

        const assignedBy = (req as any).user.userId

        if (yearChanged && !forceSingle) {
            // Archive current year's completions before rollover
            const archiveUpdates = archiveYearCompletions(existing, existingYearId)
            Object.assign(setFieldsSingle, getRolloverUpdate(String(targetYearId), assignedBy))
            Object.assign(setFieldsSingle, archiveUpdates)
        }

        if (forceSingle) {
            // Archive current year's completions before force reset
            if (existingYearId) {
                const archiveUpdates = archiveYearCompletions(existing, existingYearId)
                Object.assign(setFieldsSingle, archiveUpdates)
            }

            const rolloverUpdate = getRolloverUpdate(String(targetYearId), assignedBy)
            Object.assign(setFieldsSingle, rolloverUpdate)

            // Remove colliding fields from setOnInsert
            Object.keys(rolloverUpdate).forEach(key => {
                delete setOnInsertSingle[key]
            })
        }

        const assignment = await TemplateAssignment.findOneAndUpdate(
            { templateId, studentId },
            {
                $setOnInsert: normalizeAssignmentMetadataPatch(setOnInsertSingle),
                $set: normalizeAssignmentMetadataPatch(setFieldsSingle)
            },
            assignmentUpdateOptions({ upsert: true, new: true, setDefaultsOnInsert: true })
        )

        res.json(await populateSignatures(assignment))
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

        res.json(await populateSignatures(result))
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

        res.json(await populateSignatures(result))
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

        const activeYear = await SchoolYear.findOne({ active: true }).lean()
        const activeSemester = (activeYear as any)?.activeSemester || 1

        let newStatus = status
        let teacherCompletions = (assignment as any).teacherCompletions || []
        let isCompleted = (assignment as any).isCompleted
        let completedAt = (assignment as any).completedAt
        let completedBy = (assignment as any).completedBy
        let isCompletedSem1 = (assignment as any).isCompletedSem1
        let completedAtSem1 = (assignment as any).completedAtSem1
        let isCompletedSem2 = (assignment as any).isCompletedSem2
        let completedAtSem2 = (assignment as any).completedAtSem2

        const now = new Date()

        // Special handling for TEACHER role: only update their part
        if (user.role === 'TEACHER') {
            // Verify teacher is assigned
            if ((assignment as any).assignedTeachers && (assignment as any).assignedTeachers.includes(user.userId)) {
                const isMarkingDone = status === 'completed'

                // Update this teacher's completion status
                teacherCompletions = teacherCompletions.filter((tc: any) => tc.teacherId !== user.userId)

                // Find previous completion entry to preserve other semester data if needed
                const prevTc = ((assignment as any).teacherCompletions || []).find((tc: any) => tc.teacherId === user.userId)

                const newTc = {
                    teacherId: user.userId,
                    completed: isMarkingDone,
                    completedAt: isMarkingDone ? now : undefined,
                    completedSem1: prevTc?.completedSem1,
                    completedAtSem1: prevTc?.completedAtSem1,
                    completedSem2: prevTc?.completedSem2,
                    completedAtSem2: prevTc?.completedAtSem2
                }

                if (activeSemester === 1) {
                    newTc.completedSem1 = isMarkingDone
                    newTc.completedAtSem1 = isMarkingDone ? now : undefined
                } else {
                    newTc.completedSem2 = isMarkingDone
                    newTc.completedAtSem2 = isMarkingDone ? now : undefined
                }

                teacherCompletions.push(newTc)

                // Check if ALL assigned teachers are done
                const assignedTeachers = (assignment as any).assignedTeachers || []

                const allDone = assignedTeachers.every((tid: string) =>
                    teacherCompletions.some((tc: any) => tc.teacherId === tid && tc.completed)
                )

                const allDoneSem1 = assignedTeachers.every((tid: string) =>
                    teacherCompletions.some((tc: any) => tc.teacherId === tid && tc.completedSem1)
                )

                const allDoneSem2 = assignedTeachers.every((tid: string) =>
                    teacherCompletions.some((tc: any) => tc.teacherId === tid && tc.completedSem2)
                )

                isCompletedSem1 = allDoneSem1
                if (allDoneSem1 && !completedAtSem1) completedAtSem1 = now
                if (!allDoneSem1) completedAtSem1 = undefined

                isCompletedSem2 = allDoneSem2
                if (allDoneSem2 && !completedAtSem2) completedAtSem2 = now
                if (!allDoneSem2) completedAtSem2 = undefined

                if (allDone) {
                    newStatus = 'completed'
                    isCompleted = true
                    completedAt = now
                    completedBy = user.userId // Last one to complete
                } else {
                    newStatus = 'in_progress'
                    isCompleted = false
                    completedAt = undefined
                    completedBy = undefined
                }
            }
        } else {
            // Admin override
            if (status === 'completed') {
                isCompleted = true
                completedAt = now
                completedBy = user.userId
                if (activeSemester === 1) {
                    isCompletedSem1 = true
                    completedAtSem1 = now
                } else {
                    isCompletedSem2 = true
                    completedAtSem2 = now
                }
            } else if (status === 'in_progress' || status === 'draft') {
                isCompleted = false
                completedAt = null
                completedBy = null
            }
        }

        const updated = await TemplateAssignment.findByIdAndUpdate(
            id,
            normalizeAssignmentMetadataPatch({
                status: newStatus,
                teacherCompletions,
                isCompleted,
                completedAt,
                completedBy,
                isCompletedSem1,
                completedAtSem1,
                isCompletedSem2,
                completedAtSem2
            }),
            assignmentUpdateOptions({ new: true })
        )

        warnOnInvalidStatusTransition((assignment as any).status, newStatus, 'templateAssignments.patchStatus')

        res.json(await populateSignatures(updated))
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

        // Enforce "Current State Only" rule:
        // If a specific year is requested, we ONLY return assignments that are actively working on that year.
        // Historical data must be fetched from SavedGradebooks.
        if (schoolYearId) {
            query.completionSchoolYearId = schoolYearId
        }

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
        res.json(await populateSignatures(result))
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})
