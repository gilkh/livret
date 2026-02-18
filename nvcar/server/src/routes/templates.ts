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

import { User } from '../models/User'
import { OutlookUser } from '../models/OutlookUser'
import { Setting } from '../models/Setting'
import fs from 'fs'

export const templatesRouter = Router()
const upload = multer({ storage: multer.memoryStorage() })
const normalizeAllowedSubAdmins = (value: any) => {
  if (!Array.isArray(value)) return undefined
  return value.map((v: any) => String(v).trim()).filter((v: string) => v)
}
const uploadsRootDir = path.resolve(process.cwd(), 'public', 'uploads')
const publicRootDir = path.resolve(process.cwd(), 'public')

const normalizeUploadsUrl = (raw: string): string | null => {
  const value = String(raw || '').trim().replace(/\\/g, '/')
  if (!value) return null
  const uploadsIdx = value.indexOf('/uploads/')
  if (uploadsIdx < 0) return null
  let normalized = value.slice(uploadsIdx)
  const queryStart = normalized.search(/[?#]/)
  if (queryStart >= 0) normalized = normalized.slice(0, queryStart)
  normalized = `/${normalized.replace(/^\/+/, '')}`
  if (!normalized.startsWith('/uploads/')) return null
  const normalizedPath = path.posix.normalize(normalized.slice(1))
  if (!normalizedPath.startsWith('uploads/')) return null
  return `/${normalizedPath}`
}

const collectTemplateUploadUrls = (value: any, urls: Set<string>) => {
  if (value == null) return
  if (typeof value === 'string') {
    const normalized = normalizeUploadsUrl(value)
    if (normalized) urls.add(normalized)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTemplateUploadUrls(item, urls)
    return
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) collectTemplateUploadUrls(value[key], urls)
  }
}

const normalizeTemplateUploadUrls = (value: any): any => {
  if (value == null) return value
  if (typeof value === 'string') {
    return normalizeUploadsUrl(value) || value
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeTemplateUploadUrls(item))
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const key of Object.keys(value)) {
      out[key] = normalizeTemplateUploadUrls(value[key])
    }
    return out
  }
  return value
}

const uploadUrlToAbsoluteFilePath = (url: string): string | null => {
  const normalizedUrl = normalizeUploadsUrl(url)
  if (!normalizedUrl) return null
  const relativeFromPublic = normalizedUrl.replace(/^\/+/, '')
  const absolutePath = path.resolve(publicRootDir, relativeFromPublic)
  if (absolutePath !== uploadsRootDir && !absolutePath.startsWith(uploadsRootDir + path.sep)) {
    return null
  }
  return absolutePath
}

const zipEntryToUploadAbsolutePath = (entryName: string): string | null => {
  const normalizedEntry = path.posix.normalize(String(entryName || '').replace(/\\/g, '/'))
  if (!normalizedEntry.startsWith('uploads/') || normalizedEntry.includes('..')) return null
  const absolutePath = path.resolve(publicRootDir, normalizedEntry)
  if (absolutePath !== uploadsRootDir && !absolutePath.startsWith(uploadsRootDir + path.sep)) {
    return null
  }
  return absolutePath
}

const validateAllowedSubAdmins = async (ids: string[]) => {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return unique
  const [users, outlookUsers] = await Promise.all([
    User.find({ _id: { $in: unique }, role: { $in: ['SUBADMIN', 'AEFE'] } }).select('_id').lean(),
    OutlookUser.find({ _id: { $in: unique }, role: { $in: ['SUBADMIN', 'AEFE'] } }).select('_id').lean()
  ])
  const found = new Set([...users, ...outlookUsers].map((u: any) => String(u._id)))
  if (found.size !== unique.length) return null
  return unique
}

templatesRouter.get('/', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE', 'TEACHER']), async (req, res) => {
  const list = await withCache('templates-all', () =>
    GradebookTemplate.find({}).lean()
  )
  const role = (req as any)?.user?.role
  if (role === 'SUBADMIN' || role === 'AEFE') {
    const userId = String((req as any)?.user?.userId || '')
    const filtered = list.filter((t: any) => {
      const allowed = Array.isArray(t?.suggestionsAllowedSubAdmins) ? t.suggestionsAllowedSubAdmins.map((v: any) => String(v)) : []
      if (allowed.length === 0) return true
      return allowed.includes(userId)
    })
    return res.json(filtered)
  }
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
    let zip: JSZip | null = null

    // Check if zip
    if (req.file.mimetype === 'application/zip' || req.file.originalname.endsWith('.zip')) {
      zip = await JSZip.loadAsync(req.file.buffer)
      const file = zip.file('template.json')
      if (!file) return res.status(400).json({ error: 'invalid_zip_no_template_json' })
      jsonContent = await file.async('string')
    } else {
      jsonContent = req.file.buffer.toString('utf8')
    }

    let templateData
    try {
      templateData = JSON.parse(jsonContent)
      templateData = normalizeTemplateUploadUrls(templateData)
    } catch (e) {
      return res.status(400).json({ error: 'invalid_json' })
    }

    // Restore bundled uploads from ZIP package so imported template stays visually identical.
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

    const userId = (req as any).user.userId

    // Remove system fields and extract visibility settings
    const { _id, __v, createdBy, createdAt, updatedAt, blockVisibilitySettings, ...cleanData } = templateData
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

    // Merge imported visibility settings if present
    if (blockVisibilitySettings && typeof blockVisibilitySettings === 'object') {
      const existingSetting = await Setting.findOne({ key: 'block_visibility_settings' })
      const existingValue = existingSetting?.value || {}
      
      // Merge imported settings into existing ones
      // Convert portable keys (tpl:p:X:b:Y) to new template-specific keys (tpl:newId:p:X:b:Y)
      const newTemplateId = newTemplate._id.toString()
      const mergedSettings = { ...existingValue }
      
      for (const level of Object.keys(blockVisibilitySettings)) {
        if (!mergedSettings[level]) mergedSettings[level] = {}
        for (const view of Object.keys(blockVisibilitySettings[level])) {
          if (!mergedSettings[level][view]) mergedSettings[level][view] = {}
          
          for (const blockKey of Object.keys(blockVisibilitySettings[level][view])) {
            // Convert portable format tpl:p:X:b:Y to tpl:newTemplateId:p:X:b:Y
            let newKey = blockKey
            if (blockKey.startsWith('tpl:p:')) {
              newKey = blockKey.replace('tpl:p:', `tpl:${newTemplateId}:p:`)
            }
            mergedSettings[level][view][newKey] = blockVisibilitySettings[level][view][blockKey]
          }
        }
      }
      
      await Setting.findOneAndUpdate(
        { key: 'block_visibility_settings' },
        { key: 'block_visibility_settings', value: mergedSettings },
        { upsert: true }
      )
    }

    clearCache('templates')
    res.json(newTemplate)
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ error: 'import_failed', message: e.message })
  }
})

templatesRouter.post('/', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  try {
    const { name, pages, variables, watermark, permissions, status, exportPassword, suggestionsAllowedSubAdmins } = req.body || {}
    if (!name) return res.status(400).json({ error: 'missing_name' })
    const userId = (req as any).user.actualUserId || (req as any).user.userId
    const role = (req as any).user?.role
    let normalizedAllowedSubAdmins: string[] | undefined
    if (role === 'ADMIN') {
      const incoming = normalizeAllowedSubAdmins(suggestionsAllowedSubAdmins)
      if (incoming !== undefined) {
        const validated = await validateAllowedSubAdmins(incoming)
        if (!validated) return res.status(400).json({ error: 'invalid_subadmins' })
        normalizedAllowedSubAdmins = validated
      }
    }
    const pagesWithBlockIds = ensureStableBlockIds(undefined, Array.isArray(pages) ? pages : [])
    const pagesWithRowIds = ensureStableExpandedTableRowIds(undefined, pagesWithBlockIds)

    const templateData = {
      name,
      pages: pagesWithRowIds,
      variables: variables || {},
      watermark,
      permissions,
      suggestionsAllowedSubAdmins: normalizedAllowedSubAdmins,
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

    // Get block visibility settings and extract only those relevant to this template's blocks
    const visibilitySetting = await Setting.findOne({ key: 'block_visibility_settings' }).lean()
    let blockVisibilitySettings: Record<string, any> = {}
    
    if (visibilitySetting?.value) {
      // Collect all block keys from this template
      const templateBlockKeys = new Set<string>()
      const pages = (template as any).pages || []
      pages.forEach((page: any, pageIdx: number) => {
        (page.blocks || []).forEach((block: any, blockIdx: number) => {
          if (block.id) templateBlockKeys.add(`block:${block.id}`)
          templateBlockKeys.add(`tpl:${id}:p:${pageIdx}:b:${blockIdx}`)
        })
      })
      
      // Filter visibility settings to only include this template's blocks
      // Convert template-specific keys to portable format for export
      const allSettings = visibilitySetting.value as Record<string, any>
      for (const level of Object.keys(allSettings)) {
        for (const view of Object.keys(allSettings[level] || {})) {
          for (const blockKey of Object.keys(allSettings[level][view] || {})) {
            if (templateBlockKeys.has(blockKey)) {
              if (!blockVisibilitySettings[level]) blockVisibilitySettings[level] = {}
              if (!blockVisibilitySettings[level][view]) blockVisibilitySettings[level][view] = {}
              
              // Convert tpl:templateId:p:X:b:Y to portable format tpl:p:X:b:Y
              let portableKey = blockKey
              if (blockKey.startsWith(`tpl:${id}:`)) {
                portableKey = blockKey.replace(`tpl:${id}:`, 'tpl:')
              }
              blockVisibilitySettings[level][view][portableKey] = allSettings[level][view][blockKey]
            }
          }
        }
      }
    }

    // Add visibility settings to export data
    const exportData = {
      ...cleanTemplate,
      blockVisibilitySettings: Object.keys(blockVisibilitySettings).length > 0 ? blockVisibilitySettings : undefined
    }

    // Collect every uploaded asset referenced by the template payload.
    const referencedUploadUrls = new Set<string>()
    collectTemplateUploadUrls(exportData, referencedUploadUrls)
    const includedAssets: string[] = []
    const missingAssets: string[] = []

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

    // Save metadata
    const userId = (req as any).user.userId
    const user = await User.findById(userId).lean()
    const metadata = {
      exportedBy: userId,
      exportedByName: user?.displayName || 'Unknown',
      timestamp: new Date().toISOString()
    }
    const metaPath = filePath + '.json'
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2))

    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve())
      output.on('error', reject)
      archive.on('error', reject)

      archive.pipe(output)

      // Add template JSON with visibility settings
      archive.append(JSON.stringify(exportData, null, 2), { name: 'template.json' })

      // Add all referenced uploaded files when they exist on disk.
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
        exportedAt: new Date().toISOString()
      }, null, 2), { name: 'assets-manifest.json' })

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

// List exported packages in ../temps
templatesRouter.get('/exports', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  try {
    const targetDir = path.join(process.cwd(), '../temps')
    if (!fs.existsSync(targetDir)) return res.json([])
    const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.zip'))
    const list = files.map(f => {
      const p = path.join(targetDir, f)
      const stat = fs.statSync(p)

      let metadata = {}
      try {
        const metaPath = p + '.json'
        if (fs.existsSync(metaPath)) {
          metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        }
      } catch (e) { /* ignore */ }

      return { fileName: f, size: stat.size, mtime: stat.mtime.toISOString(), ...metadata }
    }).sort((a, b) => (new Date(b.mtime).getTime() - new Date(a.mtime).getTime()))
    res.json(list)
  } catch (e: any) {
    console.error('List exports error:', e)
    res.status(500).json({ error: 'list_exports_failed', message: e.message })
  }
})

// Download an exported package
templatesRouter.get('/exports/:fileName', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  try {
    const { fileName } = req.params
    const targetDir = path.join(process.cwd(), '../temps')
    const filePath = path.join(targetDir, fileName)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not_found' })
    res.download(filePath, fileName)
  } catch (e: any) {
    console.error('Download export error:', e)
    res.status(500).json({ error: 'download_failed', message: e.message })
  }
})

// Delete an exported package
templatesRouter.delete('/exports/:fileName', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  try {
    const { fileName } = req.params
    const targetDir = path.join(process.cwd(), '../temps')
    const filePath = path.join(targetDir, fileName)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not_found' })
    fs.unlinkSync(filePath)

    // Delete metadata if exists
    const metaPath = filePath + '.json'
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath)
    }

    res.json({ success: true })
  } catch (e: any) {
    console.error('Delete export error:', e)
    res.status(500).json({ error: 'delete_failed', message: e.message })
  }
})

// Get template state history (version snapshots)
templatesRouter.get('/:id/state-history', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params
    const template = await GradebookTemplate.findById(id).lean()
    if (!template) return res.status(404).json({ error: 'not_found' })

    const versionHistory = (template.versionHistory || []) as any[]

    // Get unique user IDs from the history
    const userIds = [...new Set(versionHistory.map(v => v.createdBy).filter(Boolean))]
    const users = await User.find({ _id: { $in: userIds } }).lean()
    const userMap = new Map(users.map(u => [String(u._id), u]))

    // Build enriched history entries
    const enrichedHistory = versionHistory.map((entry: any) => {
      const user = entry.createdBy ? userMap.get(String(entry.createdBy)) : null
      const pages = entry.pages || []
      const blockCount = pages.reduce((sum: number, page: any) => sum + (page.blocks || []).length, 0)

      return {
        version: entry.version,
        createdAt: entry.createdAt,
        createdBy: entry.createdBy,
        createdByName: user?.displayName || (user as any)?.username || 'Unknown',
        changeDescription: entry.changeDescription || '',
        saveType: entry.saveType || 'manual',
        pageCount: pages.length,
        blockCount
      }
    }).sort((a: any, b: any) => b.version - a.version) // Most recent first

    res.json({
      templateId: template._id,
      templateName: template.name,
      currentVersion: template.currentVersion || 1,
      versionHistory: enrichedHistory
    })
  } catch (e: any) {
    console.error('[templates] Error fetching state history:', e)
    res.status(500).json({ error: 'fetch_failed', message: e.message })
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
    const role = (req as any).user?.role
    if (role === 'ADMIN') {
      const incoming = normalizeAllowedSubAdmins((rest as any).suggestionsAllowedSubAdmins)
      if (incoming !== undefined) {
        const validated = await validateAllowedSubAdmins(incoming)
        if (!validated) return res.status(400).json({ error: 'invalid_subadmins' })
        ; (rest as any).suggestionsAllowedSubAdmins = validated
      }
    } else if (Object.prototype.hasOwnProperty.call(rest, 'suggestionsAllowedSubAdmins')) {
      delete (rest as any).suggestionsAllowedSubAdmins
    }

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
