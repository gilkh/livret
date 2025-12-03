import { Router } from 'express'
import { requireAuth } from '../auth'
import { SubAdminAssignment } from '../models/SubAdminAssignment'
import { TemplateAssignment } from '../models/TemplateAssignment'
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
import { SavedGradebook } from '../models/SavedGradebook'
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

export const aefeTemplatesRouter = Router()

// AEFE: Get signature
aefeTemplatesRouter.get('/signature', requireAuth(['AEFE']), async (req, res) => {
    try {
        const aefeId = (req as any).user.userId
        let user = await User.findById(aefeId).lean() as any
        if (!user) {
            user = await OutlookUser.findById(aefeId).lean()
        }
        
        if (!user || !user.signatureUrl) {
            return res.status(404).json({ error: 'no_signature' })
        }

        res.json({ signatureUrl: user.signatureUrl })
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// AEFE: Upload signature
aefeTemplatesRouter.post('/signature/upload', requireAuth(['AEFE']), upload.single('file'), async (req, res) => {
    try {
        const aefeId = (req as any).user.userId
        
        if (!req.file) {
            return res.status(400).json({ error: 'no_file' })
        }

        const signatureUrl = `/uploads/signatures/${req.file.filename}`

        // Delete old signature file if exists
        let user = await User.findById(aefeId).lean() as any
        let isOutlook = false
        if (!user) {
            user = await OutlookUser.findById(aefeId).lean()
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
            await OutlookUser.findByIdAndUpdate(aefeId, { signatureUrl })
        } else {
            await User.findByIdAndUpdate(aefeId, { signatureUrl })
        }

        await logAudit({
            userId: aefeId,
            action: 'UPLOAD_SIGNATURE',
            details: { signatureUrl },
            req,
        })

        res.json({ signatureUrl: `http://localhost:4000${signatureUrl}` })
    } catch (e: any) {
        res.status(500).json({ error: 'upload_failed', message: e.message })
    }
})

// AEFE: Delete signature
aefeTemplatesRouter.delete('/signature', requireAuth(['AEFE']), async (req, res) => {
    try {
        const aefeId = (req as any).user.userId
        let user = await User.findById(aefeId).lean() as any
        let isOutlook = false
        if (!user) {
            user = await OutlookUser.findById(aefeId).lean()
            isOutlook = true
        }

        if (user?.signatureUrl) {
            const oldPath = path.join(__dirname, '../../public', user.signatureUrl)
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath)
            }
        }

        if (isOutlook) {
            await OutlookUser.findByIdAndUpdate(aefeId, { $unset: { signatureUrl: 1 } })
        } else {
            await User.findByIdAndUpdate(aefeId, { $unset: { signatureUrl: 1 } })
        }

        await logAudit({
            userId: aefeId,
            action: 'DELETE_SIGNATURE',
            details: {},
            req,
        })

        res.json({ success: true })
    } catch (e: any) {
        res.status(500).json({ error: 'delete_failed', message: e.message })
    }
})

// AEFE: Get promoted students not yet assigned to a class
aefeTemplatesRouter.get('/promoted-students', requireAuth(['AEFE']), async (req, res) => {
    try {
        const aefeId = (req as any).user.userId
        
        // Get active school year
        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()

        // Find students promoted by this AEFE user
        const students = await Student.find({
            'promotions.promotedBy': aefeId
        }).lean()

        const promotedStudents = []

        for (const student of students) {
            const assignedEnrollment = await Enrollment.findOne({ 
                studentId: student._id, 
                status: 'active',
                classId: { $exists: true, $ne: null }
            }).lean()
            
            if (assignedEnrollment) continue

            const promotions = student.promotions || []
            const lastPromotion = promotions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
            
            if (lastPromotion && lastPromotion.promotedBy === aefeId && String(lastPromotion.schoolYearId) === String(activeSchoolYear?._id)) {
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

// AEFE: Get classes with pending signatures
aefeTemplatesRouter.get('/classes', requireAuth(['AEFE']), async (req, res) => {
    try {
        const aefeId = (req as any).user.userId

        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
        if (!activeSchoolYear) return res.json([])

        const assignments = await SubAdminAssignment.find({ subAdminId: aefeId }).lean()
        const teacherIds = assignments.map(a => a.teacherId)

        const teacherClassAssignments = await TeacherClassAssignment.find({ 
            teacherId: { $in: teacherIds },
            schoolYearId: activeSchoolYear._id
        }).lean()
        let relevantClassIds = [...new Set(teacherClassAssignments.map(a => a.classId))]

        const roleScope = await RoleScope.findOne({ userId: aefeId }).lean()
        if (roleScope?.levels?.length) {
             const levelClasses = await ClassModel.find({ 
                 level: { $in: roleScope.levels },
                 schoolYearId: activeSchoolYear._id
             }).lean()
             const levelClassIds = levelClasses.map(c => String(c._id))
             relevantClassIds = [...new Set([...relevantClassIds, ...levelClassIds])]
        }

        const enrollments = await Enrollment.find({ classId: { $in: relevantClassIds } }).lean()
        const studentIds = enrollments.map(e => e.studentId)

        const templateAssignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            status: { $in: ['draft', 'in_progress', 'completed'] },
        }).lean()
        
        const classIds = [...new Set(enrollments.map(e => e.classId))]
        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()

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

// AEFE: Get assigned teachers
aefeTemplatesRouter.get('/teachers', requireAuth(['AEFE']), async (req, res) => {
    try {
        const aefeId = (req as any).user.userId
        const assignments = await SubAdminAssignment.find({ subAdminId: aefeId }).lean()
        const teacherIds = assignments.map(a => a.teacherId)
        const teachers = await User.find({ _id: { $in: teacherIds } }).lean()

        res.json(teachers)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// AEFE: Get pending signatures (templates awaiting signature)
aefeTemplatesRouter.get('/pending-signatures', requireAuth(['AEFE']), async (req, res) => {
    try {
        const aefeId = (req as any).user.userId

        const activeSchoolYear = await SchoolYear.findOne({ active: true }).lean()
        if (!activeSchoolYear) {
            return res.json([])
        }

        const assignments = await SubAdminAssignment.find({ subAdminId: aefeId }).lean()
        const teacherIds = assignments.map(a => a.teacherId)

        const teacherClassAssignments = await TeacherClassAssignment.find({ 
            teacherId: { $in: teacherIds },
            schoolYearId: activeSchoolYear._id 
        }).lean()
        let classIds = [...new Set(teacherClassAssignments.map(a => a.classId))]

        const roleScope = await RoleScope.findOne({ userId: aefeId }).lean()
        if (roleScope?.levels?.length) {
             const levelClasses = await ClassModel.find({ 
                 level: { $in: roleScope.levels },
                 schoolYearId: activeSchoolYear?._id
             }).lean()
             const levelClassIds = levelClasses.map(c => String(c._id))
             classIds = [...new Set([...classIds, ...levelClassIds])]
        }

        const enrollments = await Enrollment.find({ classId: { $in: classIds } }).lean()
        const studentIds = enrollments.map(e => e.studentId)

        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
        const classMap = new Map(classes.map(c => [String(c._id), c]))
        const studentClassMap = new Map(enrollments.map(e => [String(e.studentId), String(e.classId)]))

        const templateAssignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            status: { $in: ['draft', 'in_progress', 'completed', 'signed'] },
        }).lean()

        const assignmentIds = templateAssignments.map(a => String(a._id))
        const signatures = await TemplateSignature.find({ templateAssignmentId: { $in: assignmentIds } }).lean()
        const signatureMap = new Map(signatures.map(s => [s.templateAssignmentId, s]))

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

        const finalAssignments = enrichedAssignments.filter(a => !a.isPromoted)

        res.json(finalAssignments)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// AEFE: Get template assignment for review (READ-ONLY - no editing allowed)
aefeTemplatesRouter.get('/templates/:templateAssignmentId/review', requireAuth(['AEFE']), async (req, res) => {
    try {
        const aefeId = (req as any).user.userId
        const { templateAssignmentId } = req.params

        const assignment = await TemplateAssignment.findById(templateAssignmentId).lean()
        if (!assignment) return res.status(404).json({ error: 'not_found' })

        const student = await Student.findById(assignment.studentId).lean()

        const enrollments = await Enrollment.find({ studentId: assignment.studentId }).lean()
        
        let authorized = false

        if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
            const aefeAssignments = await SubAdminAssignment.find({
                subAdminId: aefeId,
                teacherId: { $in: assignment.assignedTeachers },
            }).lean()
            
            if (aefeAssignments.length > 0) {
                authorized = true
            }
        }

        if (!authorized && enrollments.length > 0) {
            const classIds = enrollments.map(e => e.classId).filter(Boolean)
            const teacherClassAssignments = await TeacherClassAssignment.find({ classId: { $in: classIds } }).lean()
            const classTeacherIds = teacherClassAssignments.map(ta => ta.teacherId)

            const aefeAssignments = await SubAdminAssignment.find({
                subAdminId: aefeId,
                teacherId: { $in: classTeacherIds },
            }).lean()

            if (aefeAssignments.length > 0) {
                authorized = true
            }

            if (!authorized) {
                const roleScope = await RoleScope.findOne({ userId: aefeId }).lean()
                if (roleScope?.levels?.length) {
                    const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
                    if (classes.some(c => c.level && roleScope.levels.includes(c.level))) {
                        authorized = true
                    }
                }
            }
        }

        if (!authorized && student && student.promotions) {
                const lastPromotion = student.promotions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                if (lastPromotion && lastPromotion.promotedBy === aefeId) {
                    authorized = true
                }
        }

        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const signatures = await TemplateSignature.find({ templateAssignmentId }).lean()
        
        const signature = signatures.find(s => s.type === 'standard' || !s.type)
        const finalSignature = signatures.find(s => s.type === 'end_of_year')
        
        const isSignedByMe = signature && signature.subAdminId === aefeId

        let level = student?.level || ''
        if (student) {
            const enrollment = await Enrollment.findOne({ studentId: assignment.studentId }).lean()
            if (enrollment && enrollment.classId) {
                const classDoc = await ClassModel.findById(enrollment.classId).lean()
                if (classDoc) level = classDoc.level || ''
            }
        }

        const versionedTemplate = JSON.parse(JSON.stringify(template))
        if (assignment.data) {
            for (const [key, value] of Object.entries(assignment.data)) {
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

        // AEFE users cannot edit
        const canEdit = false

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
            canEdit, // Always false for AEFE
            isPromoted,
            activeSemester
        })
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})
