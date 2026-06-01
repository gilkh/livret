import { Router } from 'express'
import { requireAuth } from '../auth'
import { EmailTemplate } from '../models/EmailTemplate'
import { User } from '../models/User'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import archiver from 'archiver'
import JSZip from 'jszip'
import {
  collectTemplateUploadUrls,
  normalizeTemplateUploadUrls,
  uploadUrlToAbsoluteFilePath,
  zipEntryToUploadAbsolutePath,
  ensureTempDir,
} from '../utils/zipHelpers'

export const emailTemplatesRouter = Router()
const upload = multer({ storage: multer.memoryStorage() })

// Resolve conflicts: unlink overlapping levels/classes from other templates for the same year
async function resolveConflicts(
  schoolYearId: string,
  linkedLevels: string[],
  linkedClasses: string[],
  excludeId?: string
) {
  if (!schoolYearId) return
  if ((!linkedLevels || linkedLevels.length === 0) && (!linkedClasses || linkedClasses.length === 0)) return

  const query: any = {
    $or: [
      { schoolYearId },
    ],
  }
  if (excludeId) {
    query._id = { $ne: excludeId }
  }

  const orConditions: any[] = []
  if (linkedLevels.length > 0) {
    orConditions.push({ linkedLevels: { $in: linkedLevels } })
  }
  if (linkedClasses.length > 0) {
    orConditions.push({ linkedClasses: { $in: linkedClasses } })
  }
  if (orConditions.length === 0) return

  query.$and = [{ $or: [{ schoolYearId }] }, { $or: orConditions }]
  delete query.$or

  const conflicts = await EmailTemplate.find(query)
  for (const other of conflicts) {
    const levelsToPull = (linkedLevels || []).filter(l => other.linkedLevels.includes(l))
    const classesToPull = (linkedClasses || []).filter(c => other.linkedClasses.includes(c))
    if (levelsToPull.length > 0 || classesToPull.length > 0) {
      const update: any = {}
      if (levelsToPull.length > 0) update.$pull = { ...update.$pull, linkedLevels: { $in: levelsToPull } }
      if (classesToPull.length > 0) update.$pull = { ...update.$pull, linkedClasses: { $in: classesToPull } }
      await EmailTemplate.findByIdAndUpdate(other._id, update)
    }
  }
}

// GET / - List templates with optional year filter
emailTemplatesRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { schoolYearId } = req.query
    let query: any = {}
    if (schoolYearId && typeof schoolYearId === 'string') {
      query = {
        $or: [
          { schoolYearId },
          { schoolYearId: '' },
          { schoolYearId: { $exists: false } },
        ]
      }
    }
    const templates = await EmailTemplate.find(query).sort({ createdAt: -1 })
    res.json(templates)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /import - Import template from ZIP (must be before /:id routes)
emailTemplatesRouter.post('/import', requireAuth(['ADMIN']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'missing_file' })

    let jsonContent = ''
    let zip: JSZip | null = null

    if (req.file.mimetype === 'application/zip' || req.file.mimetype === 'application/x-zip-compressed' || req.file.originalname.endsWith('.zip')) {
      zip = await JSZip.loadAsync(req.file.buffer)
      const file = zip.file('template.json')
      if (!file) return res.status(400).json({ error: 'invalid_zip_no_template_json' })
      jsonContent = await file.async('string')
    } else {
      jsonContent = req.file.buffer.toString('utf8')
    }

    let templateData: any
    try {
      templateData = JSON.parse(jsonContent)
      templateData = normalizeTemplateUploadUrls(templateData)
    } catch (e) {
      return res.status(400).json({ error: 'invalid_json' })
    }

    // Restore bundled uploads from ZIP
    if (zip) {
      const zipEntries = Object.keys(zip.files)
      for (const entryName of zipEntries) {
        const entry = zip.files[entryName]
        if (!entry || entry.dir) continue
        const targetPath = zipEntryToUploadAbsolutePath(entryName)
        if (!targetPath) continue
        const content = await entry.async('nodebuffer')
        fs.mkdirSync(path.dirname(targetPath), { recursive: true })
        fs.writeFileSync(targetPath, content)
      }
    }

    // Clean imported data
    const { _id, __v, createdAt, updatedAt, schoolYearId, ...cleanData } = templateData

    const newTemplate = await EmailTemplate.create({
      ...cleanData,
      name: `${cleanData.name || 'Imported'} (Imported)`,
      linkedLevels: [],
      linkedClasses: [],
      schoolYearId: '',
    })

    res.status(201).json(newTemplate)
  } catch (e: any) {
    console.error('Import email template error:', e)
    res.status(500).json({ error: 'import_failed', message: e.message })
  }
})

// POST /import-server/:fileName - Import template from server exports folder
emailTemplatesRouter.post('/import-server/:fileName', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { fileName } = req.params
    if (fileName.includes('..')) return res.status(400).json({ error: 'invalid_filename' })

    const targetDir = ensureTempDir('email-templates')
    const filePath = path.join(targetDir, fileName)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not_found' })

    const fileBuffer = fs.readFileSync(filePath)
    const zip = await JSZip.loadAsync(fileBuffer)
    const templateJsonFile = zip.file('template.json')
    if (!templateJsonFile) return res.status(400).json({ error: 'invalid_zip_no_template_json' })

    const jsonContent = await templateJsonFile.async('string')
    let templateData: any
    try {
      templateData = JSON.parse(jsonContent)
      templateData = normalizeTemplateUploadUrls(templateData)
    } catch (e) {
      return res.status(400).json({ error: 'invalid_json' })
    }

    // Restore bundled uploads from ZIP
    const zipEntries = Object.keys(zip.files)
    for (const entryName of zipEntries) {
      const entry = zip.files[entryName]
      if (!entry || entry.dir) continue
      const targetPath = zipEntryToUploadAbsolutePath(entryName)
      if (!targetPath) continue
      const content = await entry.async('nodebuffer')
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      fs.writeFileSync(targetPath, content)
    }

    // Clean imported data
    const { _id, __v, createdAt, updatedAt, schoolYearId, ...cleanData } = templateData

    const newTemplate = await EmailTemplate.create({
      ...cleanData,
      name: `${cleanData.name || 'Imported'} (Imported)`,
      linkedLevels: [],
      linkedClasses: [],
      schoolYearId: '',
    })

    res.status(201).json(newTemplate)
  } catch (e: any) {
    console.error('Import email template from server error:', e)
    res.status(500).json({ error: 'import_failed', message: e.message })
  }
})

// GET /conflicts - Check which templates claim levels/classes for a year
emailTemplatesRouter.get('/conflicts', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { schoolYearId } = req.query
    if (!schoolYearId) return res.json([])

    const templates = await EmailTemplate.find({
      $and: [
        { $or: [{ schoolYearId }, { schoolYearId: '' }, { schoolYearId: { $exists: false } }] },
        { $or: [{ linkedLevels: { $ne: [] } }, { linkedClasses: { $ne: [] } }] },
      ]
    }).select('_id name linkedLevels linkedClasses schoolYearId')

    res.json(templates)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /exports - List saved export ZIPs
emailTemplatesRouter.get('/exports', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const targetDir = ensureTempDir('email-templates')
    const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.zip'))
    const list = files.map(f => {
      const p = path.join(targetDir, f)
      const stat = fs.statSync(p)

      let metadata: any = {}
      try {
        const metaPath = p + '.json'
        if (fs.existsSync(metaPath)) {
          metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        }
      } catch (e) { /* ignore */ }

      return { fileName: f, size: stat.size, mtime: stat.mtime.toISOString(), ...metadata }
    }).sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
    res.json(list)
  } catch (e: any) {
    console.error('List email template exports error:', e)
    res.status(500).json({ error: 'list_exports_failed', message: e.message })
  }
})

// GET /exports/:fileName - Download an exported ZIP
emailTemplatesRouter.get('/exports/:fileName', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { fileName } = req.params
    if (fileName.includes('..')) return res.status(400).json({ error: 'invalid_filename' })
    const targetDir = ensureTempDir('email-templates')
    const filePath = path.join(targetDir, fileName)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not_found' })
    res.download(filePath, fileName)
  } catch (e: any) {
    console.error('Download email template export error:', e)
    res.status(500).json({ error: 'download_failed', message: e.message })
  }
})

// DELETE /exports/:fileName - Delete an exported ZIP
emailTemplatesRouter.delete('/exports/:fileName', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { fileName } = req.params
    if (fileName.includes('..')) return res.status(400).json({ error: 'invalid_filename' })
    const targetDir = ensureTempDir('email-templates')
    const filePath = path.join(targetDir, fileName)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not_found' })
    fs.unlinkSync(filePath)
    const metaPath = filePath + '.json'
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath)
    res.json({ success: true })
  } catch (e: any) {
    console.error('Delete email template export error:', e)
    res.status(500).json({ error: 'delete_failed', message: e.message })
  }
})

// POST / - Create new template with conflict resolution
emailTemplatesRouter.post('/', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { schoolYearId, linkedLevels, linkedClasses } = req.body
    await resolveConflicts(schoolYearId || '', linkedLevels || [], linkedClasses || [])
    const template = new EmailTemplate(req.body)
    await template.save()
    res.status(201).json(template)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// PUT /:id - Update template with conflict resolution
emailTemplatesRouter.put('/:id', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const existing = await EmailTemplate.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const effectiveYearId = req.body.schoolYearId !== undefined ? req.body.schoolYearId : existing.schoolYearId
    const linkedLevels = req.body.linkedLevels || existing.linkedLevels
    const linkedClasses = req.body.linkedClasses || existing.linkedClasses

    await resolveConflicts(effectiveYearId || '', linkedLevels, linkedClasses, req.params.id)

    const template = await EmailTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!template) return res.status(404).json({ error: 'Not found' })
    res.json(template)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /:id
emailTemplatesRouter.delete('/:id', requireAuth(['ADMIN']), async (req, res) => {
  try {
    await EmailTemplate.findByIdAndDelete(req.params.id)
    res.json({ success: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// POST /:id/export - Export a single email template as ZIP
emailTemplatesRouter.post('/:id/export', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params
    const template = await EmailTemplate.findById(id).lean()
    if (!template) return res.status(404).json({ error: 'not_found' })

    // Strip environment-specific fields
    const { _id, __v, createdAt, updatedAt, schoolYearId, linkedLevels, linkedClasses, ...cleanData } = template

    // Collect referenced upload URLs
    const referencedUploadUrls = new Set<string>()
    collectTemplateUploadUrls(cleanData, referencedUploadUrls)
    const includedAssets: string[] = []
    const missingAssets: string[] = []

    const archive = archiver('zip', { zlib: { level: 9 } })
    const targetDir = ensureTempDir('email-templates')
    const fileName = `${(template as any).name.replace(/[^a-z0-9]/gi, '_')}_email_export.zip`
    const filePath = path.join(targetDir, fileName)

    const output = fs.createWriteStream(filePath)

    // Save metadata
    const userId = (req as any).user.userId
    const user = await User.findById(userId).lean()
    const metadata = {
      exportedBy: userId,
      exportedByName: user?.displayName || 'Unknown',
      timestamp: new Date().toISOString(),
    }
    const metaPath = filePath + '.json'
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2))

    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve())
      output.on('error', reject)
      archive.on('error', reject)

      archive.pipe(output)

      // Add template JSON
      archive.append(JSON.stringify(cleanData, null, 2), { name: 'template.json' })

      // Add referenced upload files
      for (const uploadUrl of Array.from(referencedUploadUrls).sort()) {
        const sourcePath = uploadUrlToAbsoluteFilePath(uploadUrl)
        const zipPath = uploadUrl.replace(/^\/+/, '')
        if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
          missingAssets.push(uploadUrl)
          continue
        }
        archive.file(sourcePath, { name: zipPath })
        includedAssets.push(uploadUrl)
      }

      archive.append(JSON.stringify({
        includedAssets,
        missingAssets,
        exportedAt: new Date().toISOString(),
      }, null, 2), { name: 'assets-manifest.json' })

      archive.finalize()
    })

    res.json({ success: true, path: filePath, fileName })
  } catch (e: any) {
    console.error('Export email template error:', e)
    res.status(500).json({ error: 'export_failed', message: e.message })
  }
})
