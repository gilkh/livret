import { Router } from 'express'
import { User } from '../models/User'
import { ClassModel } from '../models/Class'
import { Student } from '../models/Student'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { AuditLog } from '../models/AuditLog'

export const analyticsRouter = Router()

analyticsRouter.get('/', async (req, res) => {
  try {
    const [
      totalUsers,
      usersByRole,
      totalClasses,
      totalStudents,
      assignmentsByStatus,
      recentActivity
    ] = await Promise.all([
      User.countDocuments(),
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      ClassModel.countDocuments(),
      Student.countDocuments(),
      TemplateAssignment.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      AuditLog.find().sort({ timestamp: -1 }).limit(10)
    ])

    res.json({
      counts: {
        users: totalUsers,
        classes: totalClasses,
        students: totalStudents,
      },
      distribution: {
        usersByRole: usersByRole.reduce((acc: any, curr: { _id: string, count: number }) => ({ ...acc, [curr._id]: curr.count }), {}),
        assignmentsByStatus: assignmentsByStatus.reduce((acc: any, curr: { _id: string, count: number }) => ({ ...acc, [curr._id]: curr.count }), {})
      },
      recentActivity
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})
