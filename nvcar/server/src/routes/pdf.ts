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
// eslint-disable-next-line
const archiver = require('archiver')
import { requireAuth } from '../auth'

export const pdfRouter = Router()

pdfRouter.get('/student/:id', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  const { id } = req.params
  const { templateId, pwd } = req.query as any
  const student = await Student.findById(id).lean()
  if (!student) return res.status(404).json({ error: 'not_found' })
  const enrollments = await Enrollment.find({ studentId: id }).lean()
  const statuses = await StudentCompetencyStatus.find({ studentId: id }).lean()
  const statusMap = new Map(statuses.map((s: any) => [s.competencyId, s]))
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="carnet-${student.lastName}.pdf"`)
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
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
    if (tpl.exportPassword && tpl.exportPassword !== pwd) return renderDefault()
    const categories = await Category.find({}).lean()
    const comps = await Competency.find({}).lean()
    const compByCat: Record<string, any[]> = {}
    for (const c of comps as any[]) {
      ;(compByCat[c.categoryId] ||= []).push(c)
    }
    const enrollment = enrollments[0]
    const signatures = await StudentSignature.findOne({ studentId: id }).lean()
    const sigMap = new Map((signatures?.items || []).map((s: any) => [s.label, s]))
    const classDoc = enrollment ? await ClassModel.findById(enrollment.classId).lean() : null
    const resolveText = (t: string) => t
      .replace(/\{student\.firstName\}/g, String(student.firstName))
      .replace(/\{student\.lastName\}/g, String(student.lastName))
      .replace(/\{student\.dob\}/g, new Date(student.dateOfBirth).toLocaleDateString())
      .replace(/\{class\.name\}/g, classDoc ? String((classDoc as any).name) : '')
    const drawBlock = async (b: any) => {
      if (b.type === 'text') {
        if (b.props?.color) doc.fillColor(b.props.color)
        doc.fontSize(b.props?.size || b.props?.fontSize || 12)
        const x = b.props?.x, y = b.props?.y
        const txt = b.props?.text || ''
        if (typeof x === 'number' && typeof y === 'number') doc.text(txt, x, y)
        else doc.text(txt)
        doc.fillColor('#2d3436')
      } else if (b.type === 'dynamic_text') {
        if (b.props?.color) doc.fillColor(b.props.color)
        doc.fontSize(b.props?.size || b.props?.fontSize || 12)
        const x = b.props?.x, y = b.props?.y
        const txt = resolveText(b.props?.text || '')
        if (typeof x === 'number' && typeof y === 'number') doc.text(txt, x, y)
        else doc.text(txt)
        doc.fillColor('#2d3436')
      } else if (b.type === 'image' && b.props?.url) {
        try {
          const r = await axios.get(b.props.url, { responseType: 'arraybuffer' })
          const buf = Buffer.from(r.data)
          const options: any = {}
          if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') { options.x = b.props.x; options.y = b.props.y }
          if (typeof b.props?.width === 'number' && typeof b.props?.height === 'number') { options.width = b.props.width; options.height = b.props.height }
          doc.image(buf, options.width ? options : undefined)
        } catch {}
      } else if (b.type === 'rect') {
        const x = b.props?.x || 50, y = b.props?.y || 50
        const w = b.props?.width || 100, h = b.props?.height || 50
        if (b.props?.color && b.props.color !== 'transparent') { doc.fillColor(b.props.color); doc.rect(x, y, w, h).fill() }
        if (b.props?.stroke) { doc.strokeColor(b.props.stroke); doc.lineWidth(b.props?.strokeWidth || 1); doc.rect(x, y, w, h).stroke(); doc.strokeColor('#000') }
        doc.fillColor('#2d3436')
      } else if (b.type === 'circle') {
        const r = b.props?.radius || 40
        const x = (b.props?.x || 50) + r
        const y = (b.props?.y || 50) + r
        if (b.props?.color && b.props.color !== 'transparent') { doc.fillColor(b.props.color); doc.circle(x, y, r).fill() }
        if (b.props?.stroke) { doc.strokeColor(b.props.stroke); doc.lineWidth(b.props?.strokeWidth || 1); doc.circle(x, y, r).stroke(); doc.strokeColor('#000') }
        doc.fillColor('#2d3436')
      } else if (b.type === 'line') {
        const x = b.props?.x || 50, y = b.props?.y || 50
        const x2 = b.props?.x2 || 100, y2 = b.props?.y2 || 0
        doc.moveTo(x, y).lineTo(x + x2, y + y2)
        if (b.props?.stroke) doc.strokeColor(b.props.stroke)
        doc.lineWidth(b.props?.strokeWidth || 1).stroke()
        doc.strokeColor('#000')
      } else if (b.type === 'arrow') {
        const x = b.props?.x || 50, y = b.props?.y || 50
        const x2 = b.props?.x2 || 100, y2 = b.props?.y2 || 0
        const color = b.props?.stroke || '#6c5ce7'
        doc.strokeColor(color).moveTo(x, y).lineTo(x + x2, y + y2).lineWidth(b.props?.strokeWidth || 2).stroke()
        doc.fillColor(color)
        const ax = x + x2, ay = y + y2
        doc.moveTo(ax, ay).lineTo(ax - 12, ay - 8).lineTo(ax - 12, ay + 8).fill()
        doc.fillColor('#2d3436').strokeColor('#000')
      } else if (b.type === 'qr') {
        try {
          const url = `https://api.qrserver.com/v1/create-qr-code/?size=${b.props?.width || 120}x${b.props?.height || 120}&data=${encodeURIComponent(b.props?.url || '')}`
          const r = await axios.get(url, { responseType: 'arraybuffer' })
          const buf = Buffer.from(r.data)
          const options: any = {}
          if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') { options.x = b.props.x; options.y = b.props.y }
          doc.image(buf, options)
        } catch {}
      } else if (b.type === 'table') {
        const x0 = b.props?.x || 50, y0 = b.props?.y || 50
        const cols: number[] = b.props?.columnWidths || []
        const rows: number[] = b.props?.rowHeights || []
        const cells: any[][] = b.props?.cells || []
        const colOffsets: number[] = [0]
        for (let i = 0; i < cols.length; i++) colOffsets[i + 1] = colOffsets[i] + (cols[i] || 0)
        const rowOffsets: number[] = [0]
        for (let i = 0; i < rows.length; i++) rowOffsets[i + 1] = rowOffsets[i] + (rows[i] || 0)
        for (let ri = 0; ri < rows.length; ri++) {
          for (let ci = 0; ci < cols.length; ci++) {
            const cell = cells?.[ri]?.[ci] || {}
            const cx = x0 + colOffsets[ci]
            const cy = y0 + rowOffsets[ri]
            const w = cols[ci] || 0
            const h = rows[ri] || 0
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
        }
      } else if (b.type === 'student_info') {
        const fields: string[] = b.props?.fields || ['name','class']
        const x = b.props?.x, y = b.props?.y
        const lines: string[] = []
        if (fields.includes('name')) lines.push(`${student.firstName} ${student.lastName}`)
        if (fields.includes('class')) lines.push(`Classe: ${enrollment ? enrollment.classId : ''}`)
        if (fields.includes('dob')) lines.push(`Naissance: ${new Date(student.dateOfBirth).toLocaleDateString()}`)
        if (b.props?.color) doc.fillColor(b.props.color)
        doc.fontSize(b.props?.size || b.props?.fontSize || 12)
        const text = lines.join('\n')
        if (typeof x === 'number' && typeof y === 'number') doc.text(text, x, y)
        else doc.text(text)
        doc.fillColor('#2d3436')
      } else if (b.type === 'category_title' && b.props?.categoryId) {
        const cat = categories.find((c: any) => String(c._id) === b.props.categoryId)
        if (cat) {
          doc.fontSize(b.props?.size || b.props?.fontSize || 16)
          if (b.props?.color) doc.fillColor(b.props.color)
          const x = b.props?.x, y = b.props?.y
          if (typeof x === 'number' && typeof y === 'number') doc.text(cat.name, x, y)
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
        if (typeof x === 'number' && typeof y === 'number') doc.text(text, x, y)
        else doc.text(text)
        doc.fillColor('#2d3436')
      } else if (b.type === 'signature') {
        const labels: string[] = b.props?.labels || ['Directeur','Enseignant','Parent']
        let x = b.props?.x, y = b.props?.y
        for (const lab of labels) {
          const sig = sigMap.get(lab)
          doc.fontSize(b.props?.size || b.props?.fontSize || 12).fillColor('#2d3436')
          if (typeof x === 'number' && typeof y === 'number') {
            doc.text(`${lab}:`, x, y)
            y += 16
            if (sig?.url) {
              try {
                const r = await axios.get(String(sig.url).startsWith('http') ? sig.url : `http://localhost:4000${sig.url}`, { responseType: 'arraybuffer' })
                const buf = Buffer.from(r.data)
                doc.image(buf, x, y, { width: 160 })
                y += 100
              } catch {
                doc.text(`______________________________`, x, y); y += 18
              }
            } else if (sig?.dataUrl) {
              try {
                const base64 = String(sig.dataUrl).split(',').pop() || ''
                const buf = Buffer.from(base64, 'base64')
                doc.image(buf, x, y, { width: 160 })
                y += 100
              } catch {
                doc.text(`______________________________`, x, y); y += 18
              }
            } else {
              doc.text(`______________________________`, x, y); y += 18
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
            
            const x = b.props?.x || 50
            const y = b.props?.y || 50
            const width = b.props?.width || 200
            const height = b.props?.height || 80
            
            // Draw white rectangle with black border
            doc.save()
            doc.rect(x, y, width, height).stroke('#000')
            
            // If sub-admin has a signature image, place it in the box
            if (subAdmin?.signatureUrl) {
              try {
                const sigPath = path.join(__dirname, '../../public', subAdmin.signatureUrl)
                if (fs.existsSync(sigPath)) {
                  const imgWidth = Math.min(width - 10, width * 0.9)
                  const imgHeight = height - 10
                  doc.image(sigPath, x + 5, y + 5, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' })
                }
              } catch (e) {
                console.error('Failed to load signature image:', e)
              }
            }
            doc.restore()
          } else {
            // No signature yet, just draw empty box
            const x = b.props?.x || 50
            const y = b.props?.y || 50
            const width = b.props?.width || 200
            const height = b.props?.height || 80
            doc.rect(x, y, width, height).stroke('#000')
          }
        } else {
          // No assignment, just draw empty box
          const x = b.props?.x || 50
          const y = b.props?.y || 50
          const width = b.props?.width || 200
          const height = b.props?.height || 80
          doc.rect(x, y, width, height).stroke('#000')
        }
      } else if (b.type === 'language_toggle') {
        const items: any[] = b.props?.items || []
        const r = b.props?.radius || 40
        const size = r * 2
        const spacing = b.props?.spacing || 12
        let x = b.props?.x || 50
        const y = b.props?.y || 50
        for (const it of items) {
          doc.save()
          doc.circle(x + r, y + r, r).fill('#ddd')
          if (it?.logo) {
            try {
              const url = String(it.logo).startsWith('http') ? it.logo : `http://localhost:4000${it.logo}`
              const rimg = await axios.get(url, { responseType: 'arraybuffer' })
              const buf = Buffer.from(rimg.data)
              doc.image(buf, x, y, { width: size, height: size })
            } catch {
              // keep gray circle
            }
          }
          if (!it?.active) {
            doc.opacity(0.4)
            doc.rect(x, y, size, size).fill('#000')
            doc.opacity(1)
          }
          doc.restore()
          x += size + spacing
        }
      }
    }
    for (let i = 0; i < (tpl.pages || []).length; i++) {
      const page = (tpl.pages as any[])[i]
      if (i > 0) doc.addPage()
      if (page?.bgColor) {
        const m = doc.page.margins
        const w = doc.page.width
        const h = doc.page.height
        doc.save()
        doc.fillColor(page.bgColor)
        doc.rect(m.left, m.top, w - m.left - m.right, h - m.top - m.bottom).fill()
        doc.restore()
      }
      if (page?.title) doc.fontSize(18).fillColor('#333').text(page.title)
      const blocksOrdered = [...(page?.blocks || [])].sort((a: any, b: any) => ((a?.props?.z ?? 0) - (b?.props?.z ?? 0)))
      for (const b of blocksOrdered) {
        await drawBlock(b)
        if (!b.props?.x && !b.props?.y) doc.moveDown(0.4)
      }
    }
  }

  if (templateId) await renderFromTemplate(String(templateId))
  else await renderDefault()
  const dateStr = new Date().toLocaleDateString()
  doc.moveDown()
  doc.fontSize(10).fillColor('#999').text(`Imprimé le ${dateStr}`, { align: 'right' })
  doc.end()
})

pdfRouter.get('/class/:classId/batch', requireAuth(['ADMIN','SUBADMIN']), async (req, res) => {
  const { classId } = req.params
  const { templateId, pwd } = req.query as any
  const enrolls = await Enrollment.find({ classId }).lean()
  const studentIds = enrolls.map(e => e.studentId)
  const students = await Student.find({ _id: { $in: studentIds } }).lean()
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="reports-${classId}.zip"`)
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
          const categories = await Category.find({}).lean()
          const comps = await Competency.find({}).lean()
          const compByCat: Record<string, any[]> = {}
          for (const c of comps as any[]) { ;(compByCat[c.categoryId] ||= []).push(c) }
          const signatures = await StudentSignature.findOne({ studentId: String(s._id) }).lean()
          const sigMap = new Map((signatures?.items || []).map((si: any) => [si.label, si]))
          const classDoc = enrollments[0] ? await ClassModel.findById(enrollments[0].classId).lean() : null
          const resolveText = (t: string) => t
            .replace(/\{student\.firstName\}/g, String(s.firstName))
            .replace(/\{student\.lastName\}/g, String(s.lastName))
            .replace(/\{student\.dob\}/g, new Date(s.dateOfBirth).toLocaleDateString())
            .replace(/\{class\.name\}/g, classDoc ? String((classDoc as any).name) : '')
          const drawBlock = async (b: any) => {
            if (b.type === 'text') {
              if (b.props?.color) doc.fillColor(b.props.color)
              doc.fontSize(b.props?.size || b.props?.fontSize || 12)
              const x = b.props?.x, y = b.props?.y
              const txt = b.props?.text || ''
              if (typeof x === 'number' && typeof y === 'number') doc.text(txt, x, y)
              else doc.text(txt)
              doc.fillColor('#2d3436')
            } else if (b.type === 'dynamic_text') {
              if (b.props?.color) doc.fillColor(b.props.color)
              doc.fontSize(b.props?.size || b.props?.fontSize || 12)
              const x = b.props?.x, y = b.props?.y
              const txt = resolveText(b.props?.text || '')
              if (typeof x === 'number' && typeof y === 'number') doc.text(txt, x, y)
              else doc.text(txt)
              doc.fillColor('#2d3436')
            } else if (b.type === 'image' && b.props?.url) {
              try {
                const r = await axios.get(b.props.url, { responseType: 'arraybuffer' })
                const buf = Buffer.from(r.data)
                const options: any = {}
                if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') { options.x = b.props.x; options.y = b.props.y }
                if (typeof b.props?.width === 'number' && typeof b.props?.height === 'number') { options.width = b.props.width; options.height = b.props.height }
                doc.image(buf, options.width ? options : undefined)
              } catch {}
            } else if (b.type === 'rect') {
              const x = b.props?.x || 50, y = b.props?.y || 50
              const w = b.props?.width || 100, h = b.props?.height || 50
              if (b.props?.color && b.props.color !== 'transparent') { doc.fillColor(b.props.color); doc.rect(x, y, w, h).fill() }
              if (b.props?.stroke) { doc.strokeColor(b.props.stroke); doc.lineWidth(b.props?.strokeWidth || 1); doc.rect(x, y, w, h).stroke(); doc.strokeColor('#000') }
              doc.fillColor('#2d3436')
            } else if (b.type === 'circle') {
              const r = b.props?.radius || 40
              const x = (b.props?.x || 50) + r
              const y = (b.props?.y || 50) + r
              if (b.props?.color && b.props.color !== 'transparent') { doc.fillColor(b.props.color); doc.circle(x, y, r).fill() }
              if (b.props?.stroke) { doc.strokeColor(b.props.stroke); doc.lineWidth(b.props?.strokeWidth || 1); doc.circle(x, y, r).stroke(); doc.strokeColor('#000') }
              doc.fillColor('#2d3436')
            } else if (b.type === 'line') {
              const x = b.props?.x || 50, y = b.props?.y || 50
              const x2 = b.props?.x2 || 100, y2 = b.props?.y2 || 0
              doc.moveTo(x, y).lineTo(x + x2, y + y2)
              if (b.props?.stroke) doc.strokeColor(b.props.stroke)
              doc.lineWidth(b.props?.strokeWidth || 1).stroke()
              doc.strokeColor('#000')
            } else if (b.type === 'arrow') {
              const x = b.props?.x || 50, y = b.props?.y || 50
              const x2 = b.props?.x2 || 100, y2 = b.props?.y2 || 0
              const color = b.props?.stroke || '#6c5ce7'
              doc.strokeColor(color).moveTo(x, y).lineTo(x + x2, y + y2).lineWidth(b.props?.strokeWidth || 2).stroke()
              doc.fillColor(color)
              const ax = x + x2, ay = y + y2
              doc.moveTo(ax, ay).lineTo(ax - 12, ay - 8).lineTo(ax - 12, ay + 8).fill()
              doc.fillColor('#2d3436').strokeColor('#000')
            } else if (b.type === 'qr') {
              try {
                const url = `https://api.qrserver.com/v1/create-qr-code/?size=${b.props?.width || 120}x${b.props?.height || 120}&data=${encodeURIComponent(b.props?.url || '')}`
                const r = await axios.get(url, { responseType: 'arraybuffer' })
                const buf = Buffer.from(r.data)
                const options: any = {}
                if (typeof b.props?.x === 'number' && typeof b.props?.y === 'number') { options.x = b.props.x; options.y = b.props.y }
                doc.image(buf, options)
              } catch {}
            } else if (b.type === 'student_info') {
              const fields: string[] = b.props?.fields || ['name','class']
              const x = b.props?.x, y = b.props?.y
              const lines: string[] = []
              if (fields.includes('name')) lines.push(`${s.firstName} ${s.lastName}`)
              if (fields.includes('class')) lines.push(`Classe: ${enrollments[0] ? enrollments[0].classId : ''}`)
              if (fields.includes('dob')) lines.push(`Naissance: ${new Date(s.dateOfBirth).toLocaleDateString()}`)
              if (b.props?.color) doc.fillColor(b.props.color)
              doc.fontSize(b.props?.size || b.props?.fontSize || 12)
              const text = lines.join('\n')
              if (typeof x === 'number' && typeof y === 'number') doc.text(text, x, y)
              else doc.text(text)
              doc.fillColor('#2d3436')
            } else if (b.type === 'category_title' && b.props?.categoryId) {
              const cat = categories.find((c: any) => String(c._id) === b.props.categoryId)
              if (cat) {
                doc.fontSize(b.props?.size || b.props?.fontSize || 16)
                if (b.props?.color) doc.fillColor(b.props.color)
                const x = b.props?.x, y = b.props?.y
                if (typeof x === 'number' && typeof y === 'number') doc.text(cat.name, x, y)
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
              if (typeof x === 'number' && typeof y === 'number') doc.text(text, x, y)
              else doc.text(text)
              doc.fillColor('#2d3436')
            } else if (b.type === 'signature') {
              const labels: string[] = b.props?.labels || ['Directeur','Enseignant','Parent']
              let x = b.props?.x, y = b.props?.y
              for (const lab of labels) {
                const sig = sigMap.get(lab)
                doc.fontSize(b.props?.size || b.props?.fontSize || 12).fillColor('#2d3436')
                if (typeof x === 'number' && typeof y === 'number') {
                  doc.text(`${lab}:`, x, y)
                  y += 16
                  if (sig?.url) {
                    try {
                      const r = await axios.get(String(sig.url).startsWith('http') ? sig.url : `http://localhost:4000${sig.url}`, { responseType: 'arraybuffer' })
                      const buf = Buffer.from(r.data)
                      doc.image(buf, x, y, { width: 160 })
                      y += 100
                    } catch {
                      doc.text(`______________________________`, x, y); y += 18
                    }
                  } else if (sig?.dataUrl) {
                    try {
                      const base64 = String(sig.dataUrl).split(',').pop() || ''
                      const buf = Buffer.from(base64, 'base64')
                      doc.image(buf, x, y, { width: 160 })
                      y += 100
                    } catch {
                      doc.text(`______________________________`, x, y); y += 18
                    }
                  } else {
                    doc.text(`______________________________`, x, y); y += 18
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
            } else if (b.type === 'language_toggle') {
              const items: any[] = b.props?.items || []
              const r2 = b.props?.radius || 40
              const size2 = r2 * 2
              const spacing2 = b.props?.spacing || 12
              let x = b.props?.x || 50
              const y = b.props?.y || 50
              for (const it of items) {
                doc.save()
                doc.circle(x + r2, y + r2, r2).fill('#ddd')
                if (it?.logo) {
                  try {
                    const url = String(it.logo).startsWith('http') ? it.logo : `http://localhost:4000${it.logo}`
                    const rimg = await axios.get(url, { responseType: 'arraybuffer' })
                    const buf = Buffer.from(rimg.data)
                    doc.image(buf, x, y, { width: size2, height: size2 })
                  } catch {}
                }
                if (!it?.active) {
                  doc.opacity(0.4)
                  doc.rect(x, y, size2, size2).fill('#000')
                  doc.opacity(1)
                }
                doc.restore()
              x += size2 + spacing2
            }
            } else if (b.type === 'table') {
              const x0 = b.props?.x || 50, y0 = b.props?.y || 50
              const cols: number[] = b.props?.columnWidths || []
              const rows: number[] = b.props?.rowHeights || []
              const cells: any[][] = b.props?.cells || []
              const colOffsets: number[] = [0]
              for (let i = 0; i < cols.length; i++) colOffsets[i + 1] = colOffsets[i] + (cols[i] || 0)
              const rowOffsets: number[] = [0]
              for (let i = 0; i < rows.length; i++) rowOffsets[i + 1] = rowOffsets[i] + (rows[i] || 0)
              for (let ri = 0; ri < rows.length; ri++) {
                for (let ci = 0; ci < cols.length; ci++) {
                  const cell = cells?.[ri]?.[ci] || {}
                  const cx = x0 + colOffsets[ci]
                  const cy = y0 + rowOffsets[ri]
                  const w = cols[ci] || 0
                  const h = rows[ri] || 0
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
              }
            }
          }
          for (let i = 0; i < (tpl.pages || []).length; i++) {
            const page = (tpl.pages as any[])[i]
            if (i > 0) doc.addPage()
            if (page?.bgColor) {
              const m = doc.page.margins
              const w = doc.page.width
              const h = doc.page.height
              doc.save()
              doc.fillColor(page.bgColor)
              doc.rect(m.left, m.top, w - m.left - m.right, h - m.top - m.bottom).fill()
              doc.restore()
            }
            if (page?.title) doc.fontSize(18).fillColor('#333').text(page.title)
            const blocksOrdered = [...(page?.blocks || [])].sort((a: any, b: any) => ((a?.props?.z ?? 0) - (b?.props?.z ?? 0)))
            for (const b of blocksOrdered) {
              await drawBlock(b)
              if (!b.props?.x && !b.props?.y) doc.moveDown(0.4)
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
