import { Router } from 'express'
import { requireAuth } from '../auth'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { TemplateAssignment } from '../models/TemplateAssignment'
import multer from 'multer'
import path from 'path'
import { PptxImporter } from '../utils/pptxImporter'

export const templatesRouter = Router()
const upload = multer({ storage: multer.memoryStorage() })

templatesRouter.get('/', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
  const list = await GradebookTemplate.find({}).lean()
  res.json(list)
})

templatesRouter.post('/import-pptx', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'missing_file' })

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'media')
    const baseUrl = process.env.API_URL || 'http://localhost:4000'
    const importer = new PptxImporter(uploadDir, baseUrl)
    const templateData = await importer.parse(req.file.buffer)

    // Create the template in DB
    const tpl = await GradebookTemplate.create({
      ...templateData,
      createdBy: (req as any).user.userId,
      updatedAt: new Date(),
      status: 'draft'
    })

    res.json(tpl)
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ error: 'import_failed', message: e.message })
  }
})

templatesRouter.post('/', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  try {
    const { name, pages, variables, watermark, permissions, status, exportPassword } = req.body || {}
    if (!name) return res.status(400).json({ error: 'missing_name' })
    const userId = (req as any).user.actualUserId || (req as any).user.userId
    
    const templateData = { 
      name, 
      pages: Array.isArray(pages) ? pages : [], 
      variables: variables || {}, 
      watermark, 
      permissions, 
      status: status || 'draft', 
      exportPassword, 
      createdBy: userId, 
      updatedAt: new Date(),
      currentVersion: 1,
      versionHistory: [{
        version: 1,
        pages: Array.isArray(pages) ? pages : [],
        variables: variables || {},
        watermark,
        createdAt: new Date(),
        createdBy: userId,
        changeDescription: 'Initial version'
      }]
    }
    
    const tpl = await GradebookTemplate.create(templateData)
    res.json(tpl)
  } catch (e: any) {
    res.status(500).json({ error: 'create_failed', message: e.message })
  }
})

templatesRouter.get('/:id', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
  const { id } = req.params
  const tpl = await GradebookTemplate.findById(id).lean()
  if (!tpl) return res.status(404).json({ error: 'not_found' })
  res.json(tpl)
})

templatesRouter.patch('/:id', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  try {
    const { id } = req.params
    const { _id, __v, createdBy, updatedAt, shareId, versions, comments, versionHistory, currentVersion, changeDescription, ...rest } = req.body || {}
    const userId = (req as any).user.actualUserId || (req as any).user.userId
    
    // Get the current template
    const currentTemplate = await GradebookTemplate.findById(id)
    if (!currentTemplate) return res.status(404).json({ error: 'template_not_found' })
    
    // Check if this is a significant change (pages, variables, or watermark changed)
    const hasSignificantChange = rest.pages || rest.variables !== undefined || rest.watermark !== undefined
    
    // Check if there are existing assignments using this template
    const existingAssignments = await TemplateAssignment.find({ templateId: id }).lean()
    const hasActiveAssignments = existingAssignments.length > 0
    
    // If there are active assignments and significant changes, create a new version
    if (hasActiveAssignments && hasSignificantChange) {
      const newVersion = (currentTemplate.currentVersion || 1) + 1
      
      // Add current state to version history
      const newHistoryEntry = {
        version: newVersion,
        pages: rest.pages || currentTemplate.pages,
        variables: rest.variables !== undefined ? rest.variables : currentTemplate.variables,
        watermark: rest.watermark !== undefined ? rest.watermark : currentTemplate.watermark,
        createdAt: new Date(),
        createdBy: userId,
        changeDescription: changeDescription || `Version ${newVersion}`
      }
      
      currentTemplate.versionHistory.push(newHistoryEntry)
      currentTemplate.currentVersion = newVersion
    }
    
    // Update the template
    const data: any = { ...rest, updatedAt: new Date() }
    if (rest.pages && !Array.isArray(rest.pages)) data.pages = []
    if (hasActiveAssignments && hasSignificantChange) {
      data.versionHistory = currentTemplate.versionHistory
      data.currentVersion = currentTemplate.currentVersion
    }
    
    const tpl = await GradebookTemplate.findByIdAndUpdate(id, data, { new: true })
    res.json(tpl)
  } catch (e: any) {
    res.status(500).json({ error: 'update_failed', message: e.message })
  }
})

templatesRouter.delete('/:id', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  await GradebookTemplate.findByIdAndDelete(id)
  res.json({ ok: true })
})
