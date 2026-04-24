import { Router } from 'express'
import { requireAuth } from '../auth'
import { EmailTemplate } from '../models/EmailTemplate'

export const emailTemplatesRouter = Router()

emailTemplatesRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const templates = await EmailTemplate.find().sort({ createdAt: -1 })
    res.json(templates)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

emailTemplatesRouter.post('/', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const template = new EmailTemplate(req.body)
    await template.save()
    res.status(201).json(template)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

emailTemplatesRouter.put('/:id', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const template = await EmailTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!template) return res.status(404).json({ error: 'Not found' })
    res.json(template)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

emailTemplatesRouter.delete('/:id', requireAuth(['ADMIN']), async (req, res) => {
  try {
    await EmailTemplate.findByIdAndDelete(req.params.id)
    res.json({ success: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})
