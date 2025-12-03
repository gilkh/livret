import { Router } from 'express'
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
import { SavedGradebook } from '../models/SavedGradebook'
import { StudentCompetencyStatus } from '../models/StudentCompetencyStatus'
import { logAudit } from '../utils/auditLogger'
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

// Sub-admin: Get signature
subAdminTemplatesRouter.get('/signature', requireAuth(['SUBADMIN']), async (req, res) => {
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
subAdminTemplatesRouter.post('/signature/upload', requireAuth(['SUBADMIN']), upload.single('file'), async (req, res) => {
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
subAdminTemplatesRouter.delete('/signature', requireAuth(['SUBADMIN']), async (req, res) => {
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
subAdminTemplatesRouter.get('/promoted-students', requireAuth(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        
        // Get active school year
        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()

        // Find students promoted by this sub-admin
        const students = await Student.find({
            'promotions.promotedBy': subAdminId
        }).lean()

        const promotedStudents = []

        for (const student of students) {
            // Check if currently enrolled in a class (active)
            // We want to exclude students who have already been assigned to a class in the new year.
            // The promotion creates an 'active' enrollment without a class.
            // The old enrollment is marked 'promoted'.
            // So if we find an 'active' enrollment WITH a class, they are already assigned.
            const assignedEnrollment = await Enrollment.findOne({ 
                studentId: student._id, 
                status: 'active',
                classId: { $exists: true, $ne: null }
            }).lean()
            
            if (assignedEnrollment) continue // Already assigned to a class

            // Get the relevant promotion (the one by this sub-admin, likely the last one)
            const promotions = student.promotions || []
            const lastPromotion = promotions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
            
            if (lastPromotion && lastPromotion.promotedBy === subAdminId && String(lastPromotion.schoolYearId) === String(activeSchoolYear?._id)) {
                // Find the latest assignment for this student
                const assignment = await TemplateAssignment.findOne({ studentId: student._id })
                    .sort({ assignedAt: -1 })
                    .lean()

                promotedStudents.push({
                    _id: student._id,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    fromLevel: lastPromotion.fromLevel,
                    toLevel: lastPromotion.toLevel,
                    date: lastPromotion.date,
                    assignmentId: assignment ? assignment._id : null
                })
            }
        }

        res.json(promotedStudents)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Get classes with pending signatures
subAdminTemplatesRouter.get('/classes', requireAuth(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId

        // Get active school year
        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
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
        
        // Get unique class IDs and their details
        const classIds = [...new Set(enrollments.map(e => e.classId))]
        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()

        // For each class, count pending signatures
        const classesWithStats = await Promise.all(classes.map(async (cls: any) => {
            const classEnrollments = enrollments.filter(e => String(e.classId) === String(cls._id))
            const classStudentIds = classEnrollments.map(e => e.studentId)
            
            const classAssignments = templateAssignments.filter(a => 
                classStudentIds.includes(a.studentId)
            )
            
            const assignmentIds = classAssignments.map(a => String(a._id))
            const signatures = await TemplateSignature.find({ 
                templateAssignmentId: { $in: assignmentIds } 
            }).lean()
            
            const signedCount = signatures.length
            const totalCount = classAssignments.length
            
            return {
                ...cls,
                pendingSignatures: totalCount - signedCount,
                totalAssignments: totalCount,
                signedAssignments: signedCount,
            }
        }))

        res.json(classesWithStats)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Get assigned teachers
subAdminTemplatesRouter.get('/teachers', requireAuth(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const assignments = await SubAdminAssignment.find({ subAdminId }).lean()
        const teacherIds = assignments.map(a => a.teacherId)
        const teachers = await User.find({ _id: { $in: teacherIds } }).lean()

        res.json(teachers)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Get template changes by a teacher
subAdminTemplatesRouter.get('/teachers/:teacherId/changes', requireAuth(['SUBADMIN']), async (req, res) => {
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

            const template = await GradebookTemplate.findById(templateAssignment.templateId).lean()
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
subAdminTemplatesRouter.get('/pending-signatures', requireAuth(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId

        // Get active school year
        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
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
        const signatures = await TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } }).lean()
        const signatureMap = new Map(signatures.map(s => [s.templateAssignmentId, s]))

        // Enrich with template and student data, including signature info
        const enrichedAssignments = await Promise.all(templateAssignments.map(async (assignment) => {
            const template = await GradebookTemplate.findById(assignment.templateId).lean()
            const student = await Student.findById(assignment.studentId).lean()
            const signature = signatureMap.get(String(assignment._id))
            
            const classId = studentClassMap.get(String(assignment.studentId))
            const classInfo = classId ? classMap.get(classId) : null

            const isPromoted = student?.promotions?.some((p: any) => p.schoolYearId === String(activeSchoolYear?._id))

            return {
                ...assignment,
                template,
                student,
                signature,
                className: classInfo?.name,
                level: classInfo?.level,
                isPromoted
            }
        }))

        // Filter out promoted students
        const finalAssignments = enrichedAssignments.filter(a => !a.isPromoted)

        res.json(finalAssignments)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Promote student
subAdminTemplatesRouter.post('/templates/:templateAssignmentId/promote', requireAuth(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { templateAssignmentId } = req.params
        const { nextLevel } = req.body

        if (!nextLevel) return res.status(400).json({ error: 'missing_level' })

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

        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        const student = await Student.findById(assignment.studentId)
        if (!student) return res.status(404).json({ error: 'student_not_found' })

        // Get current enrollment to find school year
        // Handle missing status field by treating it as active
        const enrollment = await Enrollment.findOne({ 
            studentId: assignment.studentId, 
            $or: [{ status: 'active' }, { status: { $exists: false } }] 
        }).lean()
        let yearName = new Date().getFullYear().toString()
        let currentLevel = student.level || ''
        let currentSchoolYearId = ''
        let currentSchoolYearSequence = 0

        if (enrollment) {
            if (enrollment.classId) {
                const cls = await ClassModel.findById(enrollment.classId).lean()
                if (cls) {
                    currentLevel = cls.level || ''
                    currentSchoolYearId = cls.schoolYearId
                }
            }
            
            // Fallback to enrollment's schoolYearId if class lookup failed or no class
            if (!currentSchoolYearId && enrollment.schoolYearId) {
                currentSchoolYearId = enrollment.schoolYearId
            }

            if (currentSchoolYearId) {
                const sy = await SchoolYear.findById(currentSchoolYearId).lean()
                if (sy) {
                    yearName = sy.name
                    currentSchoolYearSequence = sy.sequence || 0
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
        const currentLevelDoc = await Level.findOne({ name: currentLevel }).lean()
        let calculatedNextLevel = ''
        if (currentLevelDoc) {
            const nextLevelDoc = await Level.findOne({ order: currentLevelDoc.order + 1 }).lean()
            if (nextLevelDoc) {
                calculatedNextLevel = nextLevelDoc.name
            }
        }
        
        // Fallback if levels not populated or not found
        if (!calculatedNextLevel) calculatedNextLevel = nextLevel 

        // Find next school year by sequence
        let nextSchoolYearId = ''
        if (currentSchoolYearSequence > 0) {
             const nextSy = await SchoolYear.findOne({ sequence: currentSchoolYearSequence + 1 }).lean()
             if (nextSy) {
                 nextSchoolYearId = String(nextSy._id)
             }
        }
        
        if (!nextSchoolYearId && currentSchoolYearId) {
             // Fallback to old logic if sequence is missing (shouldn't happen after migration)
             const currentSy = await SchoolYear.findById(currentSchoolYearId).lean()
             if (currentSy && currentSy.name) {
                 const match = currentSy.name.match(/(\d{4})([-/.])(\d{4})/)
                 if (match) {
                     const startYear = parseInt(match[1])
                     const separator = match[2]
                     const endYear = parseInt(match[3])
                     const nextName = `${startYear + 1}${separator}${endYear + 1}`
                     const nextSy = await SchoolYear.findOne({ name: nextName }).lean()
                     if (nextSy) nextSchoolYearId = String(nextSy._id)
                 }
             }
        }

        if (!nextSchoolYearId) {
             return res.status(400).json({ error: 'no_next_year', message: 'Next school year not found' })
        }

        // Create Gradebook Snapshot
        if (currentSchoolYearId && enrollment) {
            const statuses = await StudentCompetencyStatus.find({ studentId: student._id }).lean()
            
            const snapshotData = {
                student: student.toObject ? student.toObject() : student,
                enrollment: enrollment,
                statuses: statuses,
                assignment: assignment
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
            await Enrollment.findByIdAndUpdate(enrollment._id, { status: 'promoted' })
        }

        // Create new Enrollment for next year
        await Enrollment.create({
            studentId: student._id,
            schoolYearId: nextSchoolYearId,
            status: 'active',
            // classId is optional
        })

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
            to: nextLevel,
            date: new Date(),
            year: yearName,
            class: className
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
                to: nextLevel,
                templateAssignmentId
            },
            req,
        })

        // Return updated data to avoid client reload issues
        const updatedAssignment = await TemplateAssignment.findById(templateAssignmentId).lean()
        const updatedStudent = await Student.findById(student._id).lean()
        
        // Re-fetch template to ensure consistency (though it shouldn't change)
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const versionedTemplate = JSON.parse(JSON.stringify(template))
        if (updatedAssignment && updatedAssignment.data) {
            for (const [key, value] of Object.entries(updatedAssignment.data)) {
                if (key.startsWith('language_toggle_')) {
                    const [, , pageIdx, blockIdx] = key.split('_')
                    const pageIndex = parseInt(pageIdx)
                    const blockIndex = parseInt(blockIdx)
                    if (versionedTemplate.pages?.[pageIndex]?.blocks?.[blockIndex]?.props?.items) {
                        versionedTemplate.pages[pageIndex].blocks[blockIndex].props.items = value
                    }
                }
            }
        }

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
subAdminTemplatesRouter.post('/templates/:templateAssignmentId/sign', requireAuth(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { templateAssignmentId } = req.params

        // Get the template assignment
        const assignment = await TemplateAssignment.findById(templateAssignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

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

        // Check if assignment is completed
        if (!canBypass && assignment.status !== 'completed' && assignment.status !== 'signed') {
            return res.status(400).json({ error: 'not_completed', message: 'Teacher must mark assignment as done before signing' })
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

        const { type = 'standard' } = req.body

        // Check if already signed
        const existing = await TemplateSignature.findOne({ templateAssignmentId, type }).lean()
        if (existing) {
            return res.status(400).json({ error: 'already_signed' })
        }

        // Create signature
        const signature = await TemplateSignature.create({
            templateAssignmentId,
            subAdminId,
            signedAt: new Date(),
            status: 'signed',
            type
        })

        // Update assignment status (only if standard signature, or maybe always?)
        // Let's keep it simple: if any signature is added, we can consider it signed, 
        // but usually the standard one is the main one. 
        // If we sign 'end_of_year', we probably also want to mark it as signed if not already.
        await TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'signed' })

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
            },
            req,
        })

        res.json(signature)
    } catch (e: any) {
        res.status(500).json({ error: 'sign_failed', message: e.message })
    }
})

// Sub-admin: Unsign a template
subAdminTemplatesRouter.delete('/templates/:templateAssignmentId/sign', requireAuth(['SUBADMIN']), async (req, res) => {
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

        // Check if signed
        const existing = await TemplateSignature.findOne({ templateAssignmentId, type }).lean()
        if (!existing) {
            return res.status(400).json({ error: 'not_signed' })
        }

        // Delete signature
        await TemplateSignature.deleteOne({ templateAssignmentId, type })

        // Check if any signature remains
        const remaining = await TemplateSignature.countDocuments({ templateAssignmentId })
        if (remaining === 0) {
            // Update assignment status back to completed
            await TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'completed' })
        }

        // Log audit
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const student = await Student.findById(assignment.studentId).lean()
        await logAudit({
            userId: subAdminId,
            action: 'UNSIGN_TEMPLATE',
            details: {
                templateId: assignment.templateId,
                templateName: template?.name,
                studentId: assignment.studentId,
                studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            },
            req,
        })

        res.json({ ok: true })
    } catch (e: any) {
        res.status(500).json({ error: 'unsign_failed', message: e.message })
    }
})

// Sub-admin: Get template assignment for review
subAdminTemplatesRouter.get('/templates/:templateAssignmentId/review', requireAuth(['SUBADMIN']), async (req, res) => {
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
        const signatures = await TemplateSignature.find({ templateAssignmentId }).lean()
        
        const signature = signatures.find(s => s.type === 'standard' || !s.type)
        const finalSignature = signatures.find(s => s.type === 'end_of_year')
        
        const isSignedByMe = signature && signature.subAdminId === subAdminId

        // Get student level
        let level = student?.level || ''
        if (student) {
            const enrollment = await Enrollment.findOne({ studentId: assignment.studentId }).lean()
            if (enrollment && enrollment.classId) {
                const classDoc = await ClassModel.findById(enrollment.classId).lean()
                if (classDoc) level = classDoc.level || ''
            }
        }

        // Merge assignment data into template (for language toggles, dropdowns, etc.)
        const versionedTemplate = JSON.parse(JSON.stringify(template))
        if (assignment.data) {
            for (const [key, value] of Object.entries(assignment.data)) {
                // Handle language_toggle_X_Y format
                if (key.startsWith('language_toggle_')) {
                    const [, , pageIdx, blockIdx] = key.split('_')
                    const pageIndex = parseInt(pageIdx)
                    const blockIndex = parseInt(blockIdx)
                    if (versionedTemplate.pages?.[pageIndex]?.blocks?.[blockIndex]?.props?.items) {
                        versionedTemplate.pages[pageIndex].blocks[blockIndex].props.items = value
                    }
                }
            }
        }

        const canEdit = authorized

        // Get active school year
        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
        const isPromoted = student?.promotions?.some((p: any) => p.schoolYearId === String(activeSchoolYear?._id))
        const activeSemester = (activeSchoolYear as any)?.activeSemester || 1

        res.json({
            assignment,
            template: versionedTemplate,
            student: { ...student, level },
            signature,
            finalSignature,
            isSignedByMe,
            canEdit,
            isPromoted,
            activeSemester
        })
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Sub-admin: Sign all templates for a class
subAdminTemplatesRouter.post('/templates/sign-class/:classId', requireAuth(['SUBADMIN']), async (req, res) => {
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
subAdminTemplatesRouter.post('/templates/:assignmentId/mark-done', requireAuth(['SUBADMIN']), async (req, res) => {
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
subAdminTemplatesRouter.post('/templates/:assignmentId/unmark-done', requireAuth(['SUBADMIN']), async (req, res) => {
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

// Sub-admin: Update template data (e.g. language toggles)
subAdminTemplatesRouter.patch('/templates/:assignmentId/data', requireAuth(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId
        const { assignmentId } = req.params
        const { type, pageIndex, blockIndex, items } = req.body

        if (!type) return res.status(400).json({ error: 'missing_type' })

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

        if (type === 'language_toggle') {
            if (pageIndex === undefined || blockIndex === undefined || !items) {
                return res.status(400).json({ error: 'missing_payload' })
            }

            const key = `language_toggle_${pageIndex}_${blockIndex}`
            
            // Update assignment data
            const updated = await TemplateAssignment.findByIdAndUpdate(
                assignmentId,
                { 
                    $set: { 
                        [`data.${key}`]: items
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
        } else {
            res.status(400).json({ error: 'unsupported_type' })
        }

    } catch (e: any) {
        res.status(500).json({ error: 'update_failed', message: e.message })
    }
})
