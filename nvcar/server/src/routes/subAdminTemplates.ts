import { Router } from 'express'
import { signTemplateAssignment, unsignTemplateAssignment } from '../services/signatureService'
import { requireAuth } from '../auth'
import { SubAdminAssignment } from '../models/SubAdminAssignment'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateChangeLog } from '../models/TemplateChangeLog'
import { TemplateSignature } from '../models/TemplateSignature'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { Student } from '../models/Student'
import { User } from '../models/User'
import { OutlookUser } from '../models/OutlookUser'
import { Enrollment } from '../models/Enrollment'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { ClassModel } from '../models/Class'
import { RoleScope } from '../models/RoleScope'
import { SchoolYear } from '../models/SchoolYear'
import { Level } from '../models/Level'
import { Setting } from '../models/Setting'
import { SavedGradebook } from '../models/SavedGradebook'
import { StudentCompetencyStatus } from '../models/StudentCompetencyStatus'
import { logAudit } from '../utils/auditLogger'
import { checkAndAssignTemplates, mergeAssignmentDataIntoTemplate } from '../utils/templateUtils'
import { withCache, clearCache } from '../utils/cache'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../public/uploads/signatures')
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        cb(null, dir)
    },
    filename: (req, file, cb) => {
        const userId = (req as any).user.userId
        const ext = path.extname(file.originalname)
        cb(null, `signature-${userId}-${Date.now()}${ext}`)
    }
})

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
        const mimetype = allowedTypes.test(file.mimetype)
        if (extname && mimetype) {
            cb(null, true)
        } else {
            cb(new Error('Only image files are allowed'))
        }
    }
})

export const subAdminTemplatesRouter = Router()

// DEBUG: Get all signatures for a template assignment
subAdminTemplatesRouter.get('/templates/:templateAssignmentId/debug-signatures', requireAuth(['SUBADMIN', 'AEFE', 'ADMIN']), async (req, res) => {
    try {
        const { templateAssignmentId } = req.params
        const allSignatures = await TemplateSignature.find({ templateAssignmentId }).lean()
        const activeSchoolYear = await withCache('school-years-active', () =>
            SchoolYear.findOne({ active: true }).lean()
        )
        const previousYear = activeSchoolYear
            ? await withCache(`school-year-before-${activeSchoolYear.startDate}`, () =>
                SchoolYear.findOne({ endDate: { $lt: activeSchoolYear.startDate } }).sort({ endDate: -1 }).lean()
            )
            : null

        res.json({
            totalSignatures: allSignatures.length,
            signatures: allSignatures,
            activeSchoolYear: activeSchoolYear ? {
                id: activeSchoolYear._id,
                name: activeSchoolYear.name,
                startDate: activeSchoolYear.startDate,
                endDate: activeSchoolYear.endDate
            } : null,
            previousYear: previousYear ? {
                id: previousYear._id,
                name: previousYear.name,
                endDate: previousYear.endDate
            } : null,
            currentDate: new Date()
        })
    } catch (e: any) {
        res.status(500).json({ error: e.message })
    }
})

// Sub-admin: Get signature
subAdminTemplatesRouter.get('/signature', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        let user = await User.findById(subAdminId).lean() as any
        if (!user) {
            user = await OutlookUser.findById(subAdminId).lean()
        }

        if (!user || !user.signatureUrl) {
            return res.status(404).json({ error: 'no_signature' })
        }

        res.json({ signatureUrl: user.signatureUrl })
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Upload signature
subAdminTemplatesRouter.post('/signature/upload', requireAuth(['SUBADMIN', 'AEFE']), upload.single('file'), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId

        if (!req.file) {
            return res.status(400).json({ error: 'no_file' })
        }

        const signatureUrl = `/uploads/signatures/${req.file.filename}`

        // Delete old signature file if exists
        let user = await User.findById(subAdminId).lean() as any
        let isOutlook = false
        if (!user) {
            user = await OutlookUser.findById(subAdminId).lean()
            isOutlook = true
        }

        if (user?.signatureUrl) {
            const oldPath = path.join(__dirname, '../../public', user.signatureUrl)
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath)
            }
        }

        // Update user with new signature URL
        if (isOutlook) {
            await OutlookUser.findByIdAndUpdate(subAdminId, { signatureUrl })
        } else {
            await User.findByIdAndUpdate(subAdminId, { signatureUrl })
        }

        await logAudit({
            userId: subAdminId,
            action: 'UPLOAD_SIGNATURE',
            details: { signatureUrl },
            req,
        })

        res.json({ signatureUrl: `http://localhost:4000${signatureUrl}` })
    } catch (e: any) {
        res.status(500).json({ error: 'upload_failed', message: e.message })
    }
})

// Sub-admin: Delete signature
subAdminTemplatesRouter.delete('/signature', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        let user = await User.findById(subAdminId).lean() as any
        let isOutlook = false
        if (!user) {
            user = await OutlookUser.findById(subAdminId).lean()
            isOutlook = true
        }

        if (user?.signatureUrl) {
            const oldPath = path.join(__dirname, '../../public', user.signatureUrl)
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath)
            }
        }

        if (isOutlook) {
            await OutlookUser.findByIdAndUpdate(subAdminId, { $unset: { signatureUrl: 1 } })
        } else {
            await User.findByIdAndUpdate(subAdminId, { $unset: { signatureUrl: 1 } })
        }

        await logAudit({
            userId: subAdminId,
            action: 'DELETE_SIGNATURE',
            details: {},
            req,
        })

        res.json({ success: true })
    } catch (e: any) {
        res.status(500).json({ error: 'delete_failed', message: e.message })
    }
})

// Sub-admin: Get promoted students not yet assigned to a class
subAdminTemplatesRouter.get('/promoted-students', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId

        // Get active school year
        const activeSchoolYear = await withCache('school-years-active', () =>
            SchoolYear.findOne({ active: true }).lean()
        )
        if (!activeSchoolYear) return res.json([])
        const activeSchoolYearId = String(activeSchoolYear._id)

        // Find students promoted by this sub-admin
        const students = await Student.find({
            promotions: { $elemMatch: { promotedBy: subAdminId, schoolYearId: activeSchoolYearId } }
        }).lean()

        const studentIds = students.map(s => String(s._id))
        if (studentIds.length === 0) return res.json([])

        const assignedEnrollments = await Enrollment.find({
            studentId: { $in: studentIds },
            status: 'active',
            classId: { $exists: true, $ne: null },
        }).select({ studentId: 1 }).lean()
        const assignedSet = new Set(assignedEnrollments.map(e => String(e.studentId)))

        const latestAssignments = await TemplateAssignment.aggregate([
            { $match: { studentId: { $in: studentIds } } },
            { $sort: { assignedAt: -1 } },
            { $group: { _id: '$studentId', assignmentId: { $first: '$_id' } } },
        ])
        const assignmentByStudent = new Map<string, string>(
            latestAssignments.map((a: any) => [String(a._id), a.assignmentId ? String(a.assignmentId) : ''])
        )

        const promotedStudents = []
        for (const student of students) {
            const sid = String(student._id)
            if (assignedSet.has(sid)) continue

            const promotions = student.promotions || []
            let lastPromotion: any = null
            for (const p of promotions) {
                if (p?.promotedBy !== subAdminId) continue
                if (String(p?.schoolYearId) !== activeSchoolYearId) continue
                if (!lastPromotion) {
                    lastPromotion = p
                    continue
                }
                const pDate = p?.date ? new Date(p.date).getTime() : 0
                const lastDate = lastPromotion?.date ? new Date(lastPromotion.date).getTime() : 0
                if (pDate > lastDate) lastPromotion = p
            }

            if (!lastPromotion) continue

            const assignmentId = assignmentByStudent.get(sid) || null
            promotedStudents.push({
                _id: student._id,
                firstName: student.firstName,
                lastName: student.lastName,
                avatarUrl: student.avatarUrl,
                fromLevel: lastPromotion.fromLevel,
                toLevel: lastPromotion.toLevel,
                date: lastPromotion.date,
                assignmentId,
            })
        }

        res.json(promotedStudents)
    } catch (e: any) {
        console.error('Error in /subadmin/promoted-students:', e)
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Get classes with pending signatures
subAdminTemplatesRouter.get('/classes', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId

        // Get active school year
        const activeSchoolYear = await withCache('school-years-active', () =>
            SchoolYear.findOne({ active: true }).lean()
        )
        if (!activeSchoolYear) return res.json([])

        // Get teachers assigned to this sub-admin
        const assignments = await SubAdminAssignment.find({ subAdminId }).lean()
        const teacherIds = assignments.map(a => a.teacherId)

        // Get classes assigned to these teachers
        const teacherClassAssignments = await TeacherClassAssignment.find({
            teacherId: { $in: teacherIds },
            schoolYearId: activeSchoolYear._id
        }).lean()
        let relevantClassIds = [...new Set(teacherClassAssignments.map(a => a.classId))]

        // Check RoleScope for level assignments
        const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
        if (roleScope?.levels?.length) {
            const levelClasses = await ClassModel.find({
                level: { $in: roleScope.levels },
                schoolYearId: activeSchoolYear._id
            }).lean()
            const levelClassIds = levelClasses.map(c => String(c._id))
            relevantClassIds = [...new Set([...relevantClassIds, ...levelClassIds])]
        }

        // Get students in these classes
        const enrollments = await Enrollment.find({ classId: { $in: relevantClassIds } }).lean()
        const studentIds = enrollments.map(e => e.studentId)

        // Get template assignments for these students
        const templateAssignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            status: { $in: ['draft', 'in_progress', 'completed'] },
        }).lean()

        // Pre-compute maps for fast aggregation
        const classIds = [...new Set(enrollments.map(e => e.classId))]
        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
        const studentToClass = new Map(enrollments.map(e => [String(e.studentId), String(e.classId)]))
        const allAssignmentIds = templateAssignments.map(a => String(a._id))
        const signatures = await TemplateSignature.find({ templateAssignmentId: { $in: allAssignmentIds } }).lean()
        const signedSet = new Set(signatures.map(s => String(s.templateAssignmentId)))

        // Aggregate counts per class in one pass
        const counts = new Map<string, { total: number; signed: number }>()
        for (const a of templateAssignments) {
            const clsId = studentToClass.get(String(a.studentId))
            if (!clsId) continue
            const entry = counts.get(clsId) || { total: 0, signed: 0 }
            entry.total++
            if (signedSet.has(String(a._id))) entry.signed++
            counts.set(clsId, entry)
        }

        const classesWithStats = classes.map((cls: any) => {
            const c = counts.get(String(cls._id)) || { total: 0, signed: 0 }
            return {
                ...cls,
                pendingSignatures: c.total - c.signed,
                totalAssignments: c.total,
                signedAssignments: c.signed,
            }
        })

        res.json(classesWithStats)
    } catch (e: any) {
        console.error('Error in /subadmin/classes:', e)
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Get assigned teachers
subAdminTemplatesRouter.get('/teachers', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const assignments = await SubAdminAssignment.find({ subAdminId }).lean()
        const teacherIds = assignments.map(a => a.teacherId)
        const teachers = await User.find({ _id: { $in: teacherIds } })
            .select('_id email displayName')
            .lean()

        res.json(teachers)
    } catch (e: any) {
        console.error('Error in /subadmin/teachers:', e)
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Get template changes by a teacher
subAdminTemplatesRouter.get('/teachers/:teacherId/changes', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { teacherId } = req.params

        // Verify this teacher is assigned to this sub-admin
        const assignment = await SubAdminAssignment.findOne({ subAdminId, teacherId }).lean()
        if (!assignment) return res.status(403).json({ error: 'not_assigned_to_teacher' })

        // Get all template assignments for this teacher
        const templateAssignments = await TemplateAssignment.find({ assignedTeachers: teacherId }).lean()
        const assignmentIds = templateAssignments.map(a => String(a._id))

        // Get all changes for these assignments
        const changes = await TemplateChangeLog.find({
            templateAssignmentId: { $in: assignmentIds },
            teacherId,
        }).sort({ timestamp: -1 }).lean()

        // Enrich with template and student data
        const enrichedChanges = await Promise.all(changes.map(async (change) => {
            const templateAssignment = templateAssignments.find(a => String(a._id) === change.templateAssignmentId)
            if (!templateAssignment) return change

            const template = await withCache(`template-${templateAssignment.templateId}`, () =>
                GradebookTemplate.findById(templateAssignment.templateId).lean()
            )
            const student = await Student.findById(templateAssignment.studentId).lean()

            return {
                ...change,
                templateName: template?.name,
                studentName: student ? `${student.firstName} ${student.lastName}` : undefined,
            }
        }))

        res.json(enrichedChanges)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Get pending signatures (templates awaiting signature)
subAdminTemplatesRouter.get('/pending-signatures', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId

        // Get active school year
        const activeSchoolYear = await withCache('school-years-active', () =>
            SchoolYear.findOne({ active: true }).lean()
        )
        if (!activeSchoolYear) {
            return res.json([])
        }

        // Get teachers assigned to this sub-admin
        const assignments = await SubAdminAssignment.find({ subAdminId }).lean()
        const teacherIds = assignments.map(a => a.teacherId)

        // Get classes assigned to these teachers
        const teacherClassAssignments = await TeacherClassAssignment.find({
            teacherId: { $in: teacherIds },
            schoolYearId: activeSchoolYear._id
        }).lean()
        let classIds = [...new Set(teacherClassAssignments.map(a => a.classId))]

        // Check RoleScope for level assignments
        const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
        if (roleScope?.levels?.length) {
            const levelClasses = await ClassModel.find({
                level: { $in: roleScope.levels },
                schoolYearId: activeSchoolYear?._id
            }).lean()
            const levelClassIds = levelClasses.map(c => String(c._id))
            classIds = [...new Set([...classIds, ...levelClassIds])]
        }

        // Get students in these classes
        const enrollments = await Enrollment.find({ classId: { $in: classIds } }).lean()
        const studentIds = enrollments.map(e => e.studentId)

        // Get class details for mapping
        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
        const classMap = new Map(classes.map(c => [String(c._id), c]))
        const studentClassMap = new Map(enrollments.map(e => [String(e.studentId), String(e.classId)]))

        // Get ALL template assignments for these students (including signed ones)
        const templateAssignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            status: { $in: ['draft', 'in_progress', 'completed', 'signed'] },
        }).lean()

        // Get signature information for all assignments
        const assignmentIds = templateAssignments.map(a => String(a._id))
        const signatures = await TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } })
            .sort({ signedAt: -1 })
            .lean()

        const signatureMap = new Map<string, any[]>()
        signatures.forEach(s => {
            const key = String(s.templateAssignmentId)
            if (!signatureMap.has(key)) signatureMap.set(key, [])
            signatureMap.get(key)?.push(s)
        })

        const templateIds = [...new Set(templateAssignments.map(a => a.templateId))]
        const validTemplateIds = templateIds.filter(id => /^[a-fA-F0-9]{24}$/.test(String(id)))
        const validStudentIds = studentIds.filter(id => /^[a-fA-F0-9]{24}$/.test(String(id)))
        const [templates, students] = await Promise.all([
            validTemplateIds.length ? GradebookTemplate.find({ _id: { $in: validTemplateIds } }).lean() : Promise.resolve([]),
            validStudentIds.length ? Student.find({ _id: { $in: validStudentIds } }).lean() : Promise.resolve([])
        ])
        const templateMap = new Map(templates.map(t => [String(t._id), t]))
        const studentMap = new Map(students.map(s => [String(s._id), s]))

        const promotionDateMap = new Map<string, Date>()
        students.forEach(s => {
            if (Array.isArray(s.promotions)) {
                const relevantPromotions = s.promotions.filter(p => {
                    const promotionYearId = String(p.schoolYearId);
                    const activeYearId = String(activeSchoolYear?._id);
                    return promotionYearId === activeYearId;
                })
                if (relevantPromotions.length > 0) {
                    const latest = relevantPromotions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                    if (latest && latest.date) {
                        promotionDateMap.set(String(s._id), new Date(latest.date))
                    }
                }
            }
        })

        const enrichedAssignments = templateAssignments.map((assignment) => {
            const template = templateMap.get(String(assignment.templateId))
            const student = studentMap.get(String(assignment.studentId))
            const classId = studentClassMap.get(String(assignment.studentId))
            const classInfo = classId ? classMap.get(classId) : null
            const level = classInfo?.level

            const assignmentSignatures = signatureMap.get(String(assignment._id)) || []

            // Helper to find relevant signature
            const findSig = (type: string) => {
                return assignmentSignatures.find(s => {
                    // Type check
                    if (type === 'standard') {
                        if (s.type && s.type !== 'standard') return false
                    } else {
                        if (s.type !== type) return false
                    }

                    // Level check
                    if (s.level && level && s.level !== level) return false

                    return true
                })
            }

            const standardSig = findSig('standard')
            const finalSig = findSig('end_of_year')

            const isPromoted = promotionDateMap.has(String(assignment.studentId))
            return {
                _id: assignment._id,
                studentId: assignment.studentId,
                status: assignment.status,
                isCompleted: assignment.isCompleted,
                completedAt: assignment.completedAt,
                template: template ? { name: template.name } : undefined,
                student: student ? { firstName: student.firstName, lastName: student.lastName, avatarUrl: student.avatarUrl } : undefined,
                signatures: {
                    standard: standardSig ? { signedAt: standardSig.signedAt, subAdminId: standardSig.subAdminId } : null,
                    final: finalSig ? { signedAt: finalSig.signedAt, subAdminId: finalSig.subAdminId } : null
                },
                className: classInfo?.name,
                level: classInfo?.level,
                isPromoted
            }
        })

        const finalAssignments = enrichedAssignments

        res.json(finalAssignments)
    } catch (e: any) {
        console.error('Error in /subadmin/pending-signatures:', e)
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Promote student
subAdminTemplatesRouter.post('/templates/:templateAssignmentId/promote', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { templateAssignmentId } = req.params
        const { nextLevel } = req.body

        // Check if signed by this sub-admin (End of Year signature required for promotion)
        const signature = await TemplateSignature.findOne({
            templateAssignmentId,
            subAdminId,
            type: 'end_of_year'
        }).lean()

        if (!signature) {
            return res.status(403).json({ error: 'not_signed_by_you', message: 'You must sign the carnet (End of Year) before promoting the student' })
        }

        // Get the template assignment
        const assignment = await TemplateAssignment.findById(templateAssignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        // Verify authorization via class enrollment
        const enrollmentCheck = await Enrollment.findOne({ studentId: assignment.studentId }).lean()
        if (!enrollmentCheck) return res.status(403).json({ error: 'student_not_enrolled' })

        const teacherClassAssignments = await TeacherClassAssignment.find({ classId: enrollmentCheck.classId }).lean()
        const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId)

        const subAdminAssignments = await SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: classTeacherIds },
        }).lean()

        let authorized = subAdminAssignments.length > 0

        if (!authorized) {
            // Check RoleScope
            const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
            if (roleScope?.levels?.length) {
                const cls = await ClassModel.findById(enrollmentCheck.classId).lean()
                if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                    authorized = true
                }
            }
        }

        // Additional authorization: if this sub-admin promoted the student in the active year, allow signing
        if (!authorized) {
            const student = await Student.findById(assignment.studentId).lean()
            const activeSchoolYearForAuth = await SchoolYear.findOne({ active: true }).lean()
            if (student && activeSchoolYearForAuth && Array.isArray((student as any).promotions)) {
                const promotedThisYear = (student as any).promotions.some((p: any) =>
                    String(p.schoolYearId) === String(activeSchoolYearForAuth._id) && String(p.promotedBy) === String(subAdminId)
                )
                if (promotedThisYear) {
                    authorized = true
                }
            }
        }

        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()

        const student = await Student.findById(assignment.studentId)
        if (!student) return res.status(404).json({ error: 'student_not_found' })

        // Get current enrollment to find school year
        // Handle missing status field by treating it as active
        const enrollment = await Enrollment.findOne({
            studentId: assignment.studentId,
            ...(activeSchoolYear ? { schoolYearId: String(activeSchoolYear._id) } : {}),
            $or: [{ status: 'active' }, { status: 'promoted' }, { status: { $exists: false } }]
        }).lean()
        let yearName = activeSchoolYear?.name || new Date().getFullYear().toString()
        let currentLevel = student.level || ''
        let currentSchoolYearId = activeSchoolYear ? String(activeSchoolYear._id) : ''
        let currentSchoolYearSequence = activeSchoolYear?.sequence || 0

        if (enrollment) {
            if (enrollment.classId) {
                const cls = await ClassModel.findById(enrollment.classId).lean()
                if (cls) {
                    currentLevel = cls.level || ''
                    if (!currentSchoolYearId) currentSchoolYearId = cls.schoolYearId
                }
            }

            // Fallback to enrollment's schoolYearId if class lookup failed or no class
            if (!currentSchoolYearId && enrollment.schoolYearId) {
                currentSchoolYearId = enrollment.schoolYearId
            }

            if (currentSchoolYearId) {
                const sy = await SchoolYear.findById(currentSchoolYearId).lean()
                if (sy) {
                    yearName = sy.name || yearName
                    if (!currentSchoolYearSequence) currentSchoolYearSequence = sy.sequence || 0
                }
            }
        }

        // Check if already promoted in current school year
        if (currentSchoolYearId) {
            const alreadyPromoted = student.promotions?.some(p => p.schoolYearId === currentSchoolYearId)
            if (alreadyPromoted) {
                return res.status(400).json({ error: 'already_promoted', message: 'Student already promoted this year' })
            }
        }

        // Calculate Next Level dynamically
        const currentLevelDoc = await withCache(`level-name-${currentLevel}`, () =>
            Level.findOne({ name: currentLevel }).lean()
        )
        let calculatedNextLevel = ''
        if (currentLevelDoc) {
            const nextLevelDoc = await withCache(`level-order-${currentLevelDoc.order + 1}`, () =>
                Level.findOne({ order: currentLevelDoc.order + 1 }).lean()
            )
            if (nextLevelDoc) {
                calculatedNextLevel = nextLevelDoc.name
            }
        }

        // Fallback if levels not populated or not found
        if (!calculatedNextLevel) calculatedNextLevel = nextLevel

        if (!calculatedNextLevel) return res.status(400).json({ error: 'cannot_determine_next_level' })

        // Find next school year by sequence
        let nextSy: any = null
        if (currentSchoolYearSequence > 0) {
            nextSy = await SchoolYear.findOne({ sequence: currentSchoolYearSequence + 1 }).lean()
        }

        let currentSy: any = null
        if (!nextSy && currentSchoolYearId) {
            currentSy = await SchoolYear.findById(currentSchoolYearId).lean()
            if (currentSy && currentSy.name) {
                const match = currentSy.name.match(/(\d{4})([-/.])(\d{4})/)
                if (match) {
                    const startYear = parseInt(match[1])
                    const separator = match[2]
                    const endYear = parseInt(match[3])
                    const nextName = `${startYear + 1}${separator}${endYear + 1}`
                    nextSy = await SchoolYear.findOne({ name: nextName }).lean()
                }
            }
        }

        if (!nextSy && currentSchoolYearId) {
            if (!currentSy) currentSy = await SchoolYear.findById(currentSchoolYearId).lean()
            if (currentSy?.endDate) {
                nextSy = await SchoolYear.findOne({ startDate: { $gte: currentSy.endDate } }).sort({ startDate: 1 }).lean()
            }
            if (!nextSy && currentSy?.startDate) {
                nextSy = await SchoolYear.findOne({ startDate: { $gt: currentSy.startDate } }).sort({ startDate: 1 }).lean()
            }
        }

        if (!nextSy?._id) {
            return res.status(400).json({ error: 'no_next_year', message: 'Next school year not found' })
        }
        const nextSchoolYearId = String(nextSy._id)

        // Create Gradebook Snapshot
        if (currentSchoolYearId && enrollment) {
            const statuses = await StudentCompetencyStatus.find({ studentId: student._id }).lean()

            // Get Class Name for Snapshot
            let snapshotClassName = ''
            if (enrollment.classId) {
                const cls = await ClassModel.findById(enrollment.classId).lean()
                if (cls) snapshotClassName = cls.name
            }

            const snapshotData = {
                student: student.toObject ? student.toObject() : student,
                enrollment: enrollment,
                statuses: statuses,
                assignment: assignment,
                className: snapshotClassName // Explicitly save class name
            }

            await SavedGradebook.create({
                studentId: student._id,
                schoolYearId: currentSchoolYearId,
                level: currentLevel || 'Sans niveau',
                classId: enrollment.classId,
                templateId: assignment.templateId,
                data: snapshotData
            })
        }

        // Update Enrollment Status (Destructive Fix)
        if (enrollment) {
            if (enrollment.status !== 'promoted') {
                await Enrollment.findByIdAndUpdate(enrollment._id, { status: 'promoted' })
            }
        }

        // Create new Enrollment for next year
        const existingNextEnrollment = await Enrollment.findOne({ studentId: String(student._id), schoolYearId: nextSchoolYearId }).lean()
        if (!existingNextEnrollment) {
            await Enrollment.create({
                studentId: student._id,
                schoolYearId: nextSchoolYearId,
                status: 'active',
            })
        }

        // NEW: Create a new template assignment for the next year, copying data from the previous one
        // This ensures the gradebook "follows" the student
        if (assignment) {
            // Strategy:
            // We rely on checkAndAssignTemplates which is usually called when assigning a class.
            // But if we want to ensure data persistence, we can leave it to the teacher assignment logic
            // which we updated in templateUtils.ts to copy data from the most recent assignment.
        }

        // Update student staging (Decoupling Fix)
        student.nextLevel = calculatedNextLevel
        // Do NOT update student.level or student.schoolYearId yet

        // Add promotion record
        if (!student.promotions) student.promotions = [] as any
        student.promotions.push({
            schoolYearId: currentSchoolYearId,
            date: new Date(),
            fromLevel: currentLevel,
            toLevel: calculatedNextLevel,
            promotedBy: subAdminId
        })

        await student.save()

        // Record promotion in assignment data
        let className = ''
        const enrollmentForClass = await Enrollment.findOne({ studentId: student._id, schoolYearId: currentSchoolYearId })
        if (enrollmentForClass && enrollmentForClass.classId) {
            const cls = await ClassModel.findById(enrollmentForClass.classId)
            if (cls) className = cls.name
        }

        const promotionData = {
            from: currentLevel,
            to: calculatedNextLevel,
            date: new Date(),
            year: yearName,
            class: className,
            by: subAdminId
        }

        // Use findById and save to handle Mixed type safely
        const assignmentDoc = await TemplateAssignment.findById(templateAssignmentId)
        if (assignmentDoc) {
            const data = assignmentDoc.data || {}
            const promotions = Array.isArray(data.promotions) ? data.promotions : []
            promotions.push(promotionData)
            data.promotions = promotions
            assignmentDoc.data = data
            assignmentDoc.markModified('data')
            await assignmentDoc.save()
        }

        await logAudit({
            userId: subAdminId,
            action: 'PROMOTE_STUDENT',
            details: {
                studentId: student._id,
                from: currentLevel,
                to: calculatedNextLevel,
                templateAssignmentId
            },
            req,
        })

        // Return updated data to avoid client reload issues
        const updatedAssignment = await TemplateAssignment.findById(templateAssignmentId).lean()
        const updatedStudent = await Student.findById(student._id).lean()

        // Re-fetch template to ensure consistency (though it shouldn't change)
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const versionedTemplate = mergeAssignmentDataIntoTemplate(template, updatedAssignment)
        res.json({
            ok: true,
            assignment: updatedAssignment,
            student: updatedStudent,
            template: versionedTemplate
        })
    } catch (e: any) {
        console.error('Promotion error:', e)
        res.status(500).json({ error: 'promotion_failed', message: e.message })
    }
})

// Sub-admin: Sign a template
subAdminTemplatesRouter.post('/templates/:templateAssignmentId/sign', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { templateAssignmentId } = req.params

        // Get the template assignment
        const assignment = await TemplateAssignment.findById(templateAssignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        const { type = 'standard' } = req.body
        const bypassScopes = (req as any).user.bypassScopes || []

        // Check granular bypass permissions
        let canBypass = false
        if (bypassScopes.some((s: any) => s.type === 'ALL')) {
            canBypass = true
        } else {
            // Check specific scopes
            const enrollments = await Enrollment.find({ studentId: assignment.studentId }).lean()
            const classIds = enrollments.map(e => String(e.classId))

            // Check STUDENT scope
            if (bypassScopes.some((s: any) => s.type === 'STUDENT' && s.value === assignment.studentId)) {
                canBypass = true
            }

            // Check CLASS scope
            if (!canBypass && bypassScopes.some((s: any) => s.type === 'CLASS' && classIds.includes(s.value))) {
                canBypass = true
            }

            // Check LEVEL scope
            if (!canBypass) {
                const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
                const levels = classes.map(c => c.level).filter(Boolean)
                if (bypassScopes.some((s: any) => s.type === 'LEVEL' && levels.includes(s.value))) {
                    canBypass = true
                }
            }
        }

        // Apply Settings-based Restrictions
        const settings = await Setting.find({
            key: {
                $in: [
                    'subadmin_restriction_enabled',
                    'subadmin_restriction_exempt_standard',
                    'subadmin_restriction_exempt_final'
                ]
            }
        }).lean()
        const settingsMap: Record<string, any> = {}
        settings.forEach(s => settingsMap[s.key] = s.value)

        const restrictionsEnabled = settingsMap.subadmin_restriction_enabled !== false // Default true
        const exemptStandard = settingsMap.subadmin_restriction_exempt_standard === true
        const exemptFinal = settingsMap.subadmin_restriction_exempt_final === true

        if (!restrictionsEnabled) {
            canBypass = true
        } else {
            if (type === 'standard' && exemptStandard) canBypass = true
            if (type === 'end_of_year' && exemptFinal) canBypass = true
        }

        if (!canBypass) {
            if (assignment.status !== 'completed' && assignment.status !== 'signed') {
                const enrollments = await Enrollment.find({ studentId: assignment.studentId }).lean()
                // Prioritize enrollments with classId, preferring 'promoted' or 'active' status
                const enrollmentsWithClass = enrollments.filter(e => e.classId)
                // Sort to prefer promoted (most recent class assignment) then active
                enrollmentsWithClass.sort((a, b) => {
                    const statusOrder: Record<string, number> = { 'promoted': 0, 'active': 1 }
                    return (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2)
                })
                const classIds = enrollmentsWithClass.map(e => String(e.classId)).filter(Boolean)
                let clsId = classIds[0]
                let cls: any = null
                if (clsId) cls = await ClassModel.findById(clsId).lean()

                const template = await GradebookTemplate.findById(assignment.templateId).lean()
                const teacherCompletions = (assignment as any).teacherCompletions || []
                const assignmentData = (assignment as any).data || {}
                const teacherAssignments = clsId ? await TeacherClassAssignment.find({ classId: clsId }).lean() : []

                const level = cls?.level || ''
                const categoriesRequired = new Set<string>()

                if (template && Array.isArray((template as any).pages)) {
                    for (let p = 0; p < (template as any).pages.length; p++) {
                        const page: any = (template as any).pages[p]
                        for (let b = 0; b < (page.blocks || []).length; b++) {
                            const block: any = page.blocks[b]
                            if (block.type === 'language_toggle') {
                                const key = `language_toggle_${p}_${b}`
                                const overrideItems = (assignmentData as any)[key]
                                const items = overrideItems || block.props?.items || []
                                for (const item of items) {
                                    let isAssigned = true
                                    if (item?.levels && Array.isArray(item.levels) && item.levels.length > 0) {
                                        if (!level || !item.levels.includes(level)) isAssigned = false
                                    }
                                    if (!isAssigned) continue
                                    const raw = String(item.type || item.label || '')
                                    const code = String(item.code || '').toLowerCase()
                                    const l = raw.toLowerCase()
                                    if (code === 'ar' || l.includes('arabe') || l.includes('arabic') || l.includes('العربية')) categoriesRequired.add('ar')
                                    else if (code === 'en' || l.includes('anglais') || l.includes('english')) categoriesRequired.add('en')
                                    else categoriesRequired.add('poly')
                                }
                            }
                        }
                    }
                }

                const isCatCompleted = (cat: string) => {
                    let responsible = (teacherAssignments || [])
                        .filter((ta: any) => String(ta.classId) === String(clsId))
                        .filter((ta: any) => {
                            const langs = ((ta as any).languages || []).map((x: string) => x.toLowerCase())
                            if (cat === 'ar') {
                                if (langs.length === 0) return !(ta as any).isProfPolyvalent
                                return langs.some((v: string) => v === 'ar' || v.includes('arabe') || v.includes('arabic') || v.includes('العربية'))
                            }
                            if (cat === 'en') {
                                if (langs.length === 0) return !(ta as any).isProfPolyvalent
                                return langs.some((v: string) => v === 'en' || v.includes('anglais') || v.includes('english'))
                            }
                            return (ta as any).isProfPolyvalent
                        })
                        .map((ta: any) => String(ta.teacherId))
                    if (responsible.length === 0) responsible = ((assignment as any).assignedTeachers || []).map((id: any) => String(id))
                    return responsible.some((tid: string) => (teacherCompletions || []).some((tc: any) => String(tc.teacherId) === String(tid) && tc.completed))
                }

                let eligible = true
                for (const cat of categoriesRequired) {
                    if (!isCatCompleted(cat)) { eligible = false; break }
                }

                if (!eligible) {
                    return res.status(400).json({ error: 'not_completed', message: 'Teacher must mark assignment as done before signing' })
                }
            }
        }

        // Verify authorization via class enrollment
        const enrollments = await Enrollment.find({ studentId: assignment.studentId }).lean()

        let authorized = false

        // Check if sub-admin is linked to assigned teachers (direct assignment check)
        if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
            const subAdminAssignments = await SubAdminAssignment.find({
                subAdminId,
                teacherId: { $in: assignment.assignedTeachers },
            }).lean()

            if (subAdminAssignments.length > 0) {
                authorized = true
            }
        }

        if (!authorized && enrollments.length > 0) {
            const classIds = enrollments.map(e => e.classId).filter(Boolean)
            const teacherClassAssignments = await TeacherClassAssignment.find({ classId: { $in: classIds } }).lean()
            const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId)

            const subAdminAssignments = await SubAdminAssignment.find({
                subAdminId,
                teacherId: { $in: classTeacherIds },
            }).lean()

            if (subAdminAssignments.length > 0) {
                authorized = true
            }

            if (!authorized) {
                const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
                if (roleScope?.levels?.length) {
                    const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
                    if (classes.some(c => c.level && roleScope.levels.includes(c.level))) {
                        authorized = true
                    }
                }
            }
        }

        if (!authorized) {
            const student = await Student.findById(assignment.studentId).lean()
            if (student && Array.isArray((student as any).promotions) && (student as any).promotions.length > 0) {
                const lastPromotion = (student as any).promotions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                if (lastPromotion && String(lastPromotion.promotedBy) === String(subAdminId)) {
                    authorized = true
                }
            }
        }

        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()

        // Check for Semester 2 requirement for end_of_year signature
        if (type === 'end_of_year' && !canBypass) {
            if (!activeSchoolYear || activeSchoolYear.activeSemester !== 2) {
                return res.status(400).json({ error: 'semester_2_required', message: 'Semester 2 must be active to sign end of year' })
            }
        }

        // Get student level for signature scoping
        let signatureLevel = ''
        const studentForSig = await Student.findById(assignment.studentId).lean()
        if (studentForSig) {
            signatureLevel = studentForSig.level || ''
            // Try to refine with class level
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

        try {
            const signature = await signTemplateAssignment({
                templateAssignmentId,
                signerId: subAdminId,
                type: type as any,
                req,
                level: signatureLevel || undefined
            })

        } catch (e: any) {
            if (e.message === 'already_signed') return res.status(400).json({ error: 'already_signed' })
            if (e.message === 'not_found') return res.status(404).json({ error: 'not_found' })
            throw e
        }

        res.json({ ok: true })
    } catch (e: any) {
        res.status(500).json({ error: 'sign_failed', message: e.message })
    }
})

// Sub-admin: Unsign a template
subAdminTemplatesRouter.delete('/templates/:templateAssignmentId/sign', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { templateAssignmentId } = req.params

        // Get the template assignment
        const assignment = await TemplateAssignment.findById(templateAssignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        // Verify authorization via class enrollment
        const enrollments = await Enrollment.find({ studentId: assignment.studentId }).lean()

        let authorized = false

        // Check if sub-admin is linked to assigned teachers (direct assignment check)
        if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
            const subAdminAssignments = await SubAdminAssignment.find({
                subAdminId,
                teacherId: { $in: assignment.assignedTeachers },
            }).lean()

            if (subAdminAssignments.length > 0) {
                authorized = true
            }
        }

        if (!authorized && enrollments.length > 0) {
            const classIds = enrollments.map(e => e.classId).filter(Boolean)
            const teacherClassAssignments = await TeacherClassAssignment.find({ classId: { $in: classIds } }).lean()
            const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId)

            const subAdminAssignments = await SubAdminAssignment.find({
                subAdminId,
                teacherId: { $in: classTeacherIds },
            }).lean()

            if (subAdminAssignments.length > 0) {
                authorized = true
            }

            if (!authorized) {
                // Check RoleScope
                const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
                if (roleScope?.levels?.length) {
                    const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
                    if (classes.some(c => c.level && roleScope.levels.includes(c.level))) {
                        authorized = true
                    }
                }
            }
        }

        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        const type = req.body.type || req.query.type || 'standard'

        // Get student level for signature scoping
        let signatureLevel = ''
        const studentForSig = await Student.findById(assignment.studentId).lean()
        if (studentForSig) {
            signatureLevel = studentForSig.level || ''
            // Try to refine with class level
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

        try {
            await unsignTemplateAssignment({
                templateAssignmentId,
                signerId: subAdminId,
                type,
                req,
                level: signatureLevel || undefined
            })

        } catch (e: any) {
            if (e.message === 'not_found') return res.status(404).json({ error: 'not_found' })
            throw e
        }
        res.json({ ok: true })
    } catch (e: any) {
        res.status(500).json({ error: 'unsign_failed', message: e.message })
    }
})

// Sub-admin: Get template assignment for review
subAdminTemplatesRouter.get('/templates/:templateAssignmentId/review', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { templateAssignmentId } = req.params

        // Get the template assignment
        const assignment = await TemplateAssignment.findById(templateAssignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        const student = await Student.findById(assignment.studentId).lean()

        // Verify authorization via class enrollment
        const enrollments = await Enrollment.find({ studentId: assignment.studentId }).lean()

        let authorized = false

        // Check if sub-admin is linked to assigned teachers (direct assignment check)
        if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
            const subAdminAssignments = await SubAdminAssignment.find({
                subAdminId,
                teacherId: { $in: assignment.assignedTeachers },
            }).lean()

            if (subAdminAssignments.length > 0) {
                authorized = true
            }
        }

        if (!authorized && enrollments.length > 0) {
            const classIds = enrollments.map(e => e.classId).filter(Boolean)
            const teacherClassAssignments = await TeacherClassAssignment.find({ classId: { $in: classIds } }).lean()
            const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId)

            const subAdminAssignments = await SubAdminAssignment.find({
                subAdminId,
                teacherId: { $in: classTeacherIds },
            }).lean()

            if (subAdminAssignments.length > 0) {
                authorized = true
            }

            if (!authorized) {
                // Check RoleScope
                const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
                if (roleScope?.levels?.length) {
                    const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
                    if (classes.some(c => c.level && roleScope.levels.includes(c.level))) {
                        authorized = true
                    }
                }
            }
        }

        // Also check if the student was promoted by this sub-admin
        if (!authorized && student && student.promotions) {
            const lastPromotion = student.promotions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
            if (lastPromotion && lastPromotion.promotedBy === subAdminId) {
                authorized = true
            }
        }

        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        // Get template and signature (no change history for sub-admin)
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        let signatures = await TemplateSignature.find({ templateAssignmentId })
            .sort({ signedAt: -1 })
            .lean()
        const allSignatures = [...signatures]

        // Get student level and class name (Moved up for signature filtering)
        let level = student?.level || ''
        let className = ''
        let classId: string | null = null
        if (student) {
            // Get active school year to ensure we get the CURRENT enrollment
            const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
            if (activeSchoolYear) {
                const enrollment = await Enrollment.findOne({
                    studentId: assignment.studentId,
                    schoolYearId: activeSchoolYear._id,
                    status: 'active'
                }).lean()

                if (enrollment && enrollment.classId) {
                    classId = String(enrollment.classId)
                    const classDoc = await ClassModel.findById(enrollment.classId).lean()
                    if (classDoc) {
                        level = classDoc.level || student.level || ''
                        className = classDoc.name || ''
                    }
                }
            }
        }

        // Calculate level start date from promotions to filter out signatures from previous levels
        let levelStartDate: Date | null = null
        if (student && Array.isArray(student.promotions) && level) {
            // Find the promotion that put the student in the current level
            // We sort by date desc to get the latest promotion to this level (though usually unique)
            const relevantPromo = student.promotions
                .filter((p: any) => p.toLevel === level)
                .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

            if (relevantPromo && relevantPromo.date) {
                levelStartDate = new Date(relevantPromo.date)
                console.log(`[/review] Found promotion to ${level} at ${levelStartDate}`)
            }
        }

        console.log('[/review] All signatures for assignment:', templateAssignmentId, signatures.map(s => ({
            id: s._id, type: s.type, signedAt: s.signedAt, subAdminId: s.subAdminId, level: s.level
        })))

        const allSchoolYears = await SchoolYear.find({}).lean()

        const computeYearNameFromRange = (name: string, offset: number) => {
            const match = String(name || '').match(/(\d{4})([-/.])(\d{4})/)
            if (!match) return ''
            const startYear = parseInt(match[1], 10)
            const sep = match[2]
            const endYear = parseInt(match[3], 10)
            if (Number.isNaN(startYear) || Number.isNaN(endYear)) return ''
            return `${startYear + offset}${sep}${endYear + offset}`
        }

        const resolveSchoolYearForDate = (date: Date | string | undefined | null) => {
            if (!date) return null
            const d = new Date(date)
            if (!Number.isFinite(d.getTime())) return null

            if (allSchoolYears && allSchoolYears.length > 0) {
                const match = allSchoolYears.find(y => {
                    if (!y.startDate || !y.endDate) return false
                    const start = new Date(y.startDate).getTime()
                    const end = new Date(y.endDate).getTime()
                    const t = d.getTime()
                    return t >= start && t <= end
                })
                if (match) return match as any
            }

            return null
        }

        const resolveSchoolYearName = (date: Date | string | undefined | null) => {
            const match = resolveSchoolYearForDate(date)
            if (match?.name) return String(match.name)

            if (!date) return ''
            const d = new Date(date)
            if (!Number.isFinite(d.getTime())) return ''
            const year = d.getFullYear()
            const month = d.getMonth()
            const startYear = month >= 8 ? year : year - 1
            return `${startYear}/${startYear + 1}`
        }

        const resolveSignatureSchoolYearName = (sig: any) => {
            const base = resolveSchoolYearName(sig?.signedAt)
            const t = String(sig?.type || 'standard')
            if (t !== 'end_of_year') return base

            const byDate = resolveSchoolYearForDate(sig?.signedAt)
            if (byDate?.sequence && Number(byDate.sequence) > 0) {
                const next = allSchoolYears.find((y: any) => Number(y.sequence) === Number(byDate.sequence) + 1)
                if (next?.name) return String(next.name)
            }

            const ordered = [...(allSchoolYears || [])].sort((a: any, b: any) => {
                return new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime()
            })
            const idx = byDate ? ordered.findIndex((y: any) => String(y._id) === String(byDate._id)) : -1
            if (idx >= 0 && idx < ordered.length - 1 && ordered[idx + 1]?.name) {
                return String(ordered[idx + 1].name)
            }

            const computed = computeYearNameFromRange(base, 1)
            if (computed) return computed

            return base
        }

        const existingDataSignatures = Array.isArray((assignment as any).data?.signatures)
            ? ([...(assignment as any).data.signatures] as any[])
            : []

        const mergedDataSignatures = [...existingDataSignatures]

        allSignatures.forEach(sig => {
            const already = mergedDataSignatures.some((s: any) => {
                const sameSubAdmin = String(s.subAdminId) === String(sig.subAdminId)
                const sameType = String(s.type || 'standard') === String(sig.type || 'standard')
                const sa = s.signedAt ? new Date(s.signedAt).getTime() : 0
                const sb = sig.signedAt ? new Date(sig.signedAt).getTime() : 0
                return sameSubAdmin && sameType && sa === sb
            })
            if (already) return

            mergedDataSignatures.push({
                type: sig.type,
                signedAt: sig.signedAt,
                subAdminId: sig.subAdminId,
                schoolYearId: undefined,
                schoolYearName: resolveSignatureSchoolYearName(sig),
                level: sig.level,
            })
        })

            ; (assignment as any).data = (assignment as any).data || {}
            ; (assignment as any).data.signatures = mergedDataSignatures

        // Filter signatures by active school year
        const activeSchoolYearForSig = await SchoolYear.findOne({ active: true }).lean()
        console.log('[/review] Active school year:', activeSchoolYearForSig ? {
            id: activeSchoolYearForSig._id,
            name: activeSchoolYearForSig.name,
            startDate: activeSchoolYearForSig.startDate,
            endDate: activeSchoolYearForSig.endDate
        } : 'none')

        if (activeSchoolYearForSig) {
            let thresholdDate = activeSchoolYearForSig.startDate

            // Try to find previous school year to determine the "gap"
            const previousYear = await SchoolYear.findOne({ endDate: { $lt: activeSchoolYearForSig.startDate } })
                .sort({ endDate: -1 })
                .lean()

            if (previousYear) {
                // If there is a previous year, we consider signatures created AFTER the previous year ended
                // as belonging to the current/upcoming cycle.
                thresholdDate = previousYear.endDate
                console.log('[/review] Previous year found, threshold date:', thresholdDate)
            } else {
                console.log('[/review] No previous year, using start date as threshold:', thresholdDate)
            }

            // Use the later of endDate or current date as the upper bound
            // This handles cases where the school year has technically ended but we're still in that academic period
            const now = new Date()
            const endDate = new Date(activeSchoolYearForSig.endDate)
            const upperBound = now > endDate ? now : endDate

            // CRITICAL FIX: If current date is before the threshold (i.e., we're working before the "active" 
            // school year officially starts), we need to adjust. Use the earlier of threshold or one year ago.
            const oneYearAgo = new Date(now)
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
            const effectiveThreshold = new Date(thresholdDate) > now ? oneYearAgo : new Date(thresholdDate)
            console.log('[/review] Effective threshold:', effectiveThreshold, 'Original threshold:', thresholdDate, 'Now:', now)

            signatures = signatures.filter(s => {
                if (!s.signedAt) return false
                const d = new Date(s.signedAt).getTime()
                const threshold = effectiveThreshold.getTime()
                const end = upperBound.getTime()
                // Filter: signedAt must be after threshold and before/at upperBound
                const isValid = d > threshold && d <= end
                console.log(`[/review] Signature ${s._id} signedAt=${s.signedAt} (${d}) threshold=${effectiveThreshold} (${threshold}) upperBound=${upperBound} (${end}) isValid=${isValid}`)

                if (!isValid) return false

                // Filter by level if present in signature
                if (s.level && level) {
                    if (s.level !== level) {
                        console.log(`[/review] Signature ${s._id} rejected: level mismatch (sig=${s.level}, student=${level})`)
                        return false
                    }
                }

                // Filter by promotion date (reject signatures older than current level start)
                if (levelStartDate && s.signedAt) {
                    const sigDate = new Date(s.signedAt).getTime()
                    if (sigDate < levelStartDate.getTime()) {
                        console.log(`[/review] Signature ${s._id} rejected: predates promotion to ${level} (sig=${s.signedAt}, promo=${levelStartDate})`)
                        return false
                    }
                }

                return true
            })
        }

        console.log('[/review] Filtered signatures:', signatures.map(s => ({ id: s._id, type: s.type })))

        const signature = signatures.find(s => s.type === 'standard' || !s.type)
        const finalSignature = signatures.find(s => s.type === 'end_of_year')

        console.log('[/review] signature:', signature ? { id: signature._id, type: signature.type } : 'none')
        console.log('[/review] finalSignature:', finalSignature ? { id: finalSignature._id, type: finalSignature.type } : 'none')

        const isSignedByMe = signature && signature.subAdminId === subAdminId

        // Level and className already calculated above

        // Use centralized helper for versioning and data merging
        const versionedTemplate = mergeAssignmentDataIntoTemplate(template, assignment)

        const canEdit = authorized && (req as any).user.role !== 'AEFE'

        // Get active school year
        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
        const isPromoted = student?.promotions?.some((p: any) => p.schoolYearId === String(activeSchoolYear?._id))
        const activeSemester = (activeSchoolYear as any)?.activeSemester || 1

        let eligibleForSign = assignment.status === 'completed' || assignment.status === 'signed'
        if (!eligibleForSign) {
            // First try to find an active enrollment with a classId
            let enrollment = activeSchoolYear ? await Enrollment.findOne({
                studentId: assignment.studentId,
                schoolYearId: activeSchoolYear._id,
                status: 'active',
                classId: { $exists: true, $ne: null }
            }).lean() : null

            // If no active enrollment with class found, check for 'promoted' status enrollment
            // This handles promoted students who still need their previous class info
            if (!enrollment || !enrollment.classId) {
                enrollment = await Enrollment.findOne({
                    studentId: assignment.studentId,
                    status: 'promoted',
                    classId: { $exists: true, $ne: null }
                }).sort({ updatedAt: -1 }).lean()
            }

            // Also fallback to any enrollment with a classId for the student
            if (!enrollment || !enrollment.classId) {
                enrollment = await Enrollment.findOne({
                    studentId: assignment.studentId,
                    classId: { $exists: true, $ne: null }
                }).sort({ updatedAt: -1 }).lean()
            }

            const clsId = enrollment?.classId ? String(enrollment.classId) : undefined
            const teacherAssignments = clsId ? await TeacherClassAssignment.find({ classId: clsId }).lean() : []
            const teacherCompletions = (assignment as any).teacherCompletions || []

            const categoriesRequired = new Set<string>()
            if (versionedTemplate && Array.isArray((versionedTemplate as any).pages)) {
                for (let p = 0; p < (versionedTemplate as any).pages.length; p++) {
                    const page: any = (versionedTemplate as any).pages[p]
                    for (let b = 0; b < (page.blocks || []).length; b++) {
                        const block: any = page.blocks[b]
                        if (['language_toggle', 'language_toggle_v2'].includes(block.type)) {
                            const items = block.props?.items || []
                            for (const item of items) {
                                let isAssigned = true
                                if (item?.levels && Array.isArray(item.levels) && item.levels.length > 0) {
                                    if (!level || !item.levels.includes(level)) isAssigned = false
                                }
                                if (!isAssigned) continue
                                const raw = String(item.type || item.label || '')
                                const code = String(item.code || '').toLowerCase()
                                const l = raw.toLowerCase()
                                if (code === 'ar' || l.includes('arabe') || l.includes('arabic') || l.includes('العربية')) categoriesRequired.add('ar')
                                else if (code === 'en' || l.includes('anglais') || l.includes('english')) categoriesRequired.add('en')
                                else categoriesRequired.add('poly')
                            }
                        }
                    }
                }
            }

            const isCatCompleted = (cat: string) => {
                let responsible = (teacherAssignments || [])
                    .filter((ta: any) => String(ta.classId) === String(clsId))
                    .filter((ta: any) => {
                        const langs = ((ta as any).languages || []).map((x: string) => x.toLowerCase())
                        if (cat === 'ar') {
                            if (langs.length === 0) return !(ta as any).isProfPolyvalent
                            return langs.some((v: string) => v === 'ar' || v.includes('arabe') || v.includes('arabic') || v.includes('العربية'))
                        }
                        if (cat === 'en') {
                            if (langs.length === 0) return !(ta as any).isProfPolyvalent
                            return langs.some((v: string) => v === 'en' || v.includes('anglais') || v.includes('english'))
                        }
                        return (ta as any).isProfPolyvalent
                    })
                    .map((ta: any) => String(ta.teacherId))
                if (responsible.length === 0) responsible = ((assignment as any).assignedTeachers || []).map((id: any) => String(id))
                return responsible.some((tid: string) => (teacherCompletions || []).some((tc: any) => String(tc.teacherId) === String(tid) && tc.completed))
            }
            let ok = true
            for (const cat of categoriesRequired) {
                if (!isCatCompleted(cat)) { ok = false; break }
            }
            eligibleForSign = ok
        }

        let resolvedClassId = classId
        if (!resolvedClassId) {
            const fallbackEnrollmentQuery = (q: any) =>
                Enrollment.findOne(q).sort({ updatedAt: -1 }).lean()

            let enrollment = activeSchoolYear
                ? await fallbackEnrollmentQuery({
                    studentId: assignment.studentId,
                    schoolYearId: activeSchoolYear._id,
                    status: 'active',
                    classId: { $exists: true, $ne: null }
                })
                : null

            if (!enrollment || !enrollment.classId) {
                enrollment = await fallbackEnrollmentQuery({
                    studentId: assignment.studentId,
                    status: 'promoted',
                    classId: { $exists: true, $ne: null }
                })
            }

            if (!enrollment || !enrollment.classId) {
                enrollment = await fallbackEnrollmentQuery({
                    studentId: assignment.studentId,
                    classId: { $exists: true, $ne: null }
                })
            }

            resolvedClassId = enrollment?.classId ? String(enrollment.classId) : null
        }

        const teacherCompletions = (assignment as any).teacherCompletions || []
        const teacherAssignments = resolvedClassId
            ? await TeacherClassAssignment.find({
                classId: resolvedClassId,
                ...(activeSchoolYear?._id ? { schoolYearId: String(activeSchoolYear._id) } : {})
            }).lean()
            : []

        const teacherIds = [...new Set((teacherAssignments || []).map((ta: any) => String(ta.teacherId)))]
        const [teachers, outlookTeachers] = teacherIds.length
            ? await Promise.all([
                User.find({ _id: { $in: teacherIds } }).lean(),
                OutlookUser.find({ _id: { $in: teacherIds } }).lean()
            ])
            : [[], []]

        const teacherMap = new Map(
            [...(teachers as any[]), ...(outlookTeachers as any[])].map((t: any) => [
                String(t._id),
                String(t.displayName || t.email || 'Unknown')
            ])
        )

        const getTeacherName = (teacherId: string) => teacherMap.get(String(teacherId)) || 'Unknown'

        const langMatch = (langs: string[], needles: string[]) => {
            const normalized = (langs || []).map(l => String(l || '').toLowerCase())
            return needles.some(n => normalized.some(v => v === n || v.includes(n)))
        }

        const isResponsibleTeacherFor = (ta: any, category: 'ar' | 'en' | 'poly') => {
            if (category === 'poly') return (ta as any).isProfPolyvalent
            const langs = ((ta as any).languages || []).map((x: string) => String(x || '').toLowerCase())
            if (langs.length === 0) return !(ta as any).isProfPolyvalent
            if (category === 'ar') return langMatch(langs, ['ar', 'arabe', 'arabic', 'العربية'])
            return langMatch(langs, ['en', 'uk', 'gb', 'anglais', 'english'])
        }

        const arabicTeacherIds = (teacherAssignments || [])
            .filter((ta: any) => isResponsibleTeacherFor(ta, 'ar'))
            .map((ta: any) => String(ta.teacherId))

        const englishTeacherIds = (teacherAssignments || [])
            .filter((ta: any) => isResponsibleTeacherFor(ta, 'en'))
            .map((ta: any) => String(ta.teacherId))

        const polyvalentTeacherIds = (teacherAssignments || [])
            .filter((ta: any) => isResponsibleTeacherFor(ta, 'poly'))
            .map((ta: any) => String(ta.teacherId))

        const groupStatus = (ids: string[]) => {
            const uniqueIds = [...new Set(ids)]
            const doneSem1 = uniqueIds.some(tid =>
                (teacherCompletions || []).some((tc: any) => String(tc.teacherId) === String(tid) && (tc.completedSem1 || tc.completed))
            )
            const doneSem2 = uniqueIds.some(tid =>
                (teacherCompletions || []).some((tc: any) => String(tc.teacherId) === String(tid) && tc.completedSem2)
            )
            const doneOverall = uniqueIds.some(tid =>
                (teacherCompletions || []).some((tc: any) => String(tc.teacherId) === String(tid) && (tc.completedSem2 || tc.completedSem1 || tc.completed))
            )
            return {
                teachers: uniqueIds.map(id => ({ id, name: getTeacherName(id) })),
                doneSem1,
                doneSem2,
                doneOverall
            }
        }

        const teacherStatus = {
            arabic: groupStatus(arabicTeacherIds),
            english: groupStatus(englishTeacherIds),
            polyvalent: groupStatus(polyvalentTeacherIds)
        }

        if (!assignment.data) assignment.data = {}
        assignment.data.signatures = mergedDataSignatures

        const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
        const subadminAssignedLevels = roleScope?.levels || []

        // Ensure level and className are populated from resolvedClassId or fallback to last known enrollment/student
        try {
            if ((!level || !className) && resolvedClassId) {
                const clsDoc = await ClassModel.findById(resolvedClassId).lean()
                if (clsDoc) {
                    level = level || (clsDoc as any).level || ((student as any)?.level || '')
                    className = className || (clsDoc as any).name || ((student as any)?.className || '')
                }
            }

            if ((!level || !className) && enrollments && enrollments.length > 0) {
                const lastEnrollment = enrollments[enrollments.length - 1]
                level = level || (lastEnrollment as any).level || ((student as any)?.level || '')
                className = className || (lastEnrollment as any).className || ((student as any)?.className || '')
            }
        } catch (err) {
            console.warn('[/review] Error resolving class info for student:', err)
        }

        res.json({
            assignment,
            template: versionedTemplate,
            student: { ...student, level, className },
            signature: signature || null,
            finalSignature: finalSignature || null,
            isSignedByMe: isSignedByMe || false,
            canEdit,
            isPromoted,
            activeSemester,
            eligibleForSign,
            teacherStatus,
            classId: resolvedClassId,
            subadminAssignedLevels
        })
    } catch (e: any) {
        console.error('[/review] Error:', e)
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Sign all templates for a class
subAdminTemplatesRouter.post('/templates/sign-class/:classId', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { classId } = req.params

        // Get all students in this class
        const enrollments = await Enrollment.find({ classId }).lean()
        const studentIds = enrollments.map(e => e.studentId)

        // Verify authorization: Sub-admin must be assigned to at least one teacher of this class
        const teacherClassAssignments = await TeacherClassAssignment.find({ classId }).lean()
        const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId)

        const subAdminAssignments = await SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: classTeacherIds },
        }).lean()

        let authorized = subAdminAssignments.length > 0

        if (!authorized) {
            // Check RoleScope
            const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
            if (roleScope?.levels?.length) {
                const cls = await ClassModel.findById(classId).lean()
                if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                    authorized = true
                }
            }
        }

        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        const bypassScopes = (req as any).user.bypassScopes || []
        let canBypass = false

        if (bypassScopes.some((s: any) => s.type === 'ALL')) {
            canBypass = true
        } else if (bypassScopes.some((s: any) => s.type === 'CLASS' && s.value === classId)) {
            canBypass = true
        } else {
            // Check LEVEL
            const cls = await ClassModel.findById(classId).lean()
            if (cls && cls.level && bypassScopes.some((s: any) => s.type === 'LEVEL' && s.value === cls.level)) {
                canBypass = true
            }
        }

        const query: any = { studentId: { $in: studentIds } }
        if (!canBypass) {
            query.status = 'completed'
        }

        // Get all template assignments for these students
        const templateAssignments = await TemplateAssignment.find(query).lean()

        // Filter out those already signed
        const assignmentIds = templateAssignments.map(a => String(a._id))
        const existingSignatures = await TemplateSignature.find({
            templateAssignmentId: { $in: assignmentIds }
        }).lean()
        const signedIds = new Set(existingSignatures.map(s => s.templateAssignmentId))

        const toSign = templateAssignments.filter(a => !signedIds.has(String(a._id)))

        // Create signatures for all unsigned assignments
        const signatures = await Promise.all(toSign.map(async (assignment) => {
            const signature = await TemplateSignature.create({
                templateAssignmentId: String(assignment._id),
                subAdminId,
                signedAt: new Date(),
                status: 'signed',
            })

            // Update assignment status
            await TemplateAssignment.findByIdAndUpdate(assignment._id, { status: 'signed' })

            // Log audit
            const template = await GradebookTemplate.findById(assignment.templateId).lean()
            const student = await Student.findById(assignment.studentId).lean()
            await logAudit({
                userId: subAdminId,
                action: 'SIGN_TEMPLATE',
                details: {
                    templateId: assignment.templateId,
                    templateName: template?.name,
                    studentId: assignment.studentId,
                    studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
                    classId,
                },
                req,
            })

            return signature
        }))

        res.json({
            signed: signatures.length,
            alreadySigned: templateAssignments.length - toSign.length,
            total: templateAssignments.length
        })
    } catch (e: any) {
        res.status(500).json({ error: 'sign_failed', message: e.message })
    }
})

// Sub-admin: Mark assignment as done
subAdminTemplatesRouter.post('/templates/:assignmentId/mark-done', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { assignmentId } = req.params

        // Get assignment
        const assignment = await TemplateAssignment.findById(assignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        // Verify the assigned teachers are supervised by this sub-admin
        const subAdminAssignments = await SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: assignment.assignedTeachers },
        }).lean()

        if (subAdminAssignments.length === 0) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        // Update assignment
        const updated = await TemplateAssignment.findByIdAndUpdate(
            assignmentId,
            {
                isCompleted: true,
                completedAt: new Date(),
                completedBy: subAdminId,
            },
            { new: true }
        )

        // Log audit
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const student = await Student.findById(assignment.studentId).lean()
        await logAudit({
            userId: subAdminId,
            action: 'MARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
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

// Sub-admin: Unmark assignment as done
subAdminTemplatesRouter.post('/templates/:assignmentId/unmark-done', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { assignmentId } = req.params

        // Get assignment
        const assignment = await TemplateAssignment.findById(assignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        // Verify the assigned teachers are supervised by this sub-admin
        const subAdminAssignments = await SubAdminAssignment.find({
            subAdminId,
            teacherId: { $in: assignment.assignedTeachers },
        }).lean()

        if (subAdminAssignments.length === 0) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        // Update assignment
        const updated = await TemplateAssignment.findByIdAndUpdate(
            assignmentId,
            {
                isCompleted: false,
                completedAt: null,
                completedBy: null,
            },
            { new: true }
        )

        // Log audit
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const student = await Student.findById(assignment.studentId).lean()
        await logAudit({
            userId: subAdminId,
            action: 'UNMARK_ASSIGNMENT_DONE',
            details: {
                assignmentId,
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

// Sub-admin: Update template data (e.g. language toggles or scoped data)
subAdminTemplatesRouter.patch('/templates/:assignmentId/data', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { assignmentId } = req.params
        const { type, pageIndex, blockIndex, items, data } = req.body

        if (!type && !data) return res.status(400).json({ error: 'missing_payload' })

        // Get assignment
        const assignment = await TemplateAssignment.findById(assignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        // Verify authorization
        // Check if sub-admin is assigned to any teacher of the student's class
        const enrollment = await Enrollment.findOne({ studentId: assignment.studentId }).lean()
        if (!enrollment) return res.status(403).json({ error: 'student_not_enrolled' })

        let authorized = false

        if (enrollment.classId) {
            const teacherClassAssignments = await TeacherClassAssignment.find({ classId: enrollment.classId }).lean()
            const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId)

            const subAdminAssignments = await SubAdminAssignment.find({
                subAdminId,
                teacherId: { $in: classTeacherIds },
            }).lean()

            authorized = subAdminAssignments.length > 0

            if (!authorized) {
                // Check RoleScope
                const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
                if (roleScope?.levels?.length) {
                    const cls = await ClassModel.findById(enrollment.classId).lean()
                    if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                        authorized = true
                    }
                }
            }
        } else {
            // If no class (e.g. promoted), check direct assignment to teachers?
            // Or maybe check if sub-admin is assigned to the student's *previous* teachers?
            // For now, if no class, we might rely on direct assignment check if implemented, 
            // but here we only check class-based authorization.
            // Let's check if the assignment has assignedTeachers (direct assignment)
            if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
                const subAdminAssignments = await SubAdminAssignment.find({
                    subAdminId,
                    teacherId: { $in: assignment.assignedTeachers },
                }).lean()
                if (subAdminAssignments.length > 0) authorized = true
            }
        }

        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        // Prevent AEFE/RPP users from making direct edits here — they can only make suggestions
        const userRole = (req as any).user.role
        if (userRole === 'AEFE') {
            return res.status(403).json({ error: 'not_authorized_to_edit', message: 'AEFE users may only suggest changes' })
        }

        if (type === 'language_toggle') {
            if (pageIndex === undefined || blockIndex === undefined || !items) {
                return res.status(400).json({ error: 'missing_payload' })
            }

            const template = await GradebookTemplate.findById(assignment.templateId).select('pages').lean()
            const block = template?.pages?.[pageIndex]?.blocks?.[blockIndex]
            const blockId = typeof block?.props?.blockId === 'string' && block.props.blockId.trim() ? block.props.blockId.trim() : null
            const keyStable = blockId ? `language_toggle_${blockId}` : `language_toggle_${pageIndex}_${blockIndex}`

            // Update assignment data
            const updated = await TemplateAssignment.findByIdAndUpdate(
                assignmentId,
                {
                    $set: {
                        [`data.${keyStable}`]: items
                    }
                },
                { new: true }
            )

            // Log audit
            await logAudit({
                userId: subAdminId,
                action: 'UPDATE_TEMPLATE_DATA',
                details: {
                    assignmentId,
                    type,
                    pageIndex,
                    blockIndex,
                    items
                },
                req,
            })

            res.json({ success: true, assignment: updated })
        } else if (data) {
            const currentData = assignment.data || {}

            // Use optimistic concurrency if client provides expectedDataVersion
            const { expectedDataVersion } = req.body as any
            const { generateChangeId } = require('../utils/changeId')
            const changeId = generateChangeId()

            const filter: any = { _id: assignmentId }
            if (typeof expectedDataVersion === 'number') filter.dataVersion = expectedDataVersion

            // Build targeted $set operations for each top-level key in the incoming data patch
            const setOps: any = {}
            for (const k of Object.keys(data || {})) {
                setOps[`data.${k}`] = data[k]
            }

            // Ensure we preserve other data keys and mark status
            const updated = await TemplateAssignment.findOneAndUpdate(
                filter,
                {
                    $set: {
                        ...setOps,
                        status: assignment.status === 'draft' ? 'in_progress' : assignment.status
                    },
                    $inc: { dataVersion: 1 }
                },
                { new: true }
            )

            if (!updated) {
                const current = await TemplateAssignment.findById(assignmentId).lean()
                return res.status(409).json({ error: 'conflict', message: 'data_version_mismatch', current })
            }

            await logAudit({
                userId: subAdminId,
                action: 'UPDATE_TEMPLATE_DATA',
                details: {
                    assignmentId,
                    type: type || 'generic',
                    data
                },
                req,
            })

            // Persist change log entry
            await TemplateChangeLog.create({
                templateAssignmentId: assignmentId,
                teacherId: subAdminId,
                changeType: type || 'generic',
                pageIndex: typeof pageIndex === 'number' ? pageIndex : -1,
                blockIndex: typeof blockIndex === 'number' ? blockIndex : -1,
                before: currentData,
                after: updated.data,
                changeId,
                dataVersion: (updated as any).dataVersion,
                userId: subAdminId,
                timestamp: new Date(),
            })

            res.json({ success: true, assignment: updated, changeId, dataVersion: (updated as any).dataVersion })
        } else {
            res.status(400).json({ error: 'unsupported_type' })
        }

    } catch (e: any) {
        res.status(500).json({ error: 'update_failed', message: e.message })
    }
})

// Sub-admin: Get students in assigned levels
subAdminTemplatesRouter.get('/students', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId

        // Get active school year
        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
        if (!activeSchoolYear) return res.json([])

        // Get RoleScope for levels
        const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
        const levels = roleScope?.levels || []

        if (levels.length === 0) {
            return res.json([])
        }

        // Get classes in these levels
        const classes = await ClassModel.find({
            level: { $in: levels },
            schoolYearId: activeSchoolYear._id
        }).lean()
        const classIds = classes.map(c => String(c._id))
        const classMap = new Map(classes.map(c => [String(c._id), c]))

        // Get enrollments in these classes
        const enrollments = await Enrollment.find({
            classId: { $in: classIds },
            schoolYearId: activeSchoolYear._id
        }).lean()
        const enrolledStudentIds = enrollments.map(e => e.studentId)
        const enrollmentMap = new Map(enrollments.map(e => [e.studentId, e]))

        // Get students by level OR by enrollment
        const studentsByLevel = await Student.find({ level: { $in: levels } }).lean()
        const studentsByEnrollment = await Student.find({ _id: { $in: enrolledStudentIds } }).lean()

        // Merge and deduplicate
        const allStudents = [...studentsByLevel, ...studentsByEnrollment]
        const uniqueStudents = Array.from(new Map(allStudents.map(s => [String(s._id), s])).values())

        // Attach class info
        const result = uniqueStudents.map(s => {
            const enrollment = enrollmentMap.get(String(s._id))
            const cls = (enrollment && enrollment.classId) ? classMap.get(enrollment.classId) : null

            return {
                ...s,
                classId: cls ? String(cls._id) : undefined,
                className: cls ? cls.name : undefined,
                level: cls ? cls.level : s.level
            }
        })

        res.json(result)

    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Assign student to class
subAdminTemplatesRouter.post('/assign-student', requireAuth(['SUBADMIN', 'AEFE']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { studentId, classId } = req.body

        if (!studentId || !classId) return res.status(400).json({ error: 'missing_params' })

        // Verify class is allowed
        const cls = await ClassModel.findById(classId).lean()
        if (!cls) return res.status(404).json({ error: 'class_not_found' })

        const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
        const levels = roleScope?.levels || []

        if (!cls.level || !levels.includes(cls.level)) {
            return res.status(403).json({ error: 'not_authorized_for_level' })
        }

        // Get active school year
        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
        if (!activeSchoolYear) return res.status(400).json({ error: 'no_active_year' })

        if (String(cls.schoolYearId) !== String(activeSchoolYear._id)) {
            return res.status(400).json({ error: 'class_wrong_year' })
        }

        // Update/Create enrollment
        const existing = await Enrollment.findOne({
            studentId,
            schoolYearId: activeSchoolYear._id
        })

        if (existing) {
            existing.classId = classId
            await existing.save()
            if (cls && cls.level) {
                await checkAndAssignTemplates(studentId, cls.level, String(activeSchoolYear._id), classId, (req as any).user.userId)
            }
        } else {
            await Enrollment.create({
                studentId,
                classId,
                schoolYearId: activeSchoolYear._id
            })
            if (cls && cls.level) {
                await checkAndAssignTemplates(studentId, cls.level, String(activeSchoolYear._id), classId, (req as any).user.userId)
            }
        }

        // Update student level to match class level
        await Student.findByIdAndUpdate(studentId, { level: cls.level })

        // Update template assignments
        const teacherAssignments = await TeacherClassAssignment.find({ classId }).lean()
        const teacherIds = teacherAssignments.map(t => t.teacherId)

        await TemplateAssignment.updateMany(
            {
                studentId,
                status: { $in: ['draft', 'in_progress'] }
            },
            { $set: { assignedTeachers: teacherIds } }
        )

        res.json({ success: true })

    } catch (e: any) {
        res.status(500).json({ error: 'assign_failed', message: e.message })
    }
})
