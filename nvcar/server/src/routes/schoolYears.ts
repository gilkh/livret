import { Router } from 'express'
import { requireAuth } from '../auth'
import { SchoolYear } from '../models/SchoolYear'

export const schoolYearsRouter = Router()

schoolYearsRouter.get('/', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const list = await SchoolYear.find({}).sort({ startDate: -1 }).lean()
  res.json(list)
})

schoolYearsRouter.post('/', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { name, startDate, endDate, active } = req.body
  if (!name || !startDate || !endDate) return res.status(400).json({ error: 'missing_payload' })
  
  if (active) {
    await SchoolYear.updateMany({}, { $set: { active: false } })
  }

  const year = await SchoolYear.create({ name, startDate: new Date(startDate), endDate: new Date(endDate), active: active ?? true })
  res.json(year)
})

schoolYearsRouter.patch('/:id', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { id } = req.params
  const data: any = { ...req.body }
  if (data.startDate) data.startDate = new Date(data.startDate)
  if (data.endDate) data.endDate = new Date(data.endDate)
  
  if (data.active) {
    await SchoolYear.updateMany({ _id: { $ne: id } }, { $set: { active: false } })
  }

  const year = await SchoolYear.findByIdAndUpdate(id, data, { new: true })
  res.json(year)
})

schoolYearsRouter.delete('/:id', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { id } = req.params
  await SchoolYear.findByIdAndDelete(id)
  res.json({ ok: true })
})
