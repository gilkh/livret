import { Router } from 'express'
import { requireAuth } from '../auth'
import { StudentSignature } from '../models/StudentSignature'

export const signaturesRouter = Router()

signaturesRouter.get('/:studentId', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const { studentId } = req.params
  const s = await StudentSignature.findOne({ studentId }).lean()
  res.json(s || { studentId, items: [] })
})

signaturesRouter.post('/:studentId', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const { studentId } = req.params
  const { items } = req.body
  const updated = await StudentSignature.findOneAndUpdate(
    { studentId },
    { items, updatedAt: new Date() },
    { upsert: true, new: true }
  )
  res.json(updated)
})
