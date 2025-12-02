import { Router } from 'express'
import { Level } from '../models/Level'
import { requireAuth } from '../auth'

export const levelsRouter = Router()

levelsRouter.get('/', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  const levels = await Level.find({}).sort({ order: 1 }).lean()
  res.json(levels)
})
