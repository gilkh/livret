import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { requireAuth } from '../auth'
import { PptxImporter } from '../utils/pptxImporter'

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
  const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'))
  const urls = files.map(f => `${folder ? '/' + folder : ''}/${f}`)
  res.json(urls)
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
