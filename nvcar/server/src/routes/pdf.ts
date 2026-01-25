import { Router } from 'express'
import PDFDocument from 'pdfkit'
import { Student } from '../models/Student'
import { Enrollment } from '../models/Enrollment'
import { Category } from '../models/Category'
import { Competency } from '../models/Competency'
import { StudentCompetencyStatus } from '../models/StudentCompetencyStatus'
import { GradebookTemplate } from '../models/GradebookTemplate'
import axios from 'axios'
import { StudentSignature } from '../models/StudentSignature'
import { ClassModel } from '../models/Class'
import { User } from '../models/User'
import path from 'path'
import fs from 'fs'
import { formatDdMmYyyyColon } from '../utils/dateFormat'
import { populateSignatures } from '../services/signatureService'
// eslint-disable-next-line
const archiver = require('archiver')
import { requireAuth } from '../auth'

export const pdfRouter = Router()

const sanitizeFilename = (name: string) => {
  const base = String(name || 'file')
    .replace(/[\r\n]/g, ' ')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return base || 'file'
}

const buildContentDisposition = (filename: string) => {
  const safe = sanitizeFilename(filename)
  const encoded = encodeURIComponent(String(filename || 'file')).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`
}

// Helper function to normalize year string
const normalizeYear = (y: any) => String(y || '').replace(/\s+/g, '').replace(/-/g, '/').trim()

// Helper function to compute next school year name
function computeNextSchoolYearName(year: string | undefined): string {
  if (!year) return ''
  const m = year.match(/(\d{4})\s*([/\-])\s*(\d{4})/)
  if (!m) return ''
  const start = parseInt(m[1], 10)
  const sep = m[2]
  const end = parseInt(m[3], 10)
  if (Number.isNaN(start) || Number.isNaN(end)) return ''
  return `${start + 1}${sep}${end + 1}`
}

// Helper function to get next level (sync)
function getNextLevelNameSync(current: string | undefined): string {
  const c = String(current || '').toUpperCase()
  if (!c) return ''
  if (c === 'TPS') return 'PS'
  if (c === 'PS') return 'MS'
  if (c === 'MS') return 'GS'
  if (c === 'GS') return 'EB1'
  if (c === 'KG1') return 'KG2'
  if (c === 'KG2') return 'KG3'
  if (c === 'KG3') return 'EB1'
  return ''
}

// Helper function to get the promotion year label (next year)
function getPromotionYearLabel(promo: any, assignmentData: any): string {
  const year = String(promo?.year || '')
  if (year) {
    const next = computeNextSchoolYearName(year)
    if (next) return next
  }

  if (!year) return ''

  const history = assignmentData?.signatures || []
  const level = String(promo?.from || '')
  const endSig = Array.isArray(history)
    ? history
      .filter((s: any) => (s?.type === 'end_of_year') && s?.schoolYearName)
      .find((s: any) => {
        if (!level) return true
        if (s?.level) return String(s.level) === level
        return false
      })
    : null

  if (endSig?.schoolYearName) return String(endSig.schoolYearName)

  const next = computeNextSchoolYearName(year)
  return next || year
}

function getPromotionCurrentYearLabel(promo: any, assignmentData: any, blockLevel: string | null, period?: string): string {
  const history = assignmentData?.signatures || []
  const wantEndOfYear = period === 'end-year'
  const isMidYearBlock = period === 'mid-year'

  const candidates = history
    .filter((sig: any) => {
      if (wantEndOfYear) {
        if (sig.type !== 'end_of_year') return false
      } else if (isMidYearBlock) {
        if (sig.type && sig.type !== 'standard') return false
      }
      if (sig.level && blockLevel && sig.level !== blockLevel) return false
      return true
    })
    .sort((a: any, b: any) => new Date(b.signedAt || 0).getTime() - new Date(a.signedAt || 0).getTime())

  const sig = candidates[0]
  if (sig) {
    let yearLabel = String(sig.schoolYearName || '').trim()
    if (!yearLabel && sig.signedAt) {
      const d = new Date(sig.signedAt)
      const y = d.getFullYear()
      const m = d.getMonth()
      const startYear = m >= 8 ? y : y - 1
      yearLabel = `${startYear}/${startYear + 1}`
    }
    if (yearLabel) return yearLabel
  }

  return String(promo?.year || '')
}

const imgCache = new Map<string, Buffer>()
const fetchImage = async (url: string) => {
  if (imgCache.has(url)) return imgCache.get(url)
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer' })
    const buf = Buffer.from(r.data)
    imgCache.set(url, buf)
    return buf
  } catch (e) {
    return null
  }
}

const getV1FlagUrl = (code: string) => {
  const c = (code || '').toLowerCase()
  if (c === 'en' || c === 'uk' || c === 'gb') return 'https://flagcdn.com/w80/us.png'
  if (c === 'fr') return 'https://flagcdn.com/w80/fr.png'
  if (c === 'ar' || c === 'lb') return 'https://flagcdn.com/w80/lb.png'
  return null
}

const getV2EmojiUrl = (item: any) => {
  let emoji = item.emoji
  if (!emoji || emoji.length < 2) {
    const c = (item.code || '').toLowerCase()
    if (c === 'lb' || c === 'ar') emoji = '🇱🇧'
    else if (c === 'fr') emoji = '🇫🇷'
    else if (c === 'en' || c === 'uk' || c === 'gb') emoji = '🇬🇧'
    else emoji = '🏳️'
  }
  return `https://emojicdn.elk.sh/${emoji}?style=apple`
}

pdfRouter.get('/student/:id', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  const { id } = req.params
  const { templateId, pwd } = req.query as any
  const student = await Student.findById(id).lean()
  if (!student) return res.status(404).json({ error: 'not_found' })
  const enrollments = await Enrollment.find({ studentId: id }).lean()
  const statuses = await StudentCompetencyStatus.find({ studentId: id }).lean()
  const statusMap = new Map(statuses.map((s: any) => [s.competencyId, s]))
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', buildContentDisposition(`carnet-${student.lastName}.pdf`))
  const doc = new PDFDocument({ size: 'A4', margin: 0 })
  doc.pipe(res)
  const renderDefault = async () => {
    const categories = await Category.find({}).lean()
    const comps = await Competency.find({}).lean()
    doc.fontSize(20).fillColor('#333').text('Carnet Scolaire', { align: 'center' })
    doc.moveDown()
    doc.fontSize(12).fillColor('#555').text(`Nom: ${student.firstName} ${student.lastName}`)
    const enrollment = enrollments[0]
    if (enrollment) doc.text(`Classe: ${enrollment.classId}`)
    doc.moveDown()
    for (const cat of categories as any[]) {
      doc.fontSize(16).fillColor('#6c5ce7').text(cat.name)
      doc.moveDown(0.2)
      const catComps = comps.filter((c: any) => c.categoryId === String(cat._id))
      for (const comp of catComps as any[]) {
        const st = statusMap.get(String(comp._id)) as any
        const en = st?.en ? '✔' : '✘'
        const fr = st?.fr ? '✔' : '✘'
        const ar = st?.ar ? '✔' : '✘'
        doc.fontSize(12).fillColor('#2d3436').text(`${comp.label} — EN ${en}  |  FR ${fr}  |  AR ${ar}`)
      }
      doc.moveDown()
    }
  }

  const renderFromTemplate = async (tplId: string) => {
    const tpl = await GradebookTemplate.findById(tplId).lean()
    if (!tpl) return renderDefault()
    if (tpl.exportPassword && tpl.exportPassword !== pwd) {
      const user = (req as any).user
      if (!user || !['ADMIN', 'SUBADMIN'].includes(user.role)) {
        return renderDefault()
      }
    }

    // Try to get assignment data for dropdowns
    const TemplateAssignment = (await import('../models/TemplateAssignment')).TemplateAssignment
    const assignment = await TemplateAssignment.findOne({
      studentId: id,
      templateId: tplId
    }).lean()
    const populatedAssignment = assignment ? await populateSignatures(assignment) : assignment
    const assignmentData = populatedAssignment?.data || {}

    const categories = await Category.find({}).lean()
    const comps = await Competency.find({}).lean()
    const compByCat: Record<string, any[]> = {}
    for (const c of comps as any[]) {
      ; (compByCat[c.categoryId] ||= []).push(c)
    }
    const enrollment = enrollments[0]
    const signatures = await StudentSignature.findOne({ studentId: id }).lean()
    const sigMap = new Map((signatures?.items || []).map((s: any) => [s.label, s]))
    const classDoc = enrollment ? await ClassModel.findById(enrollment.classId).lean() : null
    const level = classDoc ? (classDoc as any).level : ''
    const pageW = doc.page.width
    const pageH = doc.page.height
    const DESIGN_W = 800
    const DESIGN_H = 1120
    const sx = (v: number | undefined) => (typeof v === 'number' ? v : 0) * (pageW / DESIGN_W)
    const sy = (v: number | undefined) => (typeof v === 'number' ? v : 0) * (pageH / DESIGN_H)
    const px = (v: number | undefined) => sx(v)
    const py = (v: number | undefined) => sy(v)
    const sr = (v: number | undefined) => {
      const scale = (pageW / DESIGN_W + pageH / DESIGN_H) / 2
      return (typeof v === 'number' ? v : 0) * scale
    }
    const resolveText = (t: string) => t
      .replace(/\{student\.firstName\}/g, String(student.firstName))
      .replace(/\{student\.lastName\}/g, String(student.lastName))
      .replace(/\{student\.dob\}/g, formatDdMmYyyyColon(student.dateOfBirth))
      .replace(/\{class\.name\}/g, classDoc ? String((classDoc as any).name) : '')
    const drawBlock = async (b: any, blockIdx: number = 0) => {
      if (b.type === 'text') {
        if (b.props?.color) doc.fillColor(b.props.color)
        doc.fontSize(b.props?.size || b.props?.fontSize || 12)
        const x = b.props?.x, y = b.props?.y
        const w = b.props?.width, h = b.props?.height
        const txt = b.props?.text || ''
        if (typeof x === 'number' && typeof y === 'number') {
          const opts: any = {}
          if (typeof w === 'number') opts.width = Math.max(0, sx(w))
          if (typeof h === 'number') opts.height = Math.max(0, sy(h))
          doc.text(txt, px(x), py(y), opts)
        } else doc.text(txt)
        doc.fillColor('#2d3436')
      } else if (b.type === 'dynamic_text') {
        if (b.props?.color) doc.fillColor(b.props.color)
        doc.fontSize(b.props?.size || b.props?.fontSize || 12)
        const x = b.props?.x, y = b.props?.y
        const w = b.props?.width, h = b.props?.height
        const txt = resolveText(b.props?.text || '')
        if (typeof x === 'number' && typeof y === 'number') {
          const opts: any = {}
          if (typeof w === 'number') opts.width = Math.max(0, sx(w))
          if (typeof h === 'number') opts.height = Math.max(0, sy(h))
          doc.text(txt, px(x), py(y), opts)
        } else doc.text(txt)
        doc.fillColor('#2d3436')
      } else if (b.type === 'image' && b.props?.url) {
        try {
          const url: string = String(b.props.url)
          if (url.startsWith('data:')) {
            const base64 = url.split(',').pop() || ''
            const buf = Buffer.from(base64, 'base64')
            const options: any = {}
            if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') { options.x = px(b.props.x); options.y = py(b.props.y) }
            if (typeof b.props?.width === 'number' && typeof b.props?.height === 'number') { options.width = sx(b.props.width); options.height = sy(b.props.height) }
            doc.image(buf, options.width ? options : undefined)
          } else {
            const fetchUrl = url.startsWith('http') ? url : `http://localhost:4000${url}`
            const r = await axios.get(fetchUrl, { responseType: 'arraybuffer' })
            const buf = Buffer.from(r.data)
            const options: any = {}
            if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') { options.x = px(b.props.x); options.y = py(b.props.y) }
            if (typeof b.props?.width === 'number' && typeof b.props?.height === 'number') { options.width = sx(b.props.width); options.height = sy(b.props.height) }
            doc.image(buf, options.width ? options : undefined)
          }
        } catch { }
      } else if (b.type === 'rect') {
        const x = px(b.props?.x || 50), y = py(b.props?.y || 50)
        const w = sx(b.props?.width || 100), h = sy(b.props?.height || 50)
        if (b.props?.color && b.props.color !== 'transparent') { doc.fillColor(b.props.color); doc.rect(x, y, w, h).fill() }
        if (b.props?.stroke) { doc.strokeColor(b.props.stroke); doc.lineWidth(b.props?.strokeWidth || 1); doc.rect(x, y, w, h).stroke(); doc.strokeColor('#000') }
        doc.fillColor('#2d3436')
      } else if (b.type === 'circle') {
        const r = sr(b.props?.radius || 40)
        const x = px((b.props?.x || 50)) + r
        const y = py((b.props?.y || 50)) + r
        if (b.props?.color && b.props.color !== 'transparent') { doc.fillColor(b.props.color); doc.circle(x, y, r).fill() }
        if (b.props?.stroke) { doc.strokeColor(b.props.stroke); doc.lineWidth(b.props?.strokeWidth || 1); doc.circle(x, y, r).stroke(); doc.strokeColor('#000') }
        doc.fillColor('#2d3436')
      } else if (b.type === 'line') {
        const x = px(b.props?.x || 50), y = py(b.props?.y || 50)
        const x2 = sx(b.props?.x2 || 100), y2 = sy(b.props?.y2 || 0)
        doc.moveTo(x, y).lineTo(x + x2, y + y2)
        if (b.props?.stroke) doc.strokeColor(b.props.stroke)
        doc.lineWidth(b.props?.strokeWidth || 1).stroke()
        doc.strokeColor('#000')
      } else if (b.type === 'arrow') {
        const x = px(b.props?.x || 50), y = py(b.props?.y || 50)
        const x2 = sx(b.props?.x2 || 100), y2 = sy(b.props?.y2 || 0)
        const color = b.props?.stroke || '#6c5ce7'
        doc.strokeColor(color).moveTo(x, y).lineTo(x + x2, y + y2).lineWidth(b.props?.strokeWidth || 2).stroke()
        doc.fillColor(color)
        const ax = x + x2, ay = y + y2
        doc.moveTo(ax, ay).lineTo(ax - 12, ay - 8).lineTo(ax - 12, ay + 8).fill()
        doc.fillColor('#2d3436').strokeColor('#000')
      } else if (b.type === 'qr') {
        try {
          const wq = Math.round(sx(b.props?.width || 120)) || 120
          const hq = Math.round(sy(b.props?.height || 120)) || 120
          const url = `https://api.qrserver.com/v1/create-qr-code/?size=${wq}x${hq}&data=${encodeURIComponent(b.props?.url || '')}`
          const r = await axios.get(url, { responseType: 'arraybuffer' })
          const buf = Buffer.from(r.data)
          const options: any = {}
          if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') { options.x = px(b.props.x); options.y = py(b.props.y) }
          doc.image(buf, options)
        } catch { }
      } else if (b.type === 'table') {
        const x0 = px(b.props?.x || 50), y0 = py(b.props?.y || 50)
        const cols: number[] = (b.props?.columnWidths || []).map((cw: number) => sx(cw))

        const expandedRows = b.props.expandedRows || false
        const expandedH = expandedRows ? sy(b.props.expandedRowHeight || 34) : 0
        const expandedDividerColor = b.props.expandedDividerColor || '#ddd'

        const rawRows: number[] = (b.props?.rowHeights || []).map((rh: number) => sy(rh))
        const rowOffsets: number[] = [0]
        for (let i = 0; i < rawRows.length; i++) {
          rowOffsets[i + 1] = rowOffsets[i] + (rawRows[i] || 0) + expandedH
        }

        const cells: any[][] = b.props?.cells || []
        const colOffsets: number[] = [0]
        for (let i = 0; i < cols.length; i++) colOffsets[i + 1] = colOffsets[i] + (cols[i] || 0)

        const defaultLangs = [
          { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
          { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
          { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
        ]
        const expandedLanguages = b.props.expandedLanguages || defaultLangs
        const toggleStyle = b.props.expandedToggleStyle || 'v2'

        for (let ri = 0; ri < rawRows.length; ri++) {
          const rowBgColor = cells?.[ri]?.[0]?.fill || b.props.backgroundColor || '#f8f9fa'

          for (let ci = 0; ci < cols.length; ci++) {
            const cell = cells?.[ri]?.[ci] || {}
            const cx = x0 + colOffsets[ci]
            const cy = y0 + rowOffsets[ri]
            const w = cols[ci] || 0
            const h = rawRows[ri] || 0

            if (cell.fill && cell.fill !== 'transparent') { doc.save(); doc.fillColor(cell.fill); doc.rect(cx, cy, w, h).fill(); doc.restore() }

            const drawSide = (sx: number, sy: number, ex: number, ey: number, side: any) => {
              if (!side?.width || !side?.color) return
              doc.save(); doc.strokeColor(side.color).lineWidth(side.width)
              doc.moveTo(sx, sy).lineTo(ex, ey).stroke(); doc.restore()
            }
            drawSide(cx, cy, cx + w, cy, cell?.borders?.t)
            drawSide(cx, cy + h, cx + w, cy + h, cell?.borders?.b)
            drawSide(cx, cy, cx, cy + h, cell?.borders?.l)
            drawSide(cx + w, cy, cx + w, cy + h, cell?.borders?.r)

            if (cell.text) {
              doc.save()
              if (cell.color) doc.fillColor(cell.color)
              doc.fontSize(cell.fontSize || 12)
              doc.text(cell.text, cx + 4, cy + 4, { width: Math.max(0, w - 8) })
              doc.restore()
            }
          }

          if (expandedRows) {
            const cx = x0
            const cy = y0 + rowOffsets[ri] + (rawRows[ri] || 0)
            const totalW = colOffsets[colOffsets.length - 1]

            if (rowBgColor && rowBgColor !== 'transparent') {
              doc.save(); doc.fillColor(rowBgColor); doc.rect(cx, cy, totalW, expandedH).fill(); doc.restore()
            }

            doc.save()
            doc.strokeColor(expandedDividerColor).lineWidth(0.5)
            doc.moveTo(cx + 10, cy).lineTo(cx + totalW - 10, cy).stroke()
            doc.restore()

            const toggleKey = `table_${blockIdx}_row_${ri}`
            const rowLanguages = b.props.rowLanguages?.[ri] || expandedLanguages
            const toggleData = assignmentData?.[toggleKey] || rowLanguages

            let tx = cx + 15
            const ty = cy + (expandedH - 12) / 2
            const size = Math.min(expandedH - 5, 12)

            for (const lang of toggleData) {
              const isActive = lang.active
              let url = null
              if (toggleStyle === 'v1') {
                url = getV1FlagUrl(lang.code)
              } else {
                url = getV2EmojiUrl(lang)
              }

              if (url) {
                try {
                  const buf = await fetchImage(url)
                  if (buf) {
                    doc.save()
                    doc.circle(tx + size / 2, ty + size / 2, size / 2).clip()
                    doc.image(buf, tx, ty, { width: size, height: size })
                    doc.restore()

                    if (isActive) {
                      doc.save()
                      doc.strokeColor('#6c5ce7').lineWidth(1)
                      doc.circle(tx + size / 2, ty + size / 2, size / 2).stroke()
                      doc.restore()
                    } else {
                      doc.save()
                      doc.opacity(0.4)
                      doc.fillColor('#fff').circle(tx + size / 2, ty + size / 2, size / 2).fill()
                      doc.restore()
                    }
                  }
                } catch { }
              }
              tx += size + 10
            }
          }
        }
      } else if (b.type === 'student_info') {
        const fields: string[] = b.props?.fields || ['name', 'class']
        const x = b.props?.x, y = b.props?.y
        const lines: string[] = []
        if (fields.includes('name')) lines.push(`${student.firstName} ${student.lastName}`)
        if (fields.includes('class')) lines.push(`Classe: ${enrollment ? enrollment.classId : ''}`)
        if (fields.includes('dob')) lines.push(`Naissance: ${formatDdMmYyyyColon(student.dateOfBirth)}`)
        if (b.props?.color) doc.fillColor(b.props.color)
        doc.fontSize(b.props?.size || b.props?.fontSize || 12)
        const text = lines.join('\n')
        if (typeof x === 'number' && typeof y === 'number') doc.text(text, px(x), py(y))
        else doc.text(text)
        doc.fillColor('#2d3436')
      } else if (b.type === 'category_title' && b.props?.categoryId) {
        const cat = categories.find((c: any) => String(c._id) === b.props.categoryId)
        if (cat) {
          doc.fontSize(b.props?.size || b.props?.fontSize || 16)
          if (b.props?.color) doc.fillColor(b.props.color)
          const x = b.props?.x, y = b.props?.y
          if (typeof x === 'number' && typeof y === 'number') doc.text(cat.name, px(x), py(y))
          else doc.text(cat.name)
          doc.fillColor('#6c5ce7')
        }
      } else if (b.type === 'competency_list') {
        const catId: string | undefined = b.props?.categoryId
        const items = catId ? (compByCat[catId] || []) : comps
        const lines: string[] = []
        for (const comp of items as any[]) {
          const st = statusMap.get(String(comp._id)) as any
          const en = st?.en ? '✔' : '✘'
          const fr = st?.fr ? '✔' : '✘'
          const ar = st?.ar ? '✔' : '✘'
          lines.push(`${comp.label} — EN ${en}  |  FR ${fr}  |  AR ${ar}`)
        }
        if (b.props?.color) doc.fillColor(b.props.color)
        doc.fontSize(b.props?.size || b.props?.fontSize || 12)
        const x = b.props?.x, y = b.props?.y
        const text = lines.join('\n')
        if (typeof x === 'number' && typeof y === 'number') doc.text(text, px(x), py(y))
        else doc.text(text)
        doc.fillColor('#2d3436')
      } else if (b.type === 'signature') {
        const labels: string[] = b.props?.labels || ['Directeur', 'Enseignant', 'Parent']
        let x = b.props?.x, y = b.props?.y
        for (const lab of labels) {
          const sig = sigMap.get(lab)
          doc.fontSize(b.props?.size || b.props?.fontSize || 12).fillColor('#2d3436')
          if (typeof x === 'number' && typeof y === 'number') {
            doc.text(`${lab}:`, px(x), py(y))
            y += 16
            try {
              if (sig?.url && (sig.url.startsWith('/') || sig.url.startsWith('uploads'))) {
                const localPath = path.join(__dirname, '../../public', sig.url.startsWith('/') ? sig.url : `/${sig.url}`)
                if (fs.existsSync(localPath)) {
                  doc.image(localPath, px(x), py(y), { width: 160 })
                } else {
                  doc.text(`______________________________`, px(x), py(y))
                }
              } else if (sig?.url) {
                const r = await axios.get(String(sig.url).startsWith('http') ? sig.url : `http://localhost:4000${sig.url}`, { responseType: 'arraybuffer' })
                const buf = Buffer.from(r.data)
                doc.image(buf, px(x), py(y), { width: 160 })
              } else if (sig?.dataUrl) {
                const base64 = String(sig.dataUrl).split(',').pop() || ''
                const buf = Buffer.from(base64, 'base64')
                doc.image(buf, px(x), py(y), { width: 160 })
              } else {
                doc.text(`______________________________`, px(x), py(y))
              }
              y += 100
            } catch (e) {
              doc.text(`______________________________`, px(x), py(y)); y += 18
            }
          } else {
            doc.text(`${lab}:`)
            if (sig?.url || sig?.dataUrl) doc.moveDown(0.2)
            if (sig?.url && (sig.url.startsWith('/') || sig.url.startsWith('uploads'))) {
              try {
                const localPath = path.join(__dirname, '../../public', sig.url.startsWith('/') ? sig.url : `/${sig.url}`)
                if (fs.existsSync(localPath)) doc.image(localPath, { width: 160 })
                else doc.text(`______________________________`)
              } catch { doc.text(`______________________________`) }
            } else if (sig?.url) {
              try {
                const r = await axios.get(String(sig.url).startsWith('http') ? sig.url : `http://localhost:4000${sig.url}`, { responseType: 'arraybuffer' })
                const buf = Buffer.from(r.data)
                doc.image(buf, { width: 160 })
              } catch { doc.text(`______________________________`) }
            } else if (sig?.dataUrl) {
              try { const base64 = String(sig.dataUrl).split(',').pop() || ''; const buf = Buffer.from(base64, 'base64'); doc.image(buf, { width: 160 }) } catch { doc.text(`______________________________`) }
            } else {
              doc.text(`______________________________`)
            }
            doc.moveDown(0.4)
          }
        }
      } else if (b.type === 'signature_box') {
        // Get the signature from the sub-admin who signed this template
        const templateAssignment = await (await import('../models/TemplateAssignment')).TemplateAssignment.findOne({
          studentId: id,
          templateId: tplId
        }).lean()

        if (templateAssignment) {
          const TemplateSignature = (await import('../models/TemplateSignature')).TemplateSignature
          const signature = await TemplateSignature.findOne({
            templateAssignmentId: String(templateAssignment._id)
          }).lean()

          if (signature?.subAdminId) {
            const subAdmin = await User.findById(signature.subAdminId).lean()

            const x = px(b.props?.x || 50)
            const y = py(b.props?.y || 50)
            const width = sx(b.props?.width || 200)
            const height = sy(b.props?.height || 80)

            // Draw white rectangle with black border
            doc.save()
            doc.rect(x, y, width, height).stroke('#000')

            {
              const imgWidth = Math.min(width - 10, width * 0.9)
              const imgHeight = height - 10

              let rendered = false
              const sigData = (signature as any).signatureData
              if (sigData) {
                try {
                  const base64 = String(sigData).split(',').pop() || ''
                  const buf = Buffer.from(base64, 'base64')
                  doc.image(buf, x + 5, y + 5, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' })
                  rendered = true
                } catch (e) {
                  console.error('Failed to load signature snapshot:', e)
                }
              }

              const sigUrl = (signature as any).signatureUrl
              if (!rendered && sigUrl) {
                try {
                  if (String(sigUrl).startsWith('data:')) {
                    const base64 = String(sigUrl).split(',').pop() || ''
                    const buf = Buffer.from(base64, 'base64')
                    doc.image(buf, x + 5, y + 5, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' })
                    rendered = true
                  } else if (String(sigUrl).startsWith('/') || String(sigUrl).startsWith('uploads')) {
                    const localPath = path.join(__dirname, '../../public', String(sigUrl).startsWith('/') ? String(sigUrl) : `/${sigUrl}`)
                    if (fs.existsSync(localPath)) {
                      doc.image(localPath, x + 5, y + 5, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' })
                      rendered = true
                    }
                  } else {
                    const r = await axios.get(String(sigUrl).startsWith('http') ? String(sigUrl) : `http://localhost:4000${sigUrl}`, { responseType: 'arraybuffer' })
                    const buf = Buffer.from(r.data)
                    doc.image(buf, x + 5, y + 5, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' })
                    rendered = true
                  }
                } catch (e) {
                  console.error('Failed to load signature image:', e)
                }
              }

              // If signature exists but no image was rendered, show a text checkmark with signer name
              // Do NOT fall back to current user's signatureUrl as it may have changed since signing
              if (!rendered) {
                doc.fontSize(10).fillColor('#333')
                const signerName = subAdmin?.displayName || 'Signé'
                const signedAt = (signature as any).signedAt ? formatDdMmYyyyColon((signature as any).signedAt) : ''
                doc.text(`✓ ${signerName}`, x + 5, y + (height / 2) - 10, { width: width - 10, align: 'center' })
                if (signedAt) {
                  doc.fontSize(8).fillColor('#666')
                  doc.text(signedAt, x + 5, y + (height / 2) + 5, { width: width - 10, align: 'center' })
                }
              }
            }
            doc.restore()
          }
          // Do not render empty signature box when there's no signature
        }
        // Do not render empty signature box when there's no templateAssignment
      } else if (b.type === 'signature_date') {
        const templateAssignment = await (await import('../models/TemplateAssignment')).TemplateAssignment.findOne({
          studentId: id,
          templateId: tplId
        }).lean()

        if (!templateAssignment) return

        const TemplateSignature = (await import('../models/TemplateSignature')).TemplateSignature
        const signatures = await TemplateSignature.find({ templateAssignmentId: String(templateAssignment._id) }).lean()

        const targetLevel = String(b.props?.level || '').trim()
        const semesterRaw = b.props?.semester ?? b.props?.semestre
        const semester = (semesterRaw === 2 || semesterRaw === '2') ? 2 : 1
        const promotions = Array.isArray((templateAssignment as any)?.data?.promotions) ? (templateAssignment as any).data.promotions : []
        const normalizeLevel = (val: any) => String(val || '').trim().toLowerCase()
        const normTargetLevel = normalizeLevel(targetLevel)

        const matchesLevel = (s: any) => {
          if (!normTargetLevel) return true
          const sLevel = normalizeLevel(s?.level)
          if (sLevel) return sLevel === normTargetLevel

          if (s?.schoolYearName) {
            const promo = promotions.find((p: any) => normalizeYear(p?.year) === normalizeYear(s.schoolYearName))
            const promoFrom = normalizeLevel(promo?.from || promo?.fromLevel)
            if (promoFrom && promoFrom === normTargetLevel) return true
          }

          if (s?.schoolYearId) {
            const promo = promotions.find((p: any) => String(p?.schoolYearId || '') === String(s.schoolYearId))
            const promoFrom = normalizeLevel(promo?.from || promo?.fromLevel)
            if (promoFrom && promoFrom === normTargetLevel) return true
          }

          const studentLevel = normalizeLevel(level)
          return !!studentLevel && studentLevel === normTargetLevel
        }

        const matches = (signatures || [])
          .filter((s: any) => s?.signedAt)
          .filter(matchesLevel)
          .filter((s: any) => {
            const spid = String(s?.signaturePeriodId || '')
            const t = String(s?.type || 'standard')
            if (semester === 1) return spid.endsWith('_sem1') || t === 'standard'
            return spid.endsWith('_sem2') || spid.endsWith('_end_of_year') || t === 'end_of_year'
          })
          .sort((a: any, b: any) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())

        const found: any = matches[0]
        if (!found) return

        const x = px(b.props?.x || 50)
        const y = py(b.props?.y || 50)
        const width = sx(b.props?.width || 220)
        const height = sy(b.props?.height || 34)

        const showMeta = b.props?.showMeta !== false
        const prefix = 'Signé le:'
        const dateStr = formatDdMmYyyyColon(found.signedAt)
        const metaPart = `${targetLevel ? `${targetLevel} ` : ''}S${semester}`
        const text = showMeta
          ? `${prefix}${metaPart.trim() ? ` ${metaPart.trim()}` : ''} ${dateStr}`
          : `${prefix} ${dateStr}`

        doc.save()
        doc.fontSize(b.props?.fontSize || 12).fillColor(b.props?.color || '#111')
        doc.text(text, x, y, { width, height, align: (b.props?.align === 'center' ? 'center' : (b.props?.align === 'flex-end' ? 'right' : 'left')) })
        doc.restore()
      } else if (b.type === 'dropdown') {
        // Check level
        if (b.props?.levels && b.props.levels.length > 0 && level && !b.props.levels.includes(level)) {
          return
        }
        // Render dropdown with selected value or skip if empty
        const dropdownNum = b.props?.dropdownNumber
        const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
        const stableKey = blockId ? `dropdown_${blockId}` : null
        const legacyKey = dropdownNum ? `dropdown_${dropdownNum}` : (b.props?.variableName ? b.props.variableName : null)
        const selectedValue = (stableKey ? assignmentData[stableKey] : undefined) ?? (legacyKey ? assignmentData[legacyKey] : undefined) ?? ''

        // Skip rendering if no value is selected
        if (!selectedValue) return

        const x = px(b.props?.x || 50)
        const y = py(b.props?.y || 50)
        const width = sx(b.props?.width || 200)
        const height = sy(b.props?.height || 40)

        // Draw dropdown box
        doc.save()
        doc.rect(x, y, width, height).stroke('#ccc')

        // Draw label if present
        if (b.props?.label) {
          doc.fontSize(10).fillColor('#666')
          doc.text(b.props.label, x, y - 14, { width })
        }

        // Draw dropdown number indicator
        if (dropdownNum) {
          doc.fontSize(8).fillColor('#6c5ce7').font('Helvetica-Bold')
          doc.text(`#${dropdownNum}`, x + width - 25, y - 14)
          doc.font('Helvetica')
        }

        // Draw selected value or placeholder with text wrapping
        doc.fontSize(b.props?.fontSize || 12).fillColor(b.props?.color || '#333')
        const displayText = selectedValue || 'Sélectionner...'
        doc.text(displayText, x + 8, y + 8, { width: Math.max(0, width - 16), height: Math.max(0, height - 16), align: 'left' })

        doc.restore()
      } else if (b.type === 'dropdown_reference') {
        // Render the value selected in the referenced dropdown
        const dropdownNum = b.props?.dropdownNumber || 1
        const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
        const stableKey = blockId ? `dropdown_${blockId}` : null
        const legacyKey = dropdownNum ? `dropdown_${dropdownNum}` : null
        const raw = (stableKey ? assignmentData[stableKey] : undefined) ?? (legacyKey ? assignmentData[legacyKey] : undefined)
        const selectedValue = typeof raw === 'string' ? raw.trim() : raw
        if (!selectedValue) return

        if (b.props?.color) doc.fillColor(b.props.color)
        doc.fontSize(b.props?.size || b.props?.fontSize || 12)
        const x = b.props?.x, y = b.props?.y
        const width = sx(b.props?.width || 200)
        const height = b.props?.height != null ? sy(b.props?.height) : undefined

        if (typeof x === 'number' && typeof y === 'number') {
          const options: any = { width }
          if (height) options.height = height
          doc.text(String(selectedValue), px(x), py(y), options)
        } else {
          doc.text(String(selectedValue))
        }
        doc.fillColor('#2d3436')
      } else if (b.type === 'language_toggle' || b.type === 'language_toggle_v2') {
        const items: any[] = b.props?.items || []
        const filteredItems = items.filter(it => !it.levels || it.levels.length === 0 || !level || it.levels.includes(level))
        const useEmoji = b.type === 'language_toggle_v2' || b.props?.style === 'v2' || filteredItems.some(it => it.emoji)
        const r = sr(b.props?.radius || 40)
        const size = r * 2
        const spacing = sx(b.props?.spacing || 12)
        let x = px(b.props?.x || 50)
        const y = py(b.props?.y || 50)
        for (const it of filteredItems) {
          doc.save()
          doc.circle(x + r, y + r, r).fill('#ddd')
          try {
            let buf: Buffer | null = null
            if (useEmoji) {
              const url = getV2EmojiUrl(it)
              const fetched = await fetchImage(url)
              if (fetched) buf = fetched
            } else if (it?.logo) {
              const url = String(it.logo).startsWith('http') ? it.logo : `http://localhost:4000${it.logo}`
              const rimg = await axios.get(url, { responseType: 'arraybuffer' })
              buf = Buffer.from(rimg.data)
            } else if (it?.code) {
              const url = getV1FlagUrl(it.code)
              const fetched = url ? await fetchImage(url) : null
              if (fetched) buf = fetched
            }
            if (buf) doc.image(buf, x, y, { width: size, height: size })
          } catch { }
          if (!it?.active) {
            doc.opacity(0.4)
            doc.rect(x, y, size, size).fill('#000')
            doc.opacity(1)
          }
          doc.restore()
          x += size + spacing
        }
      } else if (b.type === 'promotion_info') {
        const targetLevel = b.props?.targetLevel
        const promotions = assignmentData.promotions || []
        const blockLevel = String(b.props?.level || '').trim()

        let promo: any = null

        if (targetLevel) {
          promo = promotions.find((p: any) => p.to === targetLevel)
        }

        if (!promo && blockLevel) {
          promo = promotions.find((p: any) => p.from === blockLevel)
        }

        if (!promo && !targetLevel && !blockLevel && promotions.length === 1) {
          promo = { ...(promotions[0] as any) }
        }

        if (!promo && blockLevel) {
          const history = assignmentData.signatures || []
          const wantEndOfYear = b.props?.period === 'end-year'
          const isMidYearBlock = b.props?.period === 'mid-year'
          const candidates = history.filter((sig: any) => {
            if (wantEndOfYear) {
              if (sig.type !== 'end_of_year') return false
            } else if (isMidYearBlock) {
              if (sig.type && sig.type !== 'standard') return false
            }
            if (sig.level && sig.level !== blockLevel) return false
            return true
          }).sort((a: any, b: any) => new Date(b.signedAt || 0).getTime() - new Date(a.signedAt || 0).getTime())

          const sig = candidates[0]
          if (sig) {
            let yearLabel = sig.schoolYearName as string | undefined
            if (!yearLabel && sig.signedAt) {
              const d = new Date(sig.signedAt)
              const y = d.getFullYear()
              const m = d.getMonth()
              const startYear = m >= 8 ? y : y - 1
              yearLabel = `${startYear}/${startYear + 1}`
            }
            if (!yearLabel) {
              const currentYear = new Date().getFullYear()
              const startYear = currentYear
              yearLabel = `${startYear}/${startYear + 1}`
            }

            const baseLevel = blockLevel
            const target = targetLevel || getNextLevelNameSync(baseLevel || '') || ''

            promo = {
              year: yearLabel,
              from: baseLevel,
              to: target || '?',
              class: (student as any)?.className || ''
            }
          }
        }

        if (!promo) {
          const TemplateAssignment = (await import('../models/TemplateAssignment')).TemplateAssignment
          const templateAssignment = await TemplateAssignment.findOne({ studentId: id, templateId: tplId }).lean()
          if (templateAssignment) {
            const TemplateSignature = (await import('../models/TemplateSignature')).TemplateSignature
            const signatures = await TemplateSignature.find({ templateAssignmentId: String(templateAssignment._id) }).lean()
            const wantEndOfYear = b.props?.period === 'end-year'
            const candidates = (signatures || [])
              .filter((sig: any) => sig?.signedAt)
              .filter((sig: any) => {
                if (!blockLevel) return true
                const sigLevel = String(sig?.level || '').trim()
                return !sigLevel || sigLevel === blockLevel
              })
              .filter((sig: any) => {
                const t = String(sig?.type || 'standard')
                if (wantEndOfYear) return t === 'end_of_year'
                return t !== 'end_of_year'
              })
              .sort((a: any, b: any) => new Date(b.signedAt || 0).getTime() - new Date(a.signedAt || 0).getTime())

            const candidate = candidates[0]
            if (candidate?.signedAt) {
              let yearLabel = String(candidate.schoolYearName || '').trim()
              if (!yearLabel) {
                const d = new Date(candidate.signedAt)
                const y = d.getFullYear()
                const m = d.getMonth()
                const startYear = m >= 8 ? y : y - 1
                yearLabel = `${startYear}/${startYear + 1}`
              }

              const candidateLevel = String(candidate?.level || '').trim()
              const baseLevel = blockLevel || candidateLevel || (student as any)?.level || ''
              const target = targetLevel || getNextLevelNameSync(baseLevel || '') || ''

              promo = {
                year: yearLabel,
                from: baseLevel,
                to: target || '?',
                class: (student as any)?.className || ''
              }
            }
          }
        }

        if (promo) {
          if (!promo.class && (student as any)?.className) promo.class = (student as any).className
          if (!promo.from) {
            if (blockLevel) promo.from = blockLevel
            else if ((student as any)?.level) promo.from = (student as any).level
          }

          const yearLabel = getPromotionYearLabel(promo, assignmentData)
          const x = px(b.props?.x || 50)
          const y = py(b.props?.y || 50)
          const width = sx(b.props?.width || (b.props?.field ? 150 : 300))
          const height = sy(b.props?.height || (b.props?.field ? 30 : 100))

          doc.save()
          doc.fontSize(b.props?.fontSize || 12).fillColor(b.props?.color || '#2d3436')

          if (!b.props?.field) {
            doc.rect(x, y, width, height).stroke('#6c5ce7')
            const textX = x + 10
            let textY = y + 15
            doc.font('Helvetica-Bold').text(`Passage en ${promo.to || targetLevel || ''}`, textX, textY, { width: width - 20, align: 'center' })
            textY += 20
            doc.font('Helvetica').text(`${student.firstName} ${student.lastName}`, textX, textY, { width: width - 20, align: 'center' })
            textY += 20
            doc.fontSize((b.props?.fontSize || 12) * 0.8).fillColor('#666')
            doc.text(`Année ${yearLabel}`, textX, textY, { width: width - 20, align: 'center' })
          } else {
            if (b.props.field === 'level') {
              doc.font('Helvetica-Bold').text(`${promo.to || targetLevel || ''}`, x, y + (height / 2) - 6, { width, align: 'center' })
            } else if (b.props.field === 'student') {
              doc.font('Helvetica').text(`${student.firstName} ${student.lastName}`, x, y + (height / 2) - 6, { width, align: 'center' })
            } else if (b.props.field === 'studentFirstName') {
              doc.font('Helvetica').text(`${student.firstName}`, x, y + (height / 2) - 6, { width, align: 'center' })
            } else if (b.props.field === 'studentLastName') {
              doc.font('Helvetica').text(`${student.lastName}`, x, y + (height / 2) - 6, { width, align: 'center' })
            } else if (b.props.field === 'year') {
              doc.text(`Année ${yearLabel}`, x, y + (height / 2) - 6, { width, align: 'center' })
            } else if (b.props.field === 'currentYear') {
              const currentYearLabel = getPromotionCurrentYearLabel(promo, assignmentData, blockLevel, b.props?.period)
              doc.text(String(currentYearLabel || ''), x, y + (height / 2) - 6, { width, align: 'center' })
            } else if (b.props.field === 'class') {
              const raw = String(promo.class || '')
              const parts = raw.split(/\s*[-\s]\s*/)
              const section = parts.length ? parts[parts.length - 1] : raw
              doc.text(section, x, y + (height / 2) - 6, { width, align: 'center' })
            } else if (b.props.field === 'currentLevel') {
              doc.text(String(promo.from || ''), x, y + (height / 2) - 6, { width, align: 'center' })
            }
          }

          doc.restore()
        }
      }
    }
    for (let i = 0; i < (tpl.pages || []).length; i++) {
      const page = (tpl.pages as any[])[i]
      if (i > 0) doc.addPage()
      if (page?.bgColor) {
        doc.save()
        doc.fillColor(page.bgColor)
        doc.rect(0, 0, pageW, pageH).fill()
        doc.restore()
      }
      if (page?.title) doc.fontSize(18).fillColor('#333').text(page.title)
      const blocksWithIdx = (page?.blocks || []).map((b: any, i: number) => ({ b, i }))
      const blocksOrdered = blocksWithIdx.sort((itemA: any, itemB: any) => ((itemA.b?.props?.z ?? 0) - (itemB.b?.props?.z ?? 0)))
      for (const item of blocksOrdered) {
        await drawBlock(item.b, item.i)
        if (!item.b.props?.x && !item.b.props?.y) doc.moveDown(0.4)
      }
    }
  }

  if (templateId) await renderFromTemplate(String(templateId))
  else await renderDefault()
  const dateStr = formatDdMmYyyyColon(new Date())
  doc.moveDown()
  doc.fontSize(10).fillColor('#999').text(`Imprimé le ${dateStr}`, { align: 'right' })
  doc.end()
})

pdfRouter.get('/class/:classId/batch', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  const { classId } = req.params
  const { templateId, pwd } = req.query as any
  const enrolls = await Enrollment.find({ classId }).lean()
  const studentIds = enrolls.map(e => e.studentId)
  const students = await Student.find({ _id: { $in: studentIds } }).lean()
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', buildContentDisposition(`reports-${classId}.zip`))
  const archive = archiver('zip')
  archive.pipe(res)
  for (const s of students as any[]) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: any[] = []
    doc.on('data', (d) => chunks.push(d))
    doc.on('end', () => {
      const buf = Buffer.concat(chunks)
      archive.append(buf, { name: `carnet-${s.lastName}-${s.firstName}.pdf` })
    })
    const enrollments = await Enrollment.find({ studentId: String(s._id) }).lean()
    const statuses = await StudentCompetencyStatus.find({ studentId: String(s._id) }).lean()
    const statusMap = new Map(statuses.map((st: any) => [st.competencyId, st]))

    if (templateId) {
      try {
        const tpl = await GradebookTemplate.findById(String(templateId)).lean()
        if (!tpl || (tpl.exportPassword && tpl.exportPassword !== pwd)) {
          // fallback default
          const categories = await Category.find({}).lean()
          const comps = await Competency.find({}).lean()
          doc.fontSize(20).fillColor('#333').text('Carnet Scolaire', { align: 'center' })
          doc.moveDown()
          doc.fontSize(12).fillColor('#555').text(`Nom: ${s.firstName} ${s.lastName}`)
          const enrollment = enrollments[0]
          if (enrollment) doc.text(`Classe: ${enrollment.classId}`)
          doc.moveDown()
          for (const cat of categories as any[]) {
            doc.fontSize(16).fillColor('#6c5ce7').text(cat.name)
            doc.moveDown(0.2)
            const catComps = comps.filter((c: any) => c.categoryId === String(cat._id))
            for (const comp of catComps as any[]) {
              const st = statusMap.get(String(comp._id)) as any
              const en = st?.en ? '✔' : '✘'
              const fr = st?.fr ? '✔' : '✘'
              const ar = st?.ar ? '✔' : '✘'
              doc.fontSize(12).fillColor('#2d3436').text(`${comp.label} — EN ${en}  |  FR ${fr}  |  AR ${ar}`)
            }
            doc.moveDown()
          }
        } else {
          // Try to get assignment data for dropdowns
          const TemplateAssignment = (await import('../models/TemplateAssignment')).TemplateAssignment
          const assignment = await TemplateAssignment.findOne({
            studentId: String(s._id),
            templateId: String(templateId)
          }).lean()
          const populatedAssignment = assignment ? await populateSignatures(assignment) : assignment
          const assignmentData = populatedAssignment?.data || {}

          const categories = await Category.find({}).lean()
          const comps = await Competency.find({}).lean()
          const compByCat: Record<string, any[]> = {}
          for (const c of comps as any[]) { ; (compByCat[c.categoryId] ||= []).push(c) }
          const signatures = await StudentSignature.findOne({ studentId: String(s._id) }).lean()
          const sigMap = new Map((signatures?.items || []).map((si: any) => [si.label, si]))
          const classDoc = enrollments[0] ? await ClassModel.findById(enrollments[0].classId).lean() : null
          const level = classDoc ? (classDoc as any).level : ''
          const pageW = doc.page.width
          const pageH = doc.page.height
          const DESIGN_W = 800
          const DESIGN_H = 1120
          const sx = (v: number | undefined) => (typeof v === 'number' ? v : 0) * (pageW / DESIGN_W)
          const sy = (v: number | undefined) => (typeof v === 'number' ? v : 0) * (pageH / DESIGN_H)
          const px = (v: number | undefined) => sx(v)
          const py = (v: number | undefined) => sy(v)
          const sr = (v: number | undefined) => {
            const scale = (pageW / DESIGN_W + pageH / DESIGN_H) / 2
            return (typeof v === 'number' ? v : 0) * scale
          }
          const resolveText = (t: string) => t
            .replace(/\{student\.firstName\}/g, String(s.firstName))
            .replace(/\{student\.lastName\}/g, String(s.lastName))
            .replace(/\{student\.dob\}/g, formatDdMmYyyyColon(s.dateOfBirth))
            .replace(/\{class\.name\}/g, classDoc ? String((classDoc as any).name) : '')
          const drawBlock = async (b: any, blockIdx: number = 0) => {
            if (Array.isArray(b?.props?.levels) && b.props.levels.length > 0 && level && !b.props.levels.includes(level)) return
            if (b.type === 'text') {
              if (b.props?.color) doc.fillColor(b.props.color)
              doc.fontSize(b.props?.size || b.props?.fontSize || 12)
              const x = b.props?.x, y = b.props?.y
              const w = b.props?.width, h = b.props?.height
              const txt = b.props?.text || ''
              if (typeof x === 'number' && typeof y === 'number') {
                const opts: any = {}
                if (typeof w === 'number') opts.width = Math.max(0, sx(w))
                if (typeof h === 'number') opts.height = Math.max(0, sy(h))
                doc.text(txt, px(x), py(y), opts)
              } else doc.text(txt)
              doc.fillColor('#2d3436')
            } else if (b.type === 'dynamic_text') {
              if (b.props?.color) doc.fillColor(b.props.color)
              doc.fontSize(b.props?.size || b.props?.fontSize || 12)
              const x = b.props?.x, y = b.props?.y
              const w = b.props?.width, h = b.props?.height
              const txt = resolveText(b.props?.text || '')
              if (typeof x === 'number' && typeof y === 'number') {
                const opts: any = {}
                if (typeof w === 'number') opts.width = Math.max(0, sx(w))
                if (typeof h === 'number') opts.height = Math.max(0, sy(h))
                doc.text(txt, px(x), py(y), opts)
              } else doc.text(txt)
              doc.fillColor('#2d3436')
            } else if (b.type === 'image' && b.props?.url) {
              try {
                const url: string = String(b.props.url)
                if (url.startsWith('data:')) {
                  const base64 = url.split(',').pop() || ''
                  const buf = Buffer.from(base64, 'base64')
                  const options: any = {}
                  if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') { options.x = px(b.props.x); options.y = py(b.props.y) }
                  if (typeof b.props?.width === 'number' && typeof b.props?.height === 'number') { options.width = sx(b.props.width); options.height = sy(b.props.height) }
                  doc.image(buf, options.width ? options : undefined)
                } else {
                  const fetchUrl = url.startsWith('http') ? url : `http://localhost:4000${url}`
                  const r = await axios.get(fetchUrl, { responseType: 'arraybuffer' })
                  const buf = Buffer.from(r.data)
                  const options: any = {}
                  if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') { options.x = px(b.props.x); options.y = py(b.props.y) }
                  if (typeof b.props?.width === 'number' && typeof b.props?.height === 'number') { options.width = sx(b.props.width); options.height = sy(b.props.height) }
                  doc.image(buf, options.width ? options : undefined)
                }
              } catch { }
            } else if (b.type === 'rect') {
              const x = px(b.props?.x || 50), y = py(b.props?.y || 50)
              const w = sx(b.props?.width || 100), h = sy(b.props?.height || 50)
              if (b.props?.color && b.props.color !== 'transparent') { doc.fillColor(b.props.color); doc.rect(x, y, w, h).fill() }
              if (b.props?.stroke) { doc.strokeColor(b.props.stroke); doc.lineWidth(b.props?.strokeWidth || 1); doc.rect(x, y, w, h).stroke(); doc.strokeColor('#000') }
              doc.fillColor('#2d3436')
            } else if (b.type === 'circle') {
              const r = sr(b.props?.radius || 40)
              const x = px((b.props?.x || 50)) + r
              const y = py((b.props?.y || 50)) + r
              if (b.props?.color && b.props.color !== 'transparent') { doc.fillColor(b.props.color); doc.circle(x, y, r).fill() }
              if (b.props?.stroke) { doc.strokeColor(b.props.stroke); doc.lineWidth(b.props?.strokeWidth || 1); doc.circle(x, y, r).stroke(); doc.strokeColor('#000') }
              doc.fillColor('#2d3436')
            } else if (b.type === 'line') {
              const x = px(b.props?.x || 50), y = py(b.props?.y || 50)
              const x2 = sx(b.props?.x2 || 100), y2 = sy(b.props?.y2 || 0)
              doc.moveTo(x, y).lineTo(x + x2, y + y2)
              if (b.props?.stroke) doc.strokeColor(b.props.stroke)
              doc.lineWidth(b.props?.strokeWidth || 1).stroke()
              doc.strokeColor('#000')
            } else if (b.type === 'arrow') {
              const x = px(b.props?.x || 50), y = py(b.props?.y || 50)
              const x2 = sx(b.props?.x2 || 100), y2 = sy(b.props?.y2 || 0)
              const color = b.props?.stroke || '#6c5ce7'
              doc.strokeColor(color).moveTo(x, y).lineTo(x + x2, y + y2).lineWidth(b.props?.strokeWidth || 2).stroke()
              doc.fillColor(color)
              const ax = x + x2, ay = y + y2
              doc.moveTo(ax, ay).lineTo(ax - 12, ay - 8).lineTo(ax - 12, ay + 8).fill()
              doc.fillColor('#2d3436').strokeColor('#000')
            } else if (b.type === 'qr') {
              try {
                const wq = Math.round(sx(b.props?.width || 120)) || 120
                const hq = Math.round(sy(b.props?.height || 120)) || 120
                const url = `https://api.qrserver.com/v1/create-qr-code/?size=${wq}x${hq}&data=${encodeURIComponent(b.props?.url || '')}`
                const r = await axios.get(url, { responseType: 'arraybuffer' })
                const buf = Buffer.from(r.data)
                const options: any = {}
                if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') { options.x = px(b.props.x); options.y = py(b.props.y) }
                doc.image(buf, options)
              } catch { }
            } else if (b.type === 'student_info') {
              const fields: string[] = b.props?.fields || ['name', 'class']
              const x = b.props?.x, y = b.props?.y
              const lines: string[] = []
              if (fields.includes('name')) lines.push(`${s.firstName} ${s.lastName}`)
              if (fields.includes('class')) lines.push(`Classe: ${enrollments[0] ? enrollments[0].classId : ''}`)
              if (fields.includes('dob')) lines.push(`Naissance: ${formatDdMmYyyyColon(s.dateOfBirth)}`)
              if (b.props?.color) doc.fillColor(b.props.color)
              doc.fontSize(b.props?.size || b.props?.fontSize || 12)
              const text = lines.join('\n')
              if (typeof x === 'number' && typeof y === 'number') doc.text(text, px(x), py(y))
              else doc.text(text)
              doc.fillColor('#2d3436')
            } else if (b.type === 'category_title' && b.props?.categoryId) {
              const cat = categories.find((c: any) => String(c._id) === b.props.categoryId)
              if (cat) {
                doc.fontSize(b.props?.size || b.props?.fontSize || 16)
                if (b.props?.color) doc.fillColor(b.props.color)
                const x = b.props?.x, y = b.props?.y
                if (typeof x === 'number' && typeof y === 'number') doc.text(cat.name, px(x), py(y))
                else doc.text(cat.name)
                doc.fillColor('#6c5ce7')
              }
            } else if (b.type === 'competency_list') {
              const catId: string | undefined = b.props?.categoryId
              const items = catId ? (compByCat[catId] || []) : comps
              const lines: string[] = []
              for (const comp of items as any[]) {
                const st = statusMap.get(String(comp._id)) as any
                const en = st?.en ? '✔' : '✘'
                const fr = st?.fr ? '✔' : '✘'
                const ar = st?.ar ? '✔' : '✘'
                lines.push(`${comp.label} — EN ${en}  |  FR ${fr}  |  AR ${ar}`)
              }
              if (b.props?.color) doc.fillColor(b.props.color)
              doc.fontSize(b.props?.size || b.props?.fontSize || 12)
              const x = b.props?.x, y = b.props?.y
              const text = lines.join('\n')
              if (typeof x === 'number' && typeof y === 'number') doc.text(text, px(x), py(y))
              else doc.text(text)
              doc.fillColor('#2d3436')
            } else if (b.type === 'signature') {
              const labels: string[] = b.props?.labels || ['Directeur', 'Enseignant', 'Parent']
              let x = b.props?.x, y = b.props?.y
              for (const lab of labels) {
                const sig = sigMap.get(lab)
                doc.fontSize(b.props?.size || b.props?.fontSize || 12).fillColor('#2d3436')
                if (typeof x === 'number' && typeof y === 'number') {
                  doc.text(`${lab}:`, px(x), py(y))
                  y += 16
                  if (sig?.url) {
                    try {
                      const r = await axios.get(String(sig.url).startsWith('http') ? sig.url : `http://localhost:4000${sig.url}`, { responseType: 'arraybuffer' })
                      const buf = Buffer.from(r.data)
                      doc.image(buf, px(x), py(y), { width: 160 })
                      y += 100
                    } catch {
                      doc.text(`______________________________`, px(x), py(y)); y += 18
                    }
                  } else if (sig?.dataUrl) {
                    try {
                      const base64 = String(sig.dataUrl).split(',').pop() || ''
                      const buf = Buffer.from(base64, 'base64')
                      doc.image(buf, px(x), py(y), { width: 160 })
                      y += 100
                    } catch {
                      doc.text(`______________________________`, px(x), py(y)); y += 18
                    }
                  } else {
                    doc.text(`______________________________`, px(x), py(y)); y += 18
                  }
                } else {
                  doc.text(`${lab}:`)
                  if (sig?.url || sig?.dataUrl) doc.moveDown(0.2)
                  if (sig?.url) {
                    try {
                      const r = await axios.get(String(sig.url).startsWith('http') ? sig.url : `http://localhost:4000${sig.url}`, { responseType: 'arraybuffer' })
                      const buf = Buffer.from(r.data)
                      doc.image(buf, { width: 160 })
                    } catch { doc.text(`______________________________`) }
                  } else if (sig?.dataUrl) {
                    try { const base64 = String(sig.dataUrl).split(',').pop() || ''; const buf = Buffer.from(base64, 'base64'); doc.image(buf, { width: 160 }) } catch { doc.text(`______________________________`) }
                  } else {
                    doc.text(`______________________________`)
                  }
                  doc.moveDown(0.4)
                }
              }
            } else if (b.type === 'dropdown') {
              // Render dropdown with selected value or skip if empty
              const dropdownNum = b.props?.dropdownNumber
              const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
              const stableKey = blockId ? `dropdown_${blockId}` : null
              const legacyKey = dropdownNum ? `dropdown_${dropdownNum}` : (b.props?.variableName ? b.props.variableName : null)
              const selectedValue = (stableKey ? assignmentData[stableKey] : undefined) ?? (legacyKey ? assignmentData[legacyKey] : undefined) ?? ''

              // Skip rendering if no value is selected
              if (!selectedValue) return

              const x = px(b.props?.x || 50)
              const y = py(b.props?.y || 50)
              const width = sx(b.props?.width || 200)
              const height = sy(b.props?.height || 40)

              // Draw dropdown box
              doc.save()
              doc.rect(x, y, width, height).stroke('#ccc')

              // Draw label if present
              if (b.props?.label) {
                doc.fontSize(10).fillColor('#666')
                doc.text(b.props.label, x, y - 14, { width })
              }

              // Draw dropdown number indicator
              if (dropdownNum) {
                doc.fontSize(8).fillColor('#6c5ce7').font('Helvetica-Bold')
                doc.text(`#${dropdownNum}`, x + width - 25, y - 14)
                doc.font('Helvetica')
              }

              // Draw selected value or placeholder with text wrapping
              doc.fontSize(b.props?.fontSize || 12).fillColor(b.props?.color || '#333')
              const displayText = selectedValue || 'Sélectionner...'
              doc.text(displayText, x + 8, y + 8, { width: Math.max(0, width - 16), height: Math.max(0, height - 16), align: 'left' })

              doc.restore()
            } else if (b.type === 'dropdown_reference') {
              // Render the value selected in the referenced dropdown
              const dropdownNum = b.props?.dropdownNumber || 1
              const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
              const stableKey = blockId ? `dropdown_${blockId}` : null
              const legacyKey = dropdownNum ? `dropdown_${dropdownNum}` : null
              const raw = (stableKey ? assignmentData[stableKey] : undefined) ?? (legacyKey ? assignmentData[legacyKey] : undefined)
              const selectedValue = typeof raw === 'string' ? raw.trim() : raw
              if (!selectedValue) return

              if (b.props?.color) doc.fillColor(b.props.color)
              doc.fontSize(b.props?.size || b.props?.fontSize || 12)
              const x = b.props?.x, y = b.props?.y
              const width = sx(b.props?.width || 200)
              const height = b.props?.height != null ? sy(b.props?.height) : undefined

              if (typeof x === 'number' && typeof y === 'number') {
                const options: any = { width }
                if (height) options.height = height
                doc.text(String(selectedValue), px(x), py(y), options)
              } else {
                doc.text(String(selectedValue))
              }
              doc.fillColor('#2d3436')
            } else if (b.type === 'language_toggle' || b.type === 'language_toggle_v2') {
              const items: any[] = b.props?.items || []
              const filteredItems = items.filter(it => !it.levels || it.levels.length === 0 || !level || it.levels.includes(level))
              const useEmoji = b.type === 'language_toggle_v2' || b.props?.style === 'v2' || filteredItems.some(it => it.emoji)
              const r2 = sr(b.props?.radius || 40)
              const size2 = r2 * 2
              const spacing2 = sx(b.props?.spacing || 12)
              let x = px(b.props?.x || 50)
              const y = py(b.props?.y || 50)
              for (const it of filteredItems) {
                doc.save()
                doc.circle(x + r2, y + r2, r2).fill('#ddd')
                try {
                  let buf: Buffer | null = null
                  if (useEmoji) {
                    const url = getV2EmojiUrl(it)
                    const fetched = await fetchImage(url)
                    if (fetched) buf = fetched
                  } else if (it?.logo) {
                    const url = String(it.logo).startsWith('http') ? it.logo : `http://localhost:4000${it.logo}`
                    const rimg = await axios.get(url, { responseType: 'arraybuffer' })
                    buf = Buffer.from(rimg.data)
                  } else if (it?.code) {
                    const url = getV1FlagUrl(it.code)
                    const fetched = url ? await fetchImage(url) : null
                    if (fetched) buf = fetched
                  }
                  if (buf) doc.image(buf, x, y, { width: size2, height: size2 })
                } catch { }
                if (!it?.active) {
                  doc.opacity(0.4)
                  doc.rect(x, y, size2, size2).fill('#000')
                  doc.opacity(1)
                }
                doc.restore()
                x += size2 + spacing2
              }
            } else if (b.type === 'table') {
              const x0 = px(b.props?.x || 50), y0 = py(b.props?.y || 50)
              const cols: number[] = (b.props?.columnWidths || []).map((cw: number) => sx(cw))

              const expandedRows = b.props.expandedRows || false
              const expandedH = expandedRows ? sy(b.props.expandedRowHeight || 34) : 0
              const expandedDividerColor = b.props.expandedDividerColor || '#ddd'

              const rawRows: number[] = (b.props?.rowHeights || []).map((rh: number) => sy(rh))
              const rowOffsets: number[] = [0]
              for (let i = 0; i < rawRows.length; i++) {
                rowOffsets[i + 1] = rowOffsets[i] + (rawRows[i] || 0) + expandedH
              }

              const cells: any[][] = b.props?.cells || []
              const colOffsets: number[] = [0]
              for (let i = 0; i < cols.length; i++) colOffsets[i + 1] = colOffsets[i] + (cols[i] || 0)

              const defaultLangs = [
                { code: 'lb', label: 'Lebanese', emoji: '🇱🇧', active: false },
                { code: 'fr', label: 'French', emoji: '🇫🇷', active: false },
                { code: 'en', label: 'English', emoji: '🇬🇧', active: false }
              ]
              const expandedLanguages = b.props.expandedLanguages || defaultLangs
              const toggleStyle = b.props.expandedToggleStyle || 'v2'

              for (let ri = 0; ri < rawRows.length; ri++) {
                const rowBgColor = cells?.[ri]?.[0]?.fill || b.props.backgroundColor || '#f8f9fa'

                for (let ci = 0; ci < cols.length; ci++) {
                  const cell = cells?.[ri]?.[ci] || {}
                  const cx = x0 + colOffsets[ci]
                  const cy = y0 + rowOffsets[ri]
                  const w = cols[ci] || 0
                  const h = rawRows[ri] || 0

                  if (cell.fill && cell.fill !== 'transparent') { doc.save(); doc.fillColor(cell.fill); doc.rect(cx, cy, w, h).fill(); doc.restore() }

                  const drawSide = (sx: number, sy: number, ex: number, ey: number, side: any) => {
                    if (!side?.width || !side?.color) return
                    doc.save(); doc.strokeColor(side.color).lineWidth(side.width)
                    doc.moveTo(sx, sy).lineTo(ex, ey).stroke(); doc.restore()
                  }
                  drawSide(cx, cy, cx + w, cy, cell?.borders?.t)
                  drawSide(cx, cy + h, cx + w, cy + h, cell?.borders?.b)
                  drawSide(cx, cy, cx, cy + h, cell?.borders?.l)
                  drawSide(cx + w, cy, cx + w, cy + h, cell?.borders?.r)

                  if (cell.text) {
                    doc.save()
                    if (cell.color) doc.fillColor(cell.color)
                    doc.fontSize(cell.fontSize || 12)
                    doc.text(cell.text, cx + 4, cy + 4, { width: Math.max(0, w - 8) })
                    doc.restore()
                  }
                }

                if (expandedRows) {
                  const cx = x0
                  const cy = y0 + rowOffsets[ri] + (rawRows[ri] || 0)
                  const totalW = colOffsets[colOffsets.length - 1]

                  if (rowBgColor && rowBgColor !== 'transparent') {
                    doc.save(); doc.fillColor(rowBgColor); doc.rect(cx, cy, totalW, expandedH).fill(); doc.restore()
                  }

                  doc.save()
                  doc.strokeColor(expandedDividerColor).lineWidth(0.5)
                  doc.moveTo(cx + 10, cy).lineTo(cx + totalW - 10, cy).stroke()
                  doc.restore()

                  const blockId = typeof b?.props?.blockId === 'string' && b.props.blockId.trim() ? b.props.blockId.trim() : null
                  const rowIds = Array.isArray(b?.props?.rowIds) ? b.props.rowIds : []
                  const rowId = typeof rowIds?.[ri] === 'string' && rowIds[ri].trim() ? rowIds[ri].trim() : null
                  const toggleKeyStable = blockId && rowId ? `table_${blockId}_row_${rowId}` : null
                  const toggleKeyLegacy = `table_${blockIdx}_row_${ri}`
                  const rowLanguages = b.props.rowLanguages?.[ri] || expandedLanguages
                  const toggleData = (toggleKeyStable ? assignmentData?.[toggleKeyStable] : null) || assignmentData?.[toggleKeyLegacy] || rowLanguages

                  let tx = cx + 15
                  const ty = cy + (expandedH - 12) / 2
                  const size = Math.min(expandedH - 5, 12)

                  for (const lang of toggleData) {
                    const isActive = lang.active
                    let url = null
                    if (toggleStyle === 'v1') {
                      url = getV1FlagUrl(lang.code)
                    } else {
                      url = getV2EmojiUrl(lang)
                    }

                    if (url) {
                      try {
                        const buf = await fetchImage(url)
                        if (buf) {
                          doc.save()
                          doc.circle(tx + size / 2, ty + size / 2, size / 2).clip()
                          doc.image(buf, tx, ty, { width: size, height: size })
                          doc.restore()

                          if (isActive) {
                            doc.save()
                            doc.strokeColor('#6c5ce7').lineWidth(1)
                            doc.circle(tx + size / 2, ty + size / 2, size / 2).stroke()
                            doc.restore()
                          } else {
                            doc.save()
                            doc.opacity(0.4)
                            doc.fillColor('#fff').circle(tx + size / 2, ty + size / 2, size / 2).fill()
                            doc.restore()
                          }
                        }
                      } catch { }
                    }
                    tx += size + 10
                  }
                }
              }
            } else if (b.type === 'signature_box') {
              // Get the signature from the sub-admin who signed this template
              const TemplateAssignment = (await import('../models/TemplateAssignment')).TemplateAssignment
              const templateAssignment = await TemplateAssignment.findOne({
                studentId: String(s._id),
                templateId: String(templateId)
              }).lean()

              if (templateAssignment) {
                const TemplateSignature = (await import('../models/TemplateSignature')).TemplateSignature
                const signature = await TemplateSignature.findOne({
                  templateAssignmentId: String(templateAssignment._id)
                }).lean()

                if (signature?.subAdminId) {
                  const subAdmin = await User.findById(signature.subAdminId).lean()

                  const x = px(b.props?.x || 50)
                  const y = py(b.props?.y || 50)
                  const width = sx(b.props?.width || 200)
                  const height = sy(b.props?.height || 80)

                  // Draw white rectangle with black border
                  doc.save()
                  doc.rect(x, y, width, height).stroke('#000')

                  {
                    const imgWidth = Math.min(width - 10, width * 0.9)
                    const imgHeight = height - 10

                    let rendered = false
                    const sigData = (signature as any).signatureData
                    if (sigData) {
                      try {
                        const base64 = String(sigData).split(',').pop() || ''
                        const buf = Buffer.from(base64, 'base64')
                        doc.image(buf, x + 5, y + 5, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' })
                        rendered = true
                      } catch (e) {
                        console.error('Failed to load signature snapshot:', e)
                      }
                    }

                    const sigUrl = (signature as any).signatureUrl
                    if (!rendered && sigUrl) {
                      try {
                        if (String(sigUrl).startsWith('data:')) {
                          const base64 = String(sigUrl).split(',').pop() || ''
                          const buf = Buffer.from(base64, 'base64')
                          doc.image(buf, x + 5, y + 5, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' })
                          rendered = true
                        } else if (String(sigUrl).startsWith('/') || String(sigUrl).startsWith('uploads')) {
                          const localPath = path.join(__dirname, '../../public', String(sigUrl).startsWith('/') ? String(sigUrl) : `/${sigUrl}`)
                          if (fs.existsSync(localPath)) {
                            doc.image(localPath, x + 5, y + 5, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' })
                            rendered = true
                          }
                        } else {
                          const r = await axios.get(String(sigUrl).startsWith('http') ? String(sigUrl) : `http://localhost:4000${sigUrl}`, { responseType: 'arraybuffer' })
                          const buf = Buffer.from(r.data)
                          doc.image(buf, x + 5, y + 5, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' })
                          rendered = true
                        }
                      } catch (e) {
                        console.error('Failed to load signature image:', e)
                      }
                    }

                    // If signature exists but no image was rendered, show a text checkmark with signer name
                    // Do NOT fall back to current user's signatureUrl as it may have changed since signing
                    if (!rendered) {
                      doc.fontSize(10).fillColor('#333')
                      const signerName = subAdmin?.displayName || 'Signé'
                      const signedAt = (signature as any).signedAt ? formatDdMmYyyyColon((signature as any).signedAt) : ''
                      doc.text(`✓ ${signerName}`, x + 5, y + (height / 2) - 10, { width: width - 10, align: 'center' })
                      if (signedAt) {
                        doc.fontSize(8).fillColor('#666')
                        doc.text(signedAt, x + 5, y + (height / 2) + 5, { width: width - 10, align: 'center' })
                      }
                    }
                  }
                  doc.restore()
                }
                // Do not render empty signature box when there's no signature
              }
              // Do not render empty signature box when there's no templateAssignment
            } else if (b.type === 'signature_date') {
              const TemplateAssignment = (await import('../models/TemplateAssignment')).TemplateAssignment
              const templateAssignment = await TemplateAssignment.findOne({
                studentId: String(s._id),
                templateId: String(templateId)
              }).lean()

              if (!templateAssignment) return

              const TemplateSignature = (await import('../models/TemplateSignature')).TemplateSignature
              const signatures = await TemplateSignature.find({ templateAssignmentId: String(templateAssignment._id) }).lean()

              const targetLevel = String(b.props?.level || '').trim()
              const semesterRaw = b.props?.semester ?? b.props?.semestre
              const semester = (semesterRaw === 2 || semesterRaw === '2') ? 2 : 1

              const matches = (signatures || [])
                .filter((sig: any) => sig?.signedAt)
                .filter((sig: any) => {
                  if (!targetLevel) return true
                  return String(sig?.level || '').trim() === targetLevel
                })
                .filter((sig: any) => {
                  const spid = String(sig?.signaturePeriodId || '')
                  const t = String(sig?.type || 'standard')
                  if (semester === 1) return spid.endsWith('_sem1') || t === 'standard'
                  return spid.endsWith('_sem2') || spid.endsWith('_end_of_year') || t === 'end_of_year'
                })
                .sort((a: any, b: any) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())

              const found: any = matches[0]
              if (!found) return

              const x = px(b.props?.x || 50)
              const y = py(b.props?.y || 50)
              const width = sx(b.props?.width || 220)
              const height = sy(b.props?.height || 34)

              const showMeta = b.props?.showMeta !== false
              const label = String(b.props?.label || '').trim()
              const dateStr = formatDdMmYyyyColon(found.signedAt)
              const meta = showMeta ? `${label ? `${label} ` : ''}${targetLevel ? `${targetLevel} ` : ''}S${semester} : ` : ''
              const text = `${meta}${dateStr}`

              doc.save()
              doc.fontSize(b.props?.fontSize || 12).fillColor(b.props?.color || '#111')
              doc.text(text, x, y, { width, height, align: (b.props?.align === 'center' ? 'center' : (b.props?.align === 'flex-end' ? 'right' : 'left')) })
              doc.restore()
            } else if (b.type === 'promotion_info') {
              const targetLevel = b.props?.targetLevel
              const promotions = assignmentData.promotions || []
              const blockLevel = String(b.props?.level || '').trim()

              let promo: any = null

              if (targetLevel) {
                promo = promotions.find((p: any) => p.to === targetLevel)
              }

              if (!promo && blockLevel) {
                promo = promotions.find((p: any) => p.from === blockLevel)
              }

              if (!promo && !targetLevel && !blockLevel && promotions.length === 1) {
                promo = { ...(promotions[0] as any) }
              }

              if (!promo && blockLevel) {
                const history = assignmentData.signatures || []
                const wantEndOfYear = b.props?.period === 'end-year'
                const isMidYearBlock = b.props?.period === 'mid-year'
                const candidates = history.filter((sig: any) => {
                  if (wantEndOfYear) {
                    if (sig.type !== 'end_of_year') return false
                  } else if (isMidYearBlock) {
                    if (sig.type && sig.type !== 'standard') return false
                  }
                  if (sig.level && sig.level !== blockLevel) return false
                  return true
                }).sort((a: any, b: any) => new Date(b.signedAt || 0).getTime() - new Date(a.signedAt || 0).getTime())

                const sig = candidates[0]
                if (sig) {
                  let yearLabel = sig.schoolYearName as string | undefined
                  if (!yearLabel && sig.signedAt) {
                    const d = new Date(sig.signedAt)
                    const y = d.getFullYear()
                    const m = d.getMonth()
                    const startYear = m >= 8 ? y : y - 1
                    yearLabel = `${startYear}/${startYear + 1}`
                  }
                  if (!yearLabel) {
                    const currentYear = new Date().getFullYear()
                    const startYear = currentYear
                    yearLabel = `${startYear}/${startYear + 1}`
                  }

                  const baseLevel = blockLevel
                  const target = targetLevel || getNextLevelNameSync(baseLevel || '') || ''

                  promo = {
                    year: yearLabel,
                    from: baseLevel,
                    to: target || '?',
                    class: (s as any)?.className || ''
                  }
                }
              }

              if (!promo) {
                const TemplateAssignment = (await import('../models/TemplateAssignment')).TemplateAssignment
                const templateAssignment = await TemplateAssignment.findOne({
                  studentId: String(s._id),
                  templateId: String(templateId)
                }).lean()

                if (templateAssignment) {
                  const TemplateSignature = (await import('../models/TemplateSignature')).TemplateSignature
                  const signatures = await TemplateSignature.find({ templateAssignmentId: String(templateAssignment._id) }).lean()
                  const wantEndOfYear = b.props?.period === 'end-year'
                  const candidates = (signatures || [])
                    .filter((sig: any) => sig?.signedAt)
                    .filter((sig: any) => {
                      if (!blockLevel) return true
                      const sigLevel = String(sig?.level || '').trim()
                      return !sigLevel || sigLevel === blockLevel
                    })
                    .filter((sig: any) => {
                      const t = String(sig?.type || 'standard')
                      if (wantEndOfYear) return t === 'end_of_year'
                      return t !== 'end_of_year'
                    })
                    .sort((a: any, b: any) => new Date(b.signedAt || 0).getTime() - new Date(a.signedAt || 0).getTime())

                  const candidate = candidates[0]
                  if (candidate?.signedAt) {
                    let yearLabel = String(candidate.schoolYearName || '').trim()
                    if (!yearLabel) {
                      const d = new Date(candidate.signedAt)
                      const y = d.getFullYear()
                      const m = d.getMonth()
                      const startYear = m >= 8 ? y : y - 1
                      yearLabel = `${startYear}/${startYear + 1}`
                    }

                    const candidateLevel = String(candidate?.level || '').trim()
                    const baseLevel = blockLevel || candidateLevel || (s as any)?.level || ''
                    const target = targetLevel || getNextLevelNameSync(baseLevel || '') || ''

                    promo = {
                      year: yearLabel,
                      from: baseLevel,
                      to: target || '?',
                      class: (s as any)?.className || ''
                    }
                  }
                }
              }

              if (promo) {
                if (!promo.class && (s as any)?.className) promo.class = (s as any).className
                if (!promo.from) {
                  if (blockLevel) promo.from = blockLevel
                  else if ((s as any)?.level) promo.from = (s as any).level
                }

                const yearLabel = getPromotionYearLabel(promo, assignmentData)
                const x = px(b.props?.x || 50)
                const y = py(b.props?.y || 50)
                const width = sx(b.props?.width || (b.props?.field ? 150 : 300))
                const height = sy(b.props?.height || (b.props?.field ? 30 : 100))

                doc.save()
                doc.fontSize(b.props?.fontSize || 12).fillColor(b.props?.color || '#2d3436')

                if (!b.props?.field) {
                  doc.rect(x, y, width, height).stroke('#6c5ce7')
                  const textX = x + 10
                  let textY = y + 15
                  doc.font('Helvetica-Bold').text(`Passage en ${promo.to || targetLevel || ''}`, textX, textY, { width: width - 20, align: 'center' })
                  textY += 20
                  doc.font('Helvetica').text(`${s.firstName} ${s.lastName}`, textX, textY, { width: width - 20, align: 'center' })
                  textY += 20
                  doc.fontSize((b.props?.fontSize || 12) * 0.8).fillColor('#666')
                  doc.text(`Année ${yearLabel}`, textX, textY, { width: width - 20, align: 'center' })
                } else {
                  if (b.props.field === 'level') {
                    doc.font('Helvetica-Bold').text(`${promo.to || targetLevel || ''}`, x, y + (height / 2) - 6, { width, align: 'center' })
                  } else if (b.props.field === 'student') {
                    doc.font('Helvetica').text(`${s.firstName} ${s.lastName}`, x, y + (height / 2) - 6, { width, align: 'center' })
                  } else if (b.props.field === 'studentFirstName') {
                    doc.font('Helvetica').text(`${s.firstName}`, x, y + (height / 2) - 6, { width, align: 'center' })
                  } else if (b.props.field === 'studentLastName') {
                    doc.font('Helvetica').text(`${s.lastName}`, x, y + (height / 2) - 6, { width, align: 'center' })
                  } else if (b.props.field === 'year') {
                    doc.text(`Année ${yearLabel}`, x, y + (height / 2) - 6, { width, align: 'center' })
                  } else if (b.props.field === 'currentYear') {
                    const currentYearLabel = getPromotionCurrentYearLabel(promo, assignmentData, blockLevel, b.props?.period)
                    doc.text(String(currentYearLabel || ''), x, y + (height / 2) - 6, { width, align: 'center' })
                  } else if (b.props.field === 'class') {
                    const raw = String(promo.class || '')
                    const parts = raw.split(/\s*[-\s]\s*/)
                    const section = parts.length ? parts[parts.length - 1] : raw
                    doc.text(section, x, y + (height / 2) - 6, { width, align: 'center' })
                  } else if (b.props.field === 'currentLevel') {
                    doc.text(String(promo.from || ''), x, y + (height / 2) - 6, { width, align: 'center' })
                  }
                }

                doc.restore()
              }
            }
          }
          for (let i = 0; i < (tpl.pages || []).length; i++) {
            const page = (tpl.pages as any[])[i]
            if (i > 0) doc.addPage()
            if (page?.bgColor) {
              doc.save()
              doc.fillColor(page.bgColor)
              doc.rect(0, 0, pageW, pageH).fill()
              doc.restore()
            }
            if (page?.title) doc.fontSize(18).fillColor('#333').text(page.title)
            const blocksWithIdx = (page?.blocks || []).map((b: any, i: number) => ({ b, i }))
            const blocksOrdered = blocksWithIdx.sort((itemA: any, itemB: any) => ((itemA.b?.props?.z ?? 0) - (itemB.b?.props?.z ?? 0)))
            for (const item of blocksOrdered) {
              await drawBlock(item.b, item.i)
              if (!item.b.props?.x && !item.b.props?.y) doc.moveDown(0.4)
            }
          }
        }
      } catch {
        // default fallback
      }
    } else {
      const categories = await Category.find({}).lean()
      const comps = await Competency.find({}).lean()
      doc.fontSize(20).fillColor('#333').text('Carnet Scolaire', { align: 'center' })
      doc.moveDown()
      doc.fontSize(12).fillColor('#555').text(`Nom: ${s.firstName} ${s.lastName}`)
      const enrollment = enrollments[0]
      if (enrollment) doc.text(`Classe: ${enrollment.classId}`)
      doc.moveDown()
      for (const cat of categories as any[]) {
        doc.fontSize(16).fillColor('#6c5ce7').text(cat.name)
        doc.moveDown(0.2)
        const catComps = comps.filter((c: any) => c.categoryId === String(cat._id))
        for (const comp of catComps as any[]) {
          const st = statusMap.get(String(comp._id)) as any
          const en = st?.en ? '✔' : '✘'
          const fr = st?.fr ? '✔' : '✘'
          const ar = st?.ar ? '✔' : '✘'
          doc.fontSize(12).fillColor('#2d3436').text(`${comp.label} — EN ${en}  |  FR ${fr}  |  AR ${ar}`)
        }
        doc.moveDown()
      }
    }
    doc.end()
  }
  archive.finalize()
})
