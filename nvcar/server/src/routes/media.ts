import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import JSZip from 'jszip'
import { createExtractorFromData } from 'node-unrar-js'
import type { ArcFiles, ArcList, FileHeader } from 'node-unrar-js'
import { requireAuth } from '../auth'
import { PptxImporter } from '../utils/pptxImporter'
import { Student } from '../models/Student'
import { Enrollment } from '../models/Enrollment'
import { ClassModel } from '../models/Class'
import { SchoolYear } from '../models/SchoolYear'
import { Level } from '../models/Level'
import { v4 as uuidv4 } from 'uuid'

const ensureDir = (p: string) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }
const uploadDir = path.join(process.cwd(), 'public', 'uploads')
ensureDir(uploadDir)
const pendingStudentsDir = path.join(uploadDir, 'students-pending')
ensureDir(pendingStudentsDir)

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

function findSimilarStudents(searchName: string, students: any[], maxResults = 5, filenameBirthYear?: number | null): any[] {
  const searchNormalized = normalizeNameKey(searchName)
  const scored = students.map(s => {
    const fullName = normalizeNameKey(`${s.firstName} ${s.lastName}`)
    const reverseName = normalizeNameKey(`${s.lastName} ${s.firstName}`)
    const dist1 = levenshteinDistance(searchNormalized, fullName)
    const dist2 = levenshteinDistance(searchNormalized, reverseName)
    let distance = Math.min(dist1, dist2)

    // Boost score if birth year matches
    if (filenameBirthYear) {
      const studentYear = getStudentBirthYear(s)
      if (studentYear === filenameBirthYear) {
        distance = Math.max(0, distance - 2) // Reduce distance for year match
      }
    }

    return { student: s, distance }
  })
  return scored
    .filter(s => s.distance <= Math.max(5, searchNormalized.length * 0.4)) // Allow ~40% difference
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults)
    .map(s => ({ _id: String(s.student._id), name: `${s.student.firstName} ${s.student.lastName}`, distance: s.distance, birthYear: getStudentBirthYear(s.student) }))
}

type ArchiveEntry = { filename: string; buffer: Buffer }

// Remove accents from string (é→e, ç→c, etc.)
const removeAccents = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Normalize segment for level/class matching
const normalizeSegment = (segment: string) => removeAccents(segment).toLowerCase().replace(/[^a-z0-9]+/g, '')

// Normalize name for matching: remove accents, hyphens→spaces, lowercase, trim
const normalizeNameKey = (name: string): string => {
  return removeAccents(name)
    .toLowerCase()
    .replace(/[-]+/g, ' ')       // hyphens to spaces (Jean-Pierre → Jean Pierre)
    .replace(/[^a-z0-9]+/g, ' ') // remove special chars
    .replace(/\s+/g, ' ')        // collapse multiple spaces
    .trim()
}

// Extract birth year from filename if present (e.g., Jean_Dupont_2018.jpg → 2018)
const extractBirthYear = (filename: string): number | null => {
  const match = filename.match(/[_\s-](19\d{2}|20[0-2]\d)[_\s.-]?/)
  if (match) return parseInt(match[1], 10)
  // Also try at end of name before extension
  const endMatch = filename.match(/(19\d{2}|20[0-2]\d)$/)
  if (endMatch) return parseInt(endMatch[1], 10)
  return null
}

// Get birth year from student DOB
const getStudentBirthYear = (student: any): number | null => {
  if (!student.dateOfBirth) return null
  const d = new Date(student.dateOfBirth)
  return isNaN(d.getTime()) ? null : d.getFullYear()
}

type StudentMapEntry = { student: any; keys: string[] }

// Build student map with multiple key variants and track duplicates
const buildStudentMap = (students: any[]): { map: Map<string, any>; duplicates: Map<string, any[]> } => {
  const map = new Map<string, any>()
  const duplicates = new Map<string, any[]>()

  const addToMap = (key: string, student: any) => {
    if (!key) return
    if (map.has(key)) {
      // Track as duplicate
      if (!duplicates.has(key)) duplicates.set(key, [map.get(key)])
      duplicates.get(key)?.push(student)
    } else {
      map.set(key, student)
    }
  }

  for (const s of students) {
    const firstName = normalizeNameKey(s.firstName || '')
    const lastName = normalizeNameKey(s.lastName || '')

    // logicalKey
    if (s.logicalKey) addToMap(s.logicalKey.toLowerCase(), s)

    // Standard name combinations
    const fl = `${firstName} ${lastName}`.trim()
    const lf = `${lastName} ${firstName}`.trim()
    addToMap(fl, s)
    addToMap(lf, s)

    // Underscore variants
    const fl_ = `${firstName}_${lastName}`.trim()
    const lf_ = `${lastName}_${firstName}`.trim()
    addToMap(fl_, s)
    addToMap(lf_, s)

    // No-space variants (JeanPierre instead of Jean Pierre)
    const flNoSpace = `${firstName}${lastName}`.replace(/\s/g, '')
    const lfNoSpace = `${lastName}${firstName}`.replace(/\s/g, '')
    addToMap(flNoSpace, s)
    addToMap(lfNoSpace, s)

    // With birth year suffix
    const birthYear = getStudentBirthYear(s)
    if (birthYear) {
      addToMap(`${fl} ${birthYear}`, s)
      addToMap(`${lf} ${birthYear}`, s)
      addToMap(`${fl}_${birthYear}`, s)
      addToMap(`${lf}_${birthYear}`, s)
    }
  }

  return { map, duplicates }
}

const savePendingPhoto = (entry: ArchiveEntry) => {
  const ext = path.extname(entry.filename).toLowerCase()
  const pendingId = uuidv4()
  const pendingFilename = `${pendingId}${ext}`
  fs.writeFileSync(path.join(pendingStudentsDir, pendingFilename), entry.buffer)
  return pendingId
}

const readZipEntries = async (archivePath: string) => {
  const data = fs.readFileSync(archivePath)
  const zip = await JSZip.loadAsync(data)
  const entries: ArchiveEntry[] = []
  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    const ext = path.extname(filename).toLowerCase()
    if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) continue
    if (filename.startsWith('__MACOSX') || filename.split('/').pop()?.startsWith('.')) continue
    const buffer = await file.async('nodebuffer')
    entries.push({ filename, buffer })
  }
  return entries
}

const readRarEntries = async (archivePath: string) => {
  const data = fs.readFileSync(archivePath)
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  const extractor = await createExtractorFromData({ data: arrayBuffer as ArrayBuffer })
  const list: ArcList = extractor.getFileList()

  const headers = list?.fileHeaders ? (Array.from(list.fileHeaders) as FileHeader[]) : []
  const entries: ArchiveEntry[] = []
  for (const header of headers) {
    const rawName = String(header?.name || '')
    const filename = rawName.replace(/\\/g, '/')
    const ext = path.extname(filename).toLowerCase()
    const isDir = header?.flags?.directory
    if (isDir) continue
    if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) continue
    if (filename.startsWith('__MACOSX') || filename.split('/').pop()?.startsWith('.')) continue

    const extracted: ArcFiles<Uint8Array> = extractor.extract({ files: [rawName] })
    const files = extracted?.files ? Array.from(extracted.files) : []
    const file = files[0]
    if (!file || !file.extraction) continue
    const buffer = Buffer.from(file.extraction)
    entries.push({ filename, buffer })
  }
  return entries
}

mediaRouter.post('/import-photos', requireAuth(['ADMIN', 'SUBADMIN']), upload.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' })

  const archivePath = req.file.path
  const archiveExt = path.extname(req.file.originalname || req.file.filename).toLowerCase()
  if (!['.zip', '.rar'].includes(archiveExt)) {
    return res.status(400).json({ error: 'unsupported_archive' })
  }
  const studentsDir = path.join(uploadDir, 'students')
  ensureDir(studentsDir)

  // Optional: only match these student IDs (for targeted import of missing photos)
  const targetStudentIds: Set<string> | null = req.body?.targetStudentIds
    ? new Set(JSON.parse(req.body.targetStudentIds).map((id: string) => String(id)))
    : null

  try {
    const allStudents = await Student.find({}).lean()
    // If targeting specific students, filter the list for matching
    const targetStudents = targetStudentIds
      ? allStudents.filter(s => targetStudentIds.has(String(s._id)))
      : allStudents
    const studentsById = new Map<string, any>(allStudents.map(s => [String(s._id), s]))
    // Build map for target students (for direct matching)
    const { map: targetStudentMap, duplicates: targetDuplicates } = buildStudentMap(targetStudents)
    // Build map for ALL students (for similar name searches and class mismatch checks)
    const { map: allStudentMap, duplicates: allDuplicates } = buildStudentMap(allStudents)

    const activeYear = await SchoolYear.findOne({ active: true }).lean()
    const classQuery = activeYear ? { schoolYearId: String(activeYear._id) } : {}
    const classes = await ClassModel.find(classQuery).lean()
    const classByName = new Map<string, any>(classes.map(c => [String(c.name).toLowerCase(), c]))
    const classById = new Map<string, any>(classes.map(c => [String(c._id), c]))
    const enrollQuery = activeYear ? { schoolYearId: String(activeYear._id) } : {}
    const enrollments = await Enrollment.find(enrollQuery).lean()
    const enrollByClass = new Map<string, string[]>()
    const classByStudent = new Map<string, any>()
    for (const enr of enrollments) {
      if (!enr.classId) continue
      const key = String(enr.classId)
      if (!enrollByClass.has(key)) enrollByClass.set(key, [])
      enrollByClass.get(key)?.push(String(enr.studentId))
      const cls = classById.get(key)
      if (cls) classByStudent.set(String(enr.studentId), cls)
    }

    const levelDocs = await Level.find({}).lean()
    const levelNames = [...levelDocs.map(l => l.name), 'PS', 'MS', 'GS']
    const levelLookup = new Map(levelNames.map(l => [normalizeSegment(l), l]))

    const entries = archiveExt === '.rar' ? await readRarEntries(archivePath) : await readZipEntries(archivePath)

    const report: any[] = []
    let success = 0
    let failed = 0

    const classStudentMapCache = new Map<string, { map: Map<string, any>; duplicates: Map<string, any[]> }>()

    const resolveClassFromPath = (filePath: string) => {
      const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
      if (!segments.length) return null

      let levelIndex = -1
      for (let i = segments.length - 1; i >= 0; i--) {
        const normalized = normalizeSegment(segments[i])
        if (levelLookup.has(normalized)) {
          levelIndex = i
          break
        }
      }

      if (levelIndex < 0) return { reason: 'level_not_found' }
      if (levelIndex + 1 >= segments.length) {
        const levelName = levelLookup.get(normalizeSegment(segments[levelIndex])) || segments[levelIndex]
        return { levelName, reason: 'class_not_found_in_path' }
      }

      const levelName = levelLookup.get(normalizeSegment(segments[levelIndex])) || segments[levelIndex]
      const classSegment = segments[levelIndex + 1]
      const classClean = classSegment.replace(/[_-]+/g, ' ').trim()
      const prefixedClass = `${levelName} ${classClean}`.trim()

      const exactClass = classByName.get(classClean.toLowerCase()) || classByName.get(prefixedClass.toLowerCase())
      if (!exactClass) return { levelName, className: prefixedClass, reason: 'class_not_found' }
      return { levelName, className: exactClass.name, classId: String(exactClass._id) }
    }

    for (const entry of entries) {
      const ext = path.extname(entry.filename).toLowerCase()
      const baseName = path.basename(entry.filename, ext).toLowerCase()
      const cleanName = normalizeNameKey(baseName)
      const underscoreName = baseName.replace(/[^a-z0-9]+/g, '_').trim()

      const classInfo = resolveClassFromPath(entry.filename)
      let candidateStudents = targetStudents
      let studentMap = targetStudentMap

      let duplicates = targetDuplicates
      if (classInfo?.classId) {
        if (!classStudentMapCache.has(classInfo.classId)) {
          const ids = enrollByClass.get(classInfo.classId) || []
          const classStudents = ids.map(id => studentsById.get(id)).filter(Boolean)
          classStudentMapCache.set(classInfo.classId, buildStudentMap(classStudents))
        }
        const cached = classStudentMapCache.get(classInfo.classId)
        if (cached) {
          studentMap = cached.map
          duplicates = cached.duplicates
        }
        candidateStudents = Array.from(studentMap.values())
      }

      // Extract birth year from filename for disambiguation
      const filenameBirthYear = extractBirthYear(baseName)

      // Build all possible lookup keys
      const lookupKeys = [baseName, cleanName, underscoreName]
      if (filenameBirthYear) {
        lookupKeys.push(`${cleanName} ${filenameBirthYear}`)
        lookupKeys.push(`${cleanName}_${filenameBirthYear}`)
      }

      // Try to find student with all key variants
      let student: any = null
      let matchedKey = ''
      for (const key of lookupKeys) {
        if (studentMap.has(key)) {
          student = studentMap.get(key)
          matchedKey = key
          break
        }
      }

      // Check for multiple matches (duplicates)
      let multipleMatches: any[] | null = null
      if (matchedKey && duplicates.has(matchedKey)) {
        multipleMatches = duplicates.get(matchedKey) || null
      }

      if (classInfo?.reason === 'class_not_found' || classInfo?.reason === 'class_not_found_in_path') {
        failed++
        report.push({
          filename: entry.filename,
          status: 'invalid_class',
          reason: classInfo.reason,
          className: classInfo.className,
          level: classInfo.levelName
        })
        continue
      }

      // Handle multiple matches - require review
      if (multipleMatches && multipleMatches.length > 1) {
        failed++
        const pendingId = savePendingPhoto(entry)
        const similarStudents = multipleMatches.map(s => {
          const cls = classByStudent.get(String(s._id))
          return {
            _id: s._id,
            name: `${s.firstName} ${s.lastName}`,
            distance: 0,
            className: cls?.name,
            level: cls?.level,
            birthYear: getStudentBirthYear(s)
          }
        })
        report.push({
          filename: entry.filename,
          status: 'needs_review',
          reason: 'multiple_matches',
          className: classInfo?.className,
          level: classInfo?.levelName,
          pendingId,
          similarStudents
        })
        continue
      }

      if (student) {
        const targetFilename = `${student.logicalKey}-${Date.now()}${ext}`
        const targetPath = path.join(studentsDir, targetFilename)
        fs.writeFileSync(targetPath, entry.buffer)

        const avatarUrl = `/uploads/students/${targetFilename}`
        await Student.findByIdAndUpdate(student._id, { avatarUrl })

        success++
        report.push({
          filename: entry.filename,
          status: 'matched',
          student: `${student.firstName} ${student.lastName}`,
          className: classInfo?.className,
          level: classInfo?.levelName
        })
      } else {
        failed++
        if (classInfo?.classId) {
          // Check if student exists in another class (within target students for targeted import)
          const searchMap = targetStudentIds ? targetStudentMap : allStudentMap
          let globalExact: any = null
          for (const key of lookupKeys) {
            if (searchMap.has(key)) {
              globalExact = searchMap.get(key)
              break
            }
          }
          if (globalExact && (!targetStudentIds || targetStudentIds.has(String(globalExact._id)))) {
            const foundClass = classByStudent.get(String(globalExact._id))
            const pendingId = savePendingPhoto(entry)
            report.push({
              filename: entry.filename,
              status: 'needs_review',
              reason: 'class_mismatch',
              className: classInfo?.className,
              level: classInfo?.levelName,
              expectedClass: classInfo?.className,
              foundClass: foundClass?.name,
              pendingId,
              similarStudents: [{
                _id: String(globalExact._id),
                name: `${globalExact.firstName} ${globalExact.lastName}`,
                distance: 0,
                className: foundClass?.name,
                level: foundClass?.level
              }]
            })
            continue
          }

          // Search within target students for similar names (if targeted import, only missing-photo students)
          const searchPool = targetStudentIds ? targetStudents : allStudents
          const similarStudents = findSimilarStudents(baseName, searchPool, 5, filenameBirthYear).map(s => {
            const cls = classByStudent.get(String(s._id))
            return { ...s, className: cls?.name, level: cls?.level }
          })
          const pendingId = savePendingPhoto(entry)
          report.push({
            filename: entry.filename,
            status: 'needs_review',
            reason: 'no_match_in_class',
            similarStudents,
            className: classInfo?.className,
            level: classInfo?.levelName,
            pendingId
          })
          continue
        }

        // Search within target students for similar names (if targeted import, only missing-photo students)
        const searchPool = targetStudentIds ? targetStudents : allStudents
        const similarStudents = findSimilarStudents(baseName, searchPool, 5, filenameBirthYear).map(s => {
          const cls = classByStudent.get(String(s._id))
          return { ...s, className: cls?.name, level: cls?.level }
        })
        const pendingId = similarStudents.length ? savePendingPhoto(entry) : undefined
        report.push({
          filename: entry.filename,
          status: 'no_match',
          reason: classInfo?.reason || 'no_match',
          similarStudents,
          className: classInfo?.className,
          level: classInfo?.levelName,
          pendingId
        })
      }
    }

    try { fs.unlinkSync(archivePath) } catch (e) {}

    res.json({ success, failed, report })

  } catch (e: any) {
    console.error(e)
    res.status(500).json({ error: 'import_failed', details: e.message })
  }
})

mediaRouter.post('/confirm-photo', requireAuth(['ADMIN', 'SUBADMIN']), async (req: any, res) => {
  const { pendingId, studentId } = req.body
  if (!pendingId || !studentId) return res.status(400).json({ error: 'missing_payload' })

  try {
    const pendingFiles = fs.readdirSync(pendingStudentsDir)
    const pendingFile = pendingFiles.find(name => name.startsWith(String(pendingId)))
    if (!pendingFile) return res.status(404).json({ error: 'pending_not_found' })

    const ext = path.extname(pendingFile).toLowerCase()
    const student = await Student.findById(studentId).lean()
    if (!student) return res.status(404).json({ error: 'student_not_found' })

    const targetFilename = `${student.logicalKey}-${Date.now()}${ext}`
    const targetPath = path.join(uploadDir, 'students', targetFilename)
    ensureDir(path.join(uploadDir, 'students'))

    fs.renameSync(path.join(pendingStudentsDir, pendingFile), targetPath)

    const avatarUrl = `/uploads/students/${targetFilename}`
    await Student.findByIdAndUpdate(studentId, { avatarUrl })

    res.json({ ok: true, url: avatarUrl, studentId })
  } catch (e: any) {
    res.status(500).json({ error: 'confirm_failed', details: e.message })
  }
})
