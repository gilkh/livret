import { Router } from 'express'
import { requireAuth } from '../auth'
import { SubAdminAssignment } from '../models/SubAdminAssignment'
import { User } from '../models/User'

export const subAdminAssignmentsRouter = Router()

// Admin: Assign teachers to sub-admin
subAdminAssignmentsRouter.post('/', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { subAdminId, teacherId } = req.body
        if (!subAdminId || !teacherId) return res.status(400).json({ error: 'missing_payload' })

        // Verify sub-admin exists and has SUBADMIN role
        const subAdmin = await User.findById(subAdminId).lean()
        if (!subAdmin || subAdmin.role !== 'SUBADMIN') {
            return res.status(400).json({ error: 'invalid_subadmin' })
        }

        // Verify teacher exists and has TEACHER role
        const teacher = await User.findById(teacherId).lean()
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
        const teachers = await User.find({ _id: { $in: teacherIds } }).lean()

        res.json(teachers)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
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
        const users = await User.find({ _id: { $in: allUserIds } }).lean()
        
        const result = assignments.map(a => {
            const subAdmin = users.find(u => String(u._id) === a.subAdminId)
            const teacher = users.find(u => String(u._id) === a.teacherId)
            return {
                ...a,
                subAdminName: subAdmin ? subAdmin.displayName : 'Unknown',
                teacherName: teacher ? teacher.displayName : 'Unknown'
            }
        })
        res.json(result)
    } catch (e: any) {
        res.status(500).json({ error: 'fetch_failed', message: e.message })
    }
})
