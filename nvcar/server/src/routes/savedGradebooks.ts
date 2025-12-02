import { Router } from 'express'
import { SavedGradebook } from '../models/SavedGradebook'
import { SchoolYear } from '../models/SchoolYear'
import { requireAuth } from '../auth'

export const savedGradebooksRouter = Router()

// List years
savedGradebooksRouter.get('/years', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const yearIds = await SavedGradebook.distinct('schoolYearId')
    const years = await SchoolYear.find({ _id: { $in: yearIds } })
        .select('name')
        .sort({ name: -1 })
        .lean()
    res.json(years)
})

// List levels for a year
savedGradebooksRouter.get('/years/:yearId/levels', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { yearId } = req.params
    const levels = await SavedGradebook.distinct('level', { schoolYearId: yearId })
    // Normalize empty levels to 'Sans niveau' and deduplicate
    const normalizedLevels = Array.from(new Set(levels.map(l => l || 'Sans niveau')))
    res.json(normalizedLevels.sort())
})

// List students for a year and level
savedGradebooksRouter.get('/years/:yearId/levels/:level/students', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
    const { yearId, level } = req.params
    
    // Handle 'Sans niveau' mapping to empty string or 'Sans niveau'
    const levelQuery = level === 'Sans niveau' ? { $in: ['', 'Sans niveau'] } : level

    const students = await SavedGradebook.find({ schoolYearId: yearId, level: levelQuery })
        .select('studentId data.student.firstName data.student.lastName createdAt')
        .lean()
    
    // Map to a simpler structure
    const result = students.map(s => ({
        _id: s._id,
        studentId: s.studentId,
        firstName: s.data.student.firstName,
        lastName: s.data.student.lastName,
        createdAt: s.createdAt
    }))
    res.json(result)
})

// Get a specific saved gradebook
savedGradebooksRouter.get('/:id', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
    const { id } = req.params
    const saved = await SavedGradebook.findById(id).lean()
    if (!saved) return res.status(404).json({ error: 'not_found' })
    res.json(saved)
})
