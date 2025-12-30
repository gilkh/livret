import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import JSZip from 'jszip'
import { requireAuth } from '../auth'
import { PptxImporter } from '../utils/pptxImporter'
import { Student } from '../models/Student'

const ensureDir = (p: string) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }
const uploadDir = path.join(process.cwd(), 'public', 'uploads')
ensureDir(uploadDir)

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]+/gi, '_')
    cb(null, `${base}-${Date.now()}${ext}`)
  },
})
const upload = multer({ storage })

export const mediaRouter = Router()

mediaRouter.post('/upload', requireAuth(['ADMIN','SUBADMIN']), upload.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' })
  const folder = req.query?.folder ? String(req.query.folder).replace(/[^a-z0-9_\/-]+/gi, '') : ''
  const destDir = path.join(uploadDir, folder)
  ensureDir(destDir)
  const destPath = path.join(destDir, req.file.filename)
  fs.renameSync(req.file.path, destPath)
  const url = `/uploads/${folder ? folder + '/' : ''}${req.file.filename}`
  res.json({ url })
})

mediaRouter.get('/list', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const folder = req.query?.folder ? String(req.query.folder).replace(/[^a-z0-9_\/-]+/gi, '') : ''
  const dir = path.join(uploadDir, folder)
  ensureDir(dir)
  const items = fs.readdirSync(dir, { withFileTypes: true }).filter(f => !f.name.startsWith('.'))
  const result = items.map(d => ({
    name: d.name,
    type: d.isDirectory() ? 'folder' : 'file',
    path: `${folder ? '/' + folder : ''}/${d.name}`
  }))
  res.json(result)
})

mediaRouter.post('/mkdir', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { folder } = req.body
  if (!folder) return res.status(400).json({ error: 'missing_folder' })
  const dir = path.join(uploadDir, String(folder).replace(/[^a-z0-9_\/-]+/gi, ''))
  ensureDir(dir)
  res.json({ ok: true })
})

mediaRouter.post('/rename', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { from, to } = req.body
  if (!from || !to) return res.status(400).json({ error: 'missing_payload' })
  const src = path.join(uploadDir, String(from).replace(/[^a-z0-9_\\/.-]+/gi, ''))
  const dst = path.join(uploadDir, String(to).replace(/[^a-z0-9_\\/.-]+/gi, ''))
  fs.renameSync(src, dst)
  res.json({ ok: true })
})

mediaRouter.post('/delete', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { target } = req.body
  if (!target) return res.status(400).json({ error: 'missing_target' })
  const p = path.join(uploadDir, String(target).replace(/[^a-z0-9_\\/.-]+/gi, ''))
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
  res.json({ ok: true })
})

const uploadMem = multer({ storage: multer.memoryStorage() })
mediaRouter.post('/convert-emf', requireAuth(['ADMIN','SUBADMIN']), uploadMem.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' })
  const ext = path.extname(req.file.originalname).toLowerCase()
  if (ext !== '.emf' && ext !== '.wmf') return res.status(400).json({ error: 'unsupported_format' })
  const baseUrl = process.env.API_URL || 'http://localhost:4000'
  const importer = new PptxImporter(path.join(uploadDir, 'media'), baseUrl)
  const out = await importer.convertEmfWmf(req.file.buffer, ext)
  if (!out) return res.status(500).json({ error: 'conversion_failed' })
  const nameBase = path.basename(req.file.originalname, ext).replace(/[^a-z0-9_-]+/gi, '_')
  const filename = `${nameBase}-${Date.now()}.png`
  const savePath = path.join(uploadDir, 'media', filename)
  fs.writeFileSync(savePath, out, { encoding: null })
  res.json({ url: `/uploads/media/${filename}` })
})

// Helper function to find similar students using Levenshtein distance
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
    }
  }
  return matrix[b.length][a.length]
}

function findSimilarStudents(searchName: string, students: any[], maxResults = 3): any[] {
  const searchLower = searchName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const scored = students.map(s => {
    const fullName = `${s.firstName} ${s.lastName}`.toLowerCase()
    const reverseName = `${s.lastName} ${s.firstName}`.toLowerCase()
    const dist1 = levenshteinDistance(searchLower, fullName)
    const dist2 = levenshteinDistance(searchLower, reverseName)
    return { student: s, distance: Math.min(dist1, dist2) }
  })
  return scored
    .filter(s => s.distance <= Math.max(5, searchLower.length * 0.4)) // Allow ~40% difference
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults)
    .map(s => ({ _id: s.student._id, name: `${s.student.firstName} ${s.student.lastName}`, distance: s.distance }))
}

mediaRouter.post('/import-photos', requireAuth(['ADMIN', 'SUBADMIN']), upload.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' })
  
  const zipPath = req.file.path
  const studentsDir = path.join(uploadDir, 'students')
  ensureDir(studentsDir)

  try {
    const data = fs.readFileSync(zipPath)
    const zip = await JSZip.loadAsync(data)
    
    const students = await Student.find({}).lean()
    const studentMap = new Map<string, any>()
    
    // Index students by various keys for fuzzy matching
    for (const s of students) {
        if (s.logicalKey) studentMap.set(s.logicalKey.toLowerCase(), s)
        
        // standard combinations
        const fl = `${s.firstName} ${s.lastName}`.toLowerCase()
        const lf = `${s.lastName} ${s.firstName}`.toLowerCase()
        const fl_ = `${s.firstName}_${s.lastName}`.toLowerCase()
        const lf_ = `${s.lastName}_${s.firstName}`.toLowerCase()
        
        // Only set if not already set (to avoid ambiguity? or just overwrite?)
        // If ambiguous, maybe we shouldn't map. But for now last one wins or first one.
        if (!studentMap.has(fl)) studentMap.set(fl, s)
        if (!studentMap.has(lf)) studentMap.set(lf, s)
        if (!studentMap.has(fl_)) studentMap.set(fl_, s)
        if (!studentMap.has(lf_)) studentMap.set(lf_, s)
    }

    const report: any[] = []
    let success = 0
    let failed = 0

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir) continue
      const ext = path.extname(filename).toLowerCase()
      if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) continue

      // Ignore __MACOSX and hidden files
      if (filename.startsWith('__MACOSX') || filename.split('/').pop()?.startsWith('.')) continue

      const baseName = path.basename(filename, ext).toLowerCase()
      // Normalize baseName: remove extra spaces, replace separators
      const cleanName = baseName.replace(/[^a-z0-9]+/g, ' ').trim()
      const underscoreName = baseName.replace(/[^a-z0-9]+/g, '_').trim()
      
      let student = studentMap.get(baseName) || studentMap.get(cleanName) || studentMap.get(underscoreName)

      if (student) {
        // Extract file
        const buffer = await file.async('nodebuffer')
        const targetFilename = `${student.logicalKey}-${Date.now()}${ext}`
        const targetPath = path.join(studentsDir, targetFilename)
        fs.writeFileSync(targetPath, buffer)
        
        const avatarUrl = `/uploads/students/${targetFilename}`
        await Student.findByIdAndUpdate(student._id, { avatarUrl })
        
        success++
        report.push({ filename, status: 'matched', student: `${student.firstName} ${student.lastName}` })
      } else {
        failed++
        // Find similar students for manual assignment
        const similarStudents = findSimilarStudents(baseName, students)
        report.push({ filename, status: 'no_match', similarStudents })
      }
    }
    
    // Cleanup zip file
    try { fs.unlinkSync(zipPath) } catch (e) {}

    res.json({ success, failed, report })

  } catch (e: any) {
    console.error(e)
    res.status(500).json({ error: 'import_failed', details: e.message })
  }
})
