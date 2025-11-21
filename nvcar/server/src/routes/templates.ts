import { Router } from 'express'
import { requireAuth } from '../auth'
import { GradebookTemplate } from '../models/GradebookTemplate'

export const templatesRouter = Router()

templatesRouter.get('/', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const list = await GradebookTemplate.find({}).lean()
  res.json(list)
})

templatesRouter.post('/', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  try {
    const { name, pages, variables, watermark, permissions, status, exportPassword } = req.body || {}
    if (!name) return res.status(400).json({ error: 'missing_name' })
    const tpl = await GradebookTemplate.create({ name, pages: Array.isArray(pages) ? pages : [], variables: variables || {}, watermark, permissions, status: status || 'draft', exportPassword, createdBy: (req as any).user.userId, updatedAt: new Date() })
    res.json(tpl)
  } catch (e: any) {
    res.status(500).json({ error: 'create_failed', message: e.message })
  }
})

templatesRouter.patch('/:id', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  try {
    const { id } = req.params
    const { _id, __v, createdBy, updatedAt, shareId, versions, comments, ...rest } = req.body || {}
    const data: any = { ...rest, updatedAt: new Date() }
    if (rest.pages && !Array.isArray(rest.pages)) data.pages = []
    const tpl = await GradebookTemplate.findByIdAndUpdate(id, data, { new: true })
    res.json(tpl)
  } catch (e: any) {
    res.status(500).json({ error: 'update_failed', message: e.message })
  }
})

templatesRouter.delete('/:id', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { id } = req.params
  await GradebookTemplate.findByIdAndDelete(id)
  res.json({ ok: true })
})
