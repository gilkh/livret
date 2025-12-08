import { Router } from 'express'
import { requireAuth } from '../auth'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { ClassModel } from '../models/Class'
import { User } from '../models/User'
import { OutlookUser } from '../models/OutlookUser'
import { Enrollment } from '../models/Enrollment'
import { TemplateAssignment } from '../models/TemplateAssignment'

export const teacherAssignmentsRouter = Router()

// Admin: Assign teacher to class
teacherAssignmentsRouter.post('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { teacherId, classId, languages, isProfPolyvalent } = req.body
        if (!teacherId || !classId) return res.status(400).json({ error: 'missing_payload' })

        // Verify teacher exists and has TEACHER role (check both User and OutlookUser)
        let teacher = await User.findById(teacherId).lean() as any
        if (!teacher) {
            teacher = await OutlookUser.findById(teacherId).lean()
        }

        if (!teacher || teacher.role !== 'TEACHER') {
            return res.status(400).json({ error: 'invalid_teacher' })
        }

        // Verify class exists and get school year
        const classDoc = await ClassModel.findById(classId).lean()
        if (!classDoc) return res.status(404).json({ error: 'class_not_found' })

        // Create or update assignment
        const assignment = await TeacherClassAssignment.findOneAndUpdate(
            { teacherId, classId },
            {
                teacherId,
                classId,
                schoolYearId: classDoc.schoolYearId,
                languages: languages || [],
                isProfPolyvalent: !!isProfPolyvalent,
                assignedBy: (req as any).user.userId,
                assignedAt: new Date(),
            },
            { upsert: true, new: true }
        )

        // Update existing template assignments for students in this class
        // Find all active enrollments for this class
        const enrollments = await Enrollment.find({ 
            classId, 
            schoolYearId: classDoc.schoolYearId,
            status: 'active' 
        }).select('studentId').lean()

        if (enrollments.length > 0) {
            const studentIds = enrollments.map(e => e.studentId)
            
            // Add teacher to assignedTeachers for active templates
            await TemplateAssignment.updateMany(
                { 
                    studentId: { $in: studentIds }, 
                    status: { $in: ['draft', 'in_progress', 'completed', 'signed'] } 
                },
                { $addToSet: { assignedTeachers: teacherId } }
            )
        }

        res.json(assignment)
    } catch (e: any) {
        res.status(500).json({ error: 'create_failed', message: e.message })
    }
})

// Admin/SubAdmin: Get classes for a teacher
teacherAssignmentsRouter.get('/teacher/:teacherId', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
    try {
        const { teacherId } = req.params
        const assignments = await TeacherClassAssignment.find({ teacherId }).lean()
        const classIds = assignments.map(a => a.classId)
        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()

        res.json(classes)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Admin: Delete assignment
teacherAssignmentsRouter.delete('/:id', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params
        const assignment = await TeacherClassAssignment.findById(id).lean()
        
        if (assignment) {
            await TeacherClassAssignment.findByIdAndDelete(id)

            // Remove teacher from template assignments for students in this class
            const enrollments = await Enrollment.find({ 
                classId: assignment.classId, 
                schoolYearId: assignment.schoolYearId,
                status: 'active' 
            }).select('studentId').lean()

            if (enrollments.length > 0) {
                const studentIds = enrollments.map(e => e.studentId)
                
                // Remove teacher from assignedTeachers for active templates
                await TemplateAssignment.updateMany(
                    { 
                        studentId: { $in: studentIds }, 
                        status: { $in: ['draft', 'in_progress', 'completed', 'signed'] } 
                    },
                    { $pull: { assignedTeachers: assignment.teacherId } }
                )
            }
        }
        
        res.json({ ok: true })
    } catch (e: any) {
        res.status(500).json({ error: 'delete_failed', message: e.message })
    }
})

// Admin: Get all assignments
teacherAssignmentsRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const filter: any = {}
        if (req.query.schoolYearId) {
            filter.schoolYearId = req.query.schoolYearId
        }
        const assignments = await TeacherClassAssignment.find(filter).lean()
        const teacherIds = assignments.map(a => a.teacherId)
        const classIds = assignments.map(a => a.classId)
        
        const [teachers, outlookTeachers, classes] = await Promise.all([
            User.find({ _id: { $in: teacherIds } }).lean(),
            OutlookUser.find({ _id: { $in: teacherIds } }).lean(),
            ClassModel.find({ _id: { $in: classIds } }).lean()
        ])
        
        const allTeachers = [...teachers, ...outlookTeachers] as any[]

        const result = assignments.map(a => {
            const teacher = allTeachers.find(t => String(t._id) === a.teacherId)
            const classDoc = classes.find(c => String(c._id) === a.classId)
            return {
                ...a,
                teacherName: teacher ? (teacher.displayName || teacher.email) : 'Unknown',
                className: classDoc ? classDoc.name : 'Unknown'
            }
        })
        res.json(result)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})

// Admin: Import assignments from previous year
teacherAssignmentsRouter.post('/import', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { sourceAssignments, targetYearId } = req.body
        
        if (!sourceAssignments || !Array.isArray(sourceAssignments) || !targetYearId) {
            return res.status(400).json({ error: 'missing_payload' })
        }

        // Get all classes for target year to lookup by name
        const targetClasses = await ClassModel.find({ schoolYearId: targetYearId }).lean()
        const classMap = new Map(targetClasses.map(c => [c.name, String(c._id)]))

        let importedCount = 0
        const errors = []

        for (const assignment of sourceAssignments) {
            // Skip if no class name provided
            if (!assignment.className) continue

            const targetClassId = classMap.get(assignment.className)
            if (!targetClassId) {
                errors.push(`Classe '${assignment.className}' introuvable dans l'année sélectionnée`)
                continue
            }
            
            // Create assignment
            try {
                await TeacherClassAssignment.findOneAndUpdate(
                    { teacherId: assignment.teacherId, classId: targetClassId },
                    {
                        teacherId: assignment.teacherId,
                        classId: targetClassId,
                        schoolYearId: targetYearId,
                        languages: assignment.languages || [],
                        isProfPolyvalent: !!assignment.isProfPolyvalent,
                        assignedBy: (req as any).user.userId,
                        assignedAt: new Date(),
                    },
                    { upsert: true, new: true }
                )
                importedCount++
            } catch (err) {
                console.error('Error importing assignment', err)
            }
        }
        
        res.json({ importedCount, errors })
    } catch (e: any) {
        res.status(500).json({ error: 'import_failed', message: e.message })
    }
})
