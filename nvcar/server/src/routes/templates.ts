import { Router } from 'express'
import { requireAuth } from '../auth'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { TemplateAssignment } from '../models/TemplateAssignment'
import multer from 'multer'
import path from 'path'
import archiver from 'archiver'
import JSZip from 'jszip'
import { PptxImporter } from '../utils/pptxImporter'
import { ensureStableBlockIds, ensureStableExpandedTableRowIds } from '../utils/templateUtils'
import { withCache, clearCache } from '../utils/cache'

import fs from 'fs'

export const templatesRouter = Router()
const upload = multer({ storage: multer.memoryStorage() })

templatesRouter.get('/', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
  const list = await withCache('templates-all', () =>
    GradebookTemplate.find({}).lean()
  )
  res.json(list)
})

templatesRouter.post('/import-pptx', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'missing_file' })

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'media')
    // Pass empty baseUrl to generate relative paths (/uploads/media/...)
    const importer = new PptxImporter(uploadDir, '')
    const templateData = await importer.parse(req.file.buffer)
    const pagesWithBlockIds = ensureStableBlockIds(undefined, (templateData as any)?.pages)
    const pagesWithRowIds = ensureStableExpandedTableRowIds(undefined, pagesWithBlockIds)

    // Create the template in DB
    const tpl = await GradebookTemplate.create({
      ...templateData,
      pages: pagesWithRowIds,
      createdBy: (req as any).user.userId,
      updatedAt: new Date(),
      status: 'draft',
      currentVersion: 1,
      versionHistory: [{
        version: 1,
        pages: pagesWithRowIds,
        variables: (templateData as any)?.variables || {},
        watermark: (templateData as any)?.watermark,
        createdAt: new Date(),
        createdBy: (req as any).user.userId,
        changeDescription: 'Initial version'
      }]
    })

    clearCache('templates')
    res.json(tpl)
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ error: 'import_failed', message: e.message })
  }
})

templatesRouter.post('/import-package', requireAuth(['ADMIN', 'SUBADMIN']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'missing_file' })

    let jsonContent = ''

    // Check if zip
    if (req.file.mimetype === 'application/zip' || req.file.originalname.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(req.file.buffer)
      const file = zip.file('template.json')
      if (!file) return res.status(400).json({ error: 'invalid_zip_no_template_json' })
      jsonContent = await file.async('string')
    } else {
      jsonContent = req.file.buffer.toString('utf8')
    }

    let templateData
    try {
      templateData = JSON.parse(jsonContent)
    } catch (e) {
      return res.status(400).json({ error: 'invalid_json' })
    }

    const userId = (req as any).user.userId

    // Remove system fields
    const { _id, __v, createdBy, createdAt, updatedAt, ...cleanData } = templateData
    const pagesWithBlockIds = ensureStableBlockIds(undefined, (cleanData as any)?.pages)
    const pagesWithRowIds = ensureStableExpandedTableRowIds(undefined, pagesWithBlockIds)

    const newTemplate = await GradebookTemplate.create({
      ...cleanData,
      name: `${cleanData.name} (Imported)`,
      pages: pagesWithRowIds,
      createdBy: userId,
      updatedAt: new Date(),
      createdAt: new Date(),
      status: 'draft',
      currentVersion: 1,
      versionHistory: [{
        version: 1,
        pages: pagesWithRowIds,
        variables: cleanData.variables || {},
        watermark: cleanData.watermark,
        createdAt: new Date(),
        createdBy: userId,
        changeDescription: 'Imported from package'
      }]
    })

    clearCache('templates')
    res.json(newTemplate)
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
    const pagesWithBlockIds = ensureStableBlockIds(undefined, Array.isArray(pages) ? pages : [])
    const pagesWithRowIds = ensureStableExpandedTableRowIds(undefined, pagesWithBlockIds)

    const templateData = {
      name,
      pages: pagesWithRowIds,
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
        pages: pagesWithRowIds,
        variables: variables || {},
        watermark,
        createdAt: new Date(),
        createdBy: userId,
        changeDescription: 'Initial version'
      }]
    }

    const tpl = await GradebookTemplate.create(templateData)
    clearCache('templates')
    res.json(tpl)
  } catch (e: any) {
    res.status(500).json({ error: 'create_failed', message: e.message })
  }
})

templatesRouter.get('/:id/export-package', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  try {
    const { id } = req.params
    const template = await GradebookTemplate.findById(id).lean()
    if (!template) return res.status(404).json({ error: 'not_found' })

    // Clean data
    const { _id, __v, createdBy, updatedAt, ...cleanTemplate } = template

    // Create archive
    const archive = archiver('zip', { zlib: { level: 9 } })

    // Determine target directory: .../nvcar/temps
    // process.cwd() is .../nvcar/server
    // So ../temps is .../nvcar/temps
    const targetDir = path.join(process.cwd(), '../temps')
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const fileName = `${template.name.replace(/[^a-z0-9]/gi, '_')}_export.zip`
    const filePath = path.join(targetDir, fileName)

    // Check if file exists
    let existed = false
    if (fs.existsSync(filePath)) {
      existed = true
    }

    const output = fs.createWriteStream(filePath)

    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve())
      output.on('error', reject)
      archive.on('error', reject)

      archive.pipe(output)

      // Add template JSON
      archive.append(JSON.stringify(cleanTemplate, null, 2), { name: 'template.json' })

      // Add batch file
      const batContent = `@echo off
set /p targetUrl="Enter the target server URL (default: https://localhost:4000): "
if "%targetUrl%"=="" set targetUrl=https://localhost:4000

echo.
echo Please ensure you are logged in on the target server or have an authentication token.
echo This script assumes you can access the API.
echo.
echo Importing template to %targetUrl%...
echo.
echo Note: This batch script attempts to upload 'template.json'.
echo If this fails due to authentication, please use the "Import Template" button in the Admin UI.
echo.

curl -k -X POST -F "file=@template.json" "%targetUrl%/templates/import-package"

echo.
echo Done.
pause
`
      archive.append(batContent, { name: 'import_template.bat' })

      archive.finalize()
    })

    res.json({ success: true, path: filePath, fileName, existed })

  } catch (e: any) {
    console.error('Export error:', e)
    res.status(500).json({ error: 'export_failed', message: e.message })
  }
})

templatesRouter.get('/:id', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
  const { id } = req.params
  const tpl = await withCache(`template-${id}`, () =>
    GradebookTemplate.findById(id).lean()
  )
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

    const previousPages = Array.isArray((currentTemplate as any).pages) ? (currentTemplate as any).pages : []
    const hasIncomingPages = Object.prototype.hasOwnProperty.call(rest, 'pages')
    const incomingPages = hasIncomingPages ? (Array.isArray((rest as any).pages) ? (rest as any).pages : []) : undefined
    const pagesWithBlockIds = hasIncomingPages ? ensureStableBlockIds(previousPages, incomingPages) : undefined
    const pagesWithRowIds = hasIncomingPages ? ensureStableExpandedTableRowIds(previousPages, pagesWithBlockIds) : undefined

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
        pages: hasIncomingPages ? pagesWithRowIds : currentTemplate.pages,
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
    if (hasIncomingPages) data.pages = pagesWithRowIds
    if (hasActiveAssignments && hasSignificantChange) {
      data.versionHistory = currentTemplate.versionHistory
      data.currentVersion = currentTemplate.currentVersion
    }

    const tpl = await GradebookTemplate.findByIdAndUpdate(id, data, { new: true })

    // Update existing assignments to use the new version so changes propagate immediately
    if (hasActiveAssignments && hasSignificantChange && tpl) {
      await TemplateAssignment.updateMany(
        { templateId: id },
        { $set: { templateVersion: tpl.currentVersion } }
      )
    }

    clearCache('templates')
    res.json(tpl)
  } catch (e: any) {
    res.status(500).json({ error: 'update_failed', message: e.message })
  }
})

templatesRouter.delete('/:id', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { id } = req.params
  clearCache('templates')
  await GradebookTemplate.findByIdAndDelete(id)
  res.json({ ok: true })
})
