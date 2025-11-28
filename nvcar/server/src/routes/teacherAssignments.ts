import { Router } from 'express'
import { requireAuth } from '../auth'
import { TeacherClassAssignment } from '../models/TeacherClassAssignment'
import { ClassModel } from '../models/Class'
import { User } from '../models/User'

export const teacherAssignmentsRouter = Router()

// Admin: Assign teacher to class
teacherAssignmentsRouter.post('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { teacherId, classId } = req.body
        if (!teacherId || !classId) return res.status(400).json({ error: 'missing_payload' })

        // Verify teacher exists and has TEACHER role
        const teacher = await User.findById(teacherId).lean()
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
        await TeacherClassAssignment.findByIdAndDelete(id)
        res.json({ ok: true })
    } catch (e: any) {
        res.status(500).json({ error: 'delete_failed', message: e.message })
    }
})

// Admin: Get all assignments
teacherAssignmentsRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const assignments = await TeacherClassAssignment.find({}).lean()
        const teacherIds = assignments.map(a => a.teacherId)
        const classIds = assignments.map(a => a.classId)
        const teachers = await User.find({ _id: { $in: teacherIds } }).lean()
        const classes = await ClassModel.find({ _id: { $in: classIds } }).lean()
        
        const result = assignments.map(a => {
            const teacher = teachers.find(t => String(t._id) === a.teacherId)
            const classDoc = classes.find(c => String(c._id) === a.classId)
            return {
                ...a,
                teacherName: teacher ? teacher.displayName : 'Unknown',
                className: classDoc ? classDoc.name : 'Unknown'
            }
        })
        res.json(result)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})
