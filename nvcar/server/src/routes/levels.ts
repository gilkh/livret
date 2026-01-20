import { Router } from 'express'
import { Level } from '../models/Level'
import { requireAuth } from '../auth'

export const levelsRouter = Router()

levelsRouter.get('/', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
  // By default, exclude exit levels (like EB1) from the list
  // Use ?includeExit=true to include them
  const includeExit = req.query.includeExit === 'true'
  const query = includeExit ? {} : { isExitLevel: { $ne: true } }
  const levels = await Level.find(query).sort({ order: 1 }).lean()
  res.json(levels)
})
