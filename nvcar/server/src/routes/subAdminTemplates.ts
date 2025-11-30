import { Router } from 'express'
import { requireAuth } from '../auth'
import { SubAdminAssignment } from '../models/SubAdminAssignment'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateChangeLog } from '../models/TemplateChangeLog'
import { TemplateSignature } from '../models/TemplateSignature'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { Student } from '../models/Student'
import { User } from '../models/User'
import { Enrollment } from '../models/Enrollment'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { ClassModel } from '../models/Class'
import { RoleScope } from '../models/RoleScope'
import { SchoolYear } from '../models/SchoolYear'
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
        const user = await User.findById(subAdminId).lean()
        
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
        const user = await User.findById(subAdminId).lean()
        if (user?.signatureUrl) {
            const oldPath = path.join(__dirname, '../../public', user.signatureUrl)
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath)
            }
        }

        // Update user with new signature URL
        await User.findByIdAndUpdate(subAdminId, { signatureUrl })

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
        const user = await User.findById(subAdminId).lean()

        if (user?.signatureUrl) {
            const oldPath = path.join(__dirname, '../../public', user.signatureUrl)
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath)
            }
        }

        await User.findByIdAndUpdate(subAdminId, { $unset: { signatureUrl: 1 } })

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

// Sub-admin: Get classes with pending signatures
subAdminTemplatesRouter.get('/classes', requireAuth(['SUBADMIN']), async (req, res) => {
    try {
        const subAdminId = (req as any).user.userId

        // Get teachers assigned to this sub-admin
        const assignments = await SubAdminAssignment.find({ subAdminId }).lean()
        const teacherIds = assignments.map(a => a.teacherId)

        // Get classes assigned to these teachers
        const teacherClassAssignments = await TeacherClassAssignment.find({ teacherId: { $in: teacherIds } }).lean()
        let relevantClassIds = [...new Set(teacherClassAssignments.map(a => a.classId))]

        // Check RoleScope for level assignments
        const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
        if (roleScope?.levels?.length) {
             const levelClasses = await ClassModel.find({ level: { $in: roleScope.levels } }).lean()
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

        // Get teachers assigned to this sub-admin
        const assignments = await SubAdminAssignment.find({ subAdminId }).lean()
        const teacherIds = assignments.map(a => a.teacherId)

        // Get classes assigned to these teachers
        const teacherClassAssignments = await TeacherClassAssignment.find({ teacherId: { $in: teacherIds } }).lean()
        let classIds = [...new Set(teacherClassAssignments.map(a => a.classId))]

        // Check RoleScope for level assignments
        const roleScope = await RoleScope.findOne({ userId: subAdminId }).lean()
        if (roleScope?.levels?.length) {
             const levelClasses = await ClassModel.find({ level: { $in: roleScope.levels } }).lean()
             const levelClassIds = levelClasses.map(c => String(c._id))
             classIds = [...new Set([...classIds, ...levelClassIds])]
        }

        // Get students in these classes
        const enrollments = await Enrollment.find({ classId: { $in: classIds } }).lean()
        const studentIds = enrollments.map(e => e.studentId)

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

            return {
                ...assignment,
                template,
                student,
                signature,
            }
        }))

        res.json(enrichedAssignments)
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
        const enrollment = await Enrollment.findOne({ studentId: assignment.studentId }).lean()
        let yearName = new Date().getFullYear().toString()
        let currentLevel = student.level || ''
        let currentSchoolYearId = ''

        if (enrollment) {
            const cls = await ClassModel.findById(enrollment.classId).lean()
            if (cls) {
                currentLevel = cls.level || ''
                currentSchoolYearId = cls.schoolYearId
                const sy = await SchoolYear.findById(cls.schoolYearId).lean()
                if (sy) yearName = sy.name
            }
            // Remove from class
            await Enrollment.findByIdAndDelete(enrollment._id)
        }

        // Find next school year
        let nextSchoolYearId = ''
        if (currentSchoolYearId) {
             const currentSy = await SchoolYear.findById(currentSchoolYearId).lean()
             if (currentSy) {
                 // Strategy 1: Name matching
                 if (currentSy.name) {
                     const match = currentSy.name.match(/(\d{4})([-/.])(\d{4})/)
                     if (match) {
                         const startYear = parseInt(match[1])
                         const separator = match[2]
                         const endYear = parseInt(match[3])
                         const nextName = `${startYear + 1}${separator}${endYear + 1}`
                         
                         const nextSy = await SchoolYear.findOne({ name: nextName }).lean()
                         if (nextSy) {
                             nextSchoolYearId = String(nextSy._id)
                         }
                     }
                 }
                 
                 // Strategy 2: Date based (if name matching failed)
                 if (!nextSchoolYearId && currentSy.endDate) {
                     // Find a school year that starts after this one ends (within 6 months)
                     const nextSy = await SchoolYear.findOne({
                         startDate: { $gte: currentSy.endDate },
                         active: true
                     }).sort({ startDate: 1 }).lean()
                     
                     if (nextSy) {
                         nextSchoolYearId = String(nextSy._id)
                     }
                 }
             }
        }

        // Update student level
        student.level = nextLevel
        if (nextSchoolYearId) {
            student.schoolYearId = nextSchoolYearId
        }
        await student.save()

        // Record promotion in assignment data
        const promotionData = {
            from: currentLevel,
            to: nextLevel,
            date: new Date(),
            year: yearName
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

        // Verify authorization via class enrollment
        const enrollmentCheck = await Enrollment.findOne({ studentId: assignment.studentId }).lean()
        
        let authorized = false

        if (enrollmentCheck) {
            const teacherClassAssignments = await TeacherClassAssignment.find({ classId: enrollmentCheck.classId }).lean()
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
                    const cls = await ClassModel.findById(enrollmentCheck.classId).lean()
                    if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                        authorized = true
                    }
                }
            }
        } else {
             // If student is not enrolled (e.g. promoted), check if sub-admin is linked to assigned teachers
            if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
                const subAdminAssignments = await SubAdminAssignment.find({
                    subAdminId,
                    teacherId: { $in: assignment.assignedTeachers },
                }).lean()
                
                if (subAdminAssignments.length > 0) {
                    authorized = true
                }
            }
        }

        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        // Check if already signed
        const existing = await TemplateSignature.findOne({ templateAssignmentId }).lean()
        if (existing) {
            return res.status(400).json({ error: 'already_signed' })
        }

        // Create signature
        const signature = await TemplateSignature.create({
            templateAssignmentId,
            subAdminId,
            signedAt: new Date(),
            status: 'signed',
        })

        // Update assignment status
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
        const enrollmentCheck = await Enrollment.findOne({ studentId: assignment.studentId }).lean()
        
        let authorized = false

        if (enrollmentCheck) {
            const teacherClassAssignments = await TeacherClassAssignment.find({ classId: enrollmentCheck.classId }).lean()
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
                    const cls = await ClassModel.findById(enrollmentCheck.classId).lean()
                    if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                        authorized = true
                    }
                }
            }
        } else {
             // If student is not enrolled (e.g. promoted), check if sub-admin is linked to assigned teachers
            if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
                const subAdminAssignments = await SubAdminAssignment.find({
                    subAdminId,
                    teacherId: { $in: assignment.assignedTeachers },
                }).lean()
                
                if (subAdminAssignments.length > 0) {
                    authorized = true
                }
            }
        }

        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        // Check if signed
        const existing = await TemplateSignature.findOne({ templateAssignmentId }).lean()
        if (!existing) {
            return res.status(400).json({ error: 'not_signed' })
        }

        // Delete signature
        await TemplateSignature.deleteOne({ templateAssignmentId })

        // Update assignment status back to completed
        await TemplateAssignment.findByIdAndUpdate(templateAssignmentId, { status: 'completed' })

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

        // Verify authorization via class enrollment
        const enrollmentCheck = await Enrollment.findOne({ studentId: assignment.studentId }).lean()
        
        let authorized = false

        if (enrollmentCheck) {
            const teacherClassAssignments = await TeacherClassAssignment.find({ classId: enrollmentCheck.classId }).lean()
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
                    const cls = await ClassModel.findById(enrollmentCheck.classId).lean()
                    if (cls && cls.level && roleScope.levels.includes(cls.level)) {
                        authorized = true
                    }
                }
            }
        } else {
             // If student is not enrolled (e.g. promoted), check if sub-admin is linked to assigned teachers
            if (assignment.assignedTeachers && assignment.assignedTeachers.length > 0) {
                const subAdminAssignments = await SubAdminAssignment.find({
                    subAdminId,
                    teacherId: { $in: assignment.assignedTeachers },
                }).lean()
                
                if (subAdminAssignments.length > 0) {
                    authorized = true
                }
            }
        }

        if (!authorized) {
            return res.status(403).json({ error: 'not_authorized' })
        }

        // Get template, student, and signature (no change history for sub-admin)
        const template = await GradebookTemplate.findById(assignment.templateId).lean()
        const student = await Student.findById(assignment.studentId).lean()
        const signature = await TemplateSignature.findOne({ templateAssignmentId }).lean()

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
                // Add other data merging patterns here if needed
            }
        }

        res.json({
            assignment,
            template: versionedTemplate,
            student: { ...student, level },
            signature,
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

        // Get all template assignments for these students
        const templateAssignments = await TemplateAssignment.find({
            studentId: { $in: studentIds },
            status: { $in: ['draft', 'in_progress', 'completed'] },
        }).lean()

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
