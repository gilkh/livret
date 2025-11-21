import { Router } from 'express'
import { requireAuth } from '../auth'
import { ClassModel } from '../models/Class'

export const classesRouter = Router()

classesRouter.get('/', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { schoolYearId } = req.query as any
  const list = await ClassModel.find(schoolYearId ? { schoolYearId } : {}).lean()
  res.json(list)
})

classesRouter.post('/', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { name, level, schoolYearId } = req.body
  if (!name || !schoolYearId) return res.status(400).json({ error: 'missing_payload' })
  const c = await ClassModel.create({ name, level, schoolYearId })
  res.json(c)
})

classesRouter.patch('/:id', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const c = await ClassModel.findByIdAndUpdate(id, req.body, { new: true })
  res.json(c)
})

classesRouter.delete('/:id', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { id } = req.params
  await ClassModel.findByIdAndDelete(id)
  res.json({ ok: true })
})
