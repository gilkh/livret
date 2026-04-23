import { Router } from 'express'
import fs from 'fs'
import { Types } from 'mongoose'
import archiver from 'archiver'
import { requireAuth } from '../auth'
import { ExportedGradebookBatch } from '../models/ExportedGradebookBatch'
import { createSmtpTransporter, getSmtpSettings } from './settings'
import { Setting } from '../models/Setting'
import { resolveGradebookExportPath } from '../utils/gradebookExportStorage'

export const gradebookExportsRouter = Router()

type EmailPreviewOptions = {
  includeFather: boolean
  includeMother: boolean
  includeStudent: boolean
  customMessage: string
  selectedFileIds: string[]
}

type EmailJobStatus = 'queued' | 'running' | 'completed' | 'failed'
type EmailJobItemStatus = 'pending' | 'sent' | 'skipped' | 'failed'
type EmailJobItem = {
  fileId: string
  studentId: string
  studentName: string
  recipients: string[]
  status: EmailJobItemStatus
  error?: string
}
type EmailJobState = {
  id: string
  batchId: string
  createdBy: string
  status: EmailJobStatus
  totalItems: number
  processedItems: number
  sentItems: number
  skippedItems: number
  failedItems: number
  startedAt: number
  updatedAt: number
  completedAt?: number
  options: EmailPreviewOptions
  items: EmailJobItem[]
  error?: string
}

const emailJobStore = new Map<string, EmailJobState>()
const EMAIL_JOB_TTL_MS = 1000 * 60 * 60

const scheduleEmailJobCleanup = (jobId: string) => {
  setTimeout(() => {
    emailJobStore.delete(jobId)
  }, EMAIL_JOB_TTL_MS)
}

const isAdminRole = (role: string) => role === 'ADMIN' || role === 'SUBADMIN'

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const sanitizeArchiveSegment = (value: string, fallback = 'Sans valeur') => {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

const sanitizeDownloadFileName = (value: string, fallback = 'export.zip') => {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

const getOwnedBatch = async (req: any, batchId: string) => {
  const batch = await ExportedGradebookBatch.findById(batchId).lean()
  if (!batch) return null

  if (isAdminRole(String(req.user?.role || ''))) return batch
  if (String(batch.createdBy) !== String(req.user?.userId || '')) return null

  return batch
}

const buildRecipients = (file: any, options: EmailPreviewOptions) => {
  const recipients: string[] = []
  const pushIfValid = (raw: unknown) => {
    const normalized = normalizeEmail(raw)
    if (!normalized || !isValidEmail(normalized) || recipients.includes(normalized)) return
    recipients.push(normalized)
  }

  if (options.includeFather) pushIfValid(file?.emails?.father)
  if (options.includeMother) pushIfValid(file?.emails?.mother)
  if (options.includeStudent) pushIfValid(file?.emails?.student)

  return recipients
}

const buildEmailContent = async (batch: any, file: any, options: EmailPreviewOptions) => {
  const settings = await Setting.find({
    key: { $in: ['school_name', 'smtp_from_name', 'smtp_from_email'] }
  }).lean()

  const settingsMap = settings.reduce<Record<string, unknown>>((acc, entry: any) => {
    acc[String(entry.key)] = entry.value
    return acc
  }, {})

  const schoolName = String(settingsMap.school_name || 'Votre école').trim() || 'Votre école'
  const senderName = String(settingsMap.smtp_from_name || schoolName).trim() || schoolName
  const yearName = String(file?.yearName || '').trim()
  const level = String(file?.level || '').trim()
  const className = String(file?.className || '').trim()
  const studentName = `${String(file?.firstName || '').trim()} ${String(file?.lastName || '').trim()}`.trim() || 'Élève'
  const extraMessage = String(options.customMessage || '').trim()

  const subjectParts = [`Carnet scolaire de ${studentName}`]
  if (yearName) subjectParts.push(yearName)
  const subject = subjectParts.join(' - ')

  const details: string[] = []
  if (yearName) details.push(`Année scolaire : ${yearName}`)
  if (level) details.push(`Niveau : ${level}`)
  if (className) details.push(`Classe : ${className}`)

  const schoolNameHtml = escapeHtml(schoolName)
  const senderNameHtml = escapeHtml(senderName)
  const studentNameHtml = escapeHtml(studentName)
  const detailsHtml = details.map((detail) => escapeHtml(detail))
  const extraMessageHtml = escapeHtml(extraMessage)

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 680px; margin: 0 auto; background: #ffffff;">
      <div style="padding: 24px 28px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #eff6ff, #f8fafc);">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; margin-bottom: 8px;">${schoolNameHtml}</div>
        <h1 style="margin: 0; font-size: 24px; color: #0f172a;">Carnet scolaire</h1>
        <p style="margin: 10px 0 0; font-size: 15px; color: #334155;">Veuillez trouver en pièce jointe le carnet de <strong>${studentNameHtml}</strong>.</p>
      </div>
      <div style="padding: 24px 28px;">
        ${details.length > 0 ? `<ul style="padding-left: 18px; margin: 0 0 18px; color: #334155;">${detailsHtml.map((detail) => `<li style="margin-bottom: 6px;">${detail}</li>`).join('')}</ul>` : ''}
        ${extraMessage ? `<div style="padding: 14px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; color: #334155; white-space: pre-wrap; margin-bottom: 18px;">${extraMessageHtml}</div>` : ''}
        <p style="margin: 0; color: #475569; line-height: 1.6;">Ce message a été envoyé depuis l’espace sous-admin afin de partager le carnet PDF déjà exporté sur le serveur.</p>
      </div>
      <div style="padding: 18px 28px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">
        ${senderNameHtml}
      </div>
    </div>
  `.trim()

  const textLines = [
    schoolName,
    '',
    `Carnet scolaire de ${studentName}`,
    ...details,
    '',
    'Veuillez trouver le carnet PDF en pièce jointe.',
  ]
  if (extraMessage) {
    textLines.push('', extraMessage)
  }
  textLines.push('', senderName)

  return {
    subject,
    html,
    text: textLines.join('\n'),
    fromName: senderName,
    fromEmail: String(settingsMap.smtp_from_email || '').trim()
  }
}

const runEmailJob = async (jobId: string) => {
  const job = emailJobStore.get(jobId)
  if (!job) return

  job.status = 'running'
  job.updatedAt = Date.now()

  try {
    const batch = await ExportedGradebookBatch.findById(job.batchId).lean()
    if (!batch) throw new Error('batch_not_found')

    const transporter = await createSmtpTransporter()
    if (!transporter) throw new Error('smtp_not_configured')

    const smtpSettings = await getSmtpSettings()

    for (const item of job.items) {
      const liveJob = emailJobStore.get(jobId)
      if (!liveJob) return

      const file = batch.files.find((entry: any) => String(entry._id) === item.fileId)
      if (!file) {
        item.status = 'failed'
        item.error = 'Fichier exporté introuvable'
        liveJob.processedItems += 1
        liveJob.failedItems += 1
        liveJob.updatedAt = Date.now()
        continue
      }

      if (item.recipients.length === 0) {
        item.status = 'skipped'
        item.error = 'Aucune adresse email valide'
        liveJob.processedItems += 1
        liveJob.skippedItems += 1
        liveJob.updatedAt = Date.now()
        continue
      }

      try {
        const emailContent = await buildEmailContent(batch, file, liveJob.options)
        const absolutePath = resolveGradebookExportPath(String(file.relativePath || ''))
        await transporter.sendMail({
          from: emailContent.fromEmail ? `"${emailContent.fromName}" <${emailContent.fromEmail}>` : smtpSettings.user,
          to: item.recipients.join(', '),
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
          attachments: [
            {
              filename: String(file.fileName || 'carnet.pdf'),
              path: absolutePath
            }
          ]
        })

        item.status = 'sent'
        delete item.error
        liveJob.processedItems += 1
        liveJob.sentItems += 1
        liveJob.updatedAt = Date.now()
      } catch (error: any) {
        item.status = 'failed'
        item.error = String(error?.message || 'email_send_failed')
        liveJob.processedItems += 1
        liveJob.failedItems += 1
        liveJob.updatedAt = Date.now()
      }
    }

    job.status = job.failedItems > 0 ? 'completed' : 'completed'
    job.completedAt = Date.now()
    job.updatedAt = Date.now()
    scheduleEmailJobCleanup(jobId)
  } catch (error: any) {
    job.status = 'failed'
    job.error = String(error?.message || 'email_job_failed')
    job.completedAt = Date.now()
    job.updatedAt = Date.now()
    scheduleEmailJobCleanup(jobId)
  }
}

gradebookExportsRouter.get('/batches', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const reqAny = req as any
    const query: Record<string, unknown> = {}
    if (!isAdminRole(String(reqAny.user?.role || ''))) {
      query.createdBy = String(reqAny.user?.userId || '')
    }

    const batches = await ExportedGradebookBatch.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()

    res.json(batches)
  } catch (error: any) {
    res.status(500).json({ error: 'fetch_failed', message: error.message })
  }
})

gradebookExportsRouter.get('/batches/:batchId', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const batch = await getOwnedBatch(req, String(req.params.batchId || ''))
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })
    res.json(batch)
  } catch (error: any) {
    res.status(500).json({ error: 'fetch_failed', message: error.message })
  }
})

gradebookExportsRouter.get('/batches/:batchId/files/:fileId/pdf', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const batch = await getOwnedBatch(req, String(req.params.batchId || ''))
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })

    const file = batch.files.find((entry: any) => String(entry._id) === String(req.params.fileId || ''))
    if (!file) return res.status(404).json({ error: 'file_not_found' })

    const absolutePath = resolveGradebookExportPath(String(file.relativePath || ''))
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'pdf_not_found' })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${String(file.fileName || 'carnet.pdf').replace(/"/g, '')}"`)
    fs.createReadStream(absolutePath).pipe(res)
  } catch (error: any) {
    res.status(500).json({ error: 'pdf_read_failed', message: error.message })
  }
})

gradebookExportsRouter.get('/batches/:batchId/files/:fileId/download', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const batch = await getOwnedBatch(req, String(req.params.batchId || ''))
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })

    const file = batch.files.find((entry: any) => String(entry._id) === String(req.params.fileId || ''))
    if (!file) return res.status(404).json({ error: 'file_not_found' })

    const absolutePath = resolveGradebookExportPath(String(file.relativePath || ''))
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'pdf_not_found' })

    const safeName = sanitizeDownloadFileName(String(file.fileName || 'carnet.pdf'), 'carnet.pdf')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName.replace(/"/g, '')}"`)
    fs.createReadStream(absolutePath).pipe(res)
  } catch (error: any) {
    res.status(500).json({ error: 'pdf_download_failed', message: error.message })
  }
})

gradebookExportsRouter.post('/batches/:batchId/download', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const batch = await getOwnedBatch(req, String(req.params.batchId || ''))
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })

    const selectedFileIds = Array.isArray(req.body?.selectedFileIds)
      ? req.body.selectedFileIds.map((id: unknown) => String(id))
      : []

    const files = selectedFileIds.length > 0
      ? batch.files.filter((file: any) => selectedFileIds.includes(String(file._id)))
      : batch.files

    if (files.length === 0) {
      return res.status(400).json({ error: 'no_files_selected' })
    }

    const zipNameBase = batch.groupLabel || batch.archiveFileName || `carnets-${String(batch._id)}`
    const zipName = sanitizeDownloadFileName(String(zipNameBase).replace(/\.zip$/i, ''), 'carnets')
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}.zip"`)

    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.on('error', (error: any) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'zip_failed', message: String(error?.message || 'zip_failed') })
      } else {
        res.destroy(error)
      }
    })
    archive.pipe(res)

    let missingIndex = 0
    for (const file of files as any[]) {
      const absolutePath = resolveGradebookExportPath(String(file.relativePath || ''))
      if (!fs.existsSync(absolutePath)) {
        missingIndex += 1
        archive.append(`Fichier introuvable sur le serveur: ${String(file.fileName || 'carnet.pdf')}\n`, {
          name: `errors/missing-${missingIndex}.txt`
        })
        continue
      }

      const yearDir = sanitizeArchiveSegment(String(file.yearName || ''), 'Sans annee')
      const levelDir = sanitizeArchiveSegment(String(file.level || ''), 'Sans niveau')
      const classDir = sanitizeArchiveSegment(String(file.className || ''), 'Sans classe')
      const safeFileName = sanitizeDownloadFileName(String(file.fileName || 'carnet.pdf'), 'carnet.pdf')
      archive.file(absolutePath, { name: `${yearDir}/${levelDir}/${classDir}/${safeFileName}` })
    }

    await archive.finalize()
  } catch (error: any) {
    res.status(500).json({ error: 'download_failed', message: error.message })
  }
})

gradebookExportsRouter.post('/batches/:batchId/email-preview', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const batch = await getOwnedBatch(req, String(req.params.batchId || ''))
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })

    const options: EmailPreviewOptions = {
      includeFather: req.body?.includeFather !== false,
      includeMother: req.body?.includeMother !== false,
      includeStudent: req.body?.includeStudent !== false,
      customMessage: String(req.body?.customMessage || ''),
      selectedFileIds: Array.isArray(req.body?.selectedFileIds) ? req.body.selectedFileIds.map((id: unknown) => String(id)) : []
    }

    const selectedFiles = (options.selectedFileIds.length > 0
      ? batch.files.filter((file: any) => options.selectedFileIds.includes(String(file._id)))
      : batch.files)

    if (selectedFiles.length === 0) {
      return res.status(400).json({ error: 'no_files_selected' })
    }

    const previewFile = selectedFiles[0]
    const recipients = buildRecipients(previewFile, options)
    const emailContent = await buildEmailContent(batch, previewFile, options)

    const totalRecipients = selectedFiles.reduce((acc: number, file: any) => acc + buildRecipients(file, options).length, 0)

    res.json({
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      previewFile: {
        fileId: previewFile._id,
        studentName: `${String(previewFile.firstName || '').trim()} ${String(previewFile.lastName || '').trim()}`.trim(),
        fileName: previewFile.fileName
      },
      sampleRecipients: recipients,
      selectedFileCount: selectedFiles.length,
      totalRecipientCount: totalRecipients
    })
  } catch (error: any) {
    res.status(500).json({ error: 'preview_failed', message: error.message })
  }
})

gradebookExportsRouter.post('/batches/:batchId/send', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const reqAny = req as any
    const batch = await getOwnedBatch(req, String(req.params.batchId || ''))
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })

    const smtp = await getSmtpSettings()
    if (!smtp.host || !smtp.user || !smtp.pass) {
      return res.status(400).json({ error: 'smtp_not_configured', message: 'SMTP non configuré' })
    }

    const options: EmailPreviewOptions = {
      includeFather: req.body?.includeFather !== false,
      includeMother: req.body?.includeMother !== false,
      includeStudent: req.body?.includeStudent !== false,
      customMessage: String(req.body?.customMessage || ''),
      selectedFileIds: Array.isArray(req.body?.selectedFileIds) ? req.body.selectedFileIds.map((id: unknown) => String(id)) : []
    }

    const selectedFiles = (options.selectedFileIds.length > 0
      ? batch.files.filter((file: any) => options.selectedFileIds.includes(String(file._id)))
      : batch.files)

    if (selectedFiles.length === 0) {
      return res.status(400).json({ error: 'no_files_selected' })
    }

    const jobId = new Types.ObjectId().toString()
    const items: EmailJobItem[] = selectedFiles.map((file: any) => ({
      fileId: String(file._id),
      studentId: String(file.studentId || ''),
      studentName: `${String(file.firstName || '').trim()} ${String(file.lastName || '').trim()}`.trim(),
      recipients: buildRecipients(file, options),
      status: 'pending'
    }))

    const jobState: EmailJobState = {
      id: jobId,
      batchId: String(batch._id),
      createdBy: String(reqAny.user?.userId || ''),
      status: 'queued',
      totalItems: items.length,
      processedItems: 0,
      sentItems: 0,
      skippedItems: 0,
      failedItems: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      options,
      items
    }

    emailJobStore.set(jobId, jobState)
    void runEmailJob(jobId)

    res.json({ jobId })
  } catch (error: any) {
    res.status(500).json({ error: 'send_failed', message: error.message })
  }
})

gradebookExportsRouter.get('/email-jobs/:jobId', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  const reqAny = req as any
  const job = emailJobStore.get(String(req.params.jobId || ''))
  if (!job) return res.status(404).json({ error: 'job_not_found' })

  if (!isAdminRole(String(reqAny.user?.role || '')) && String(job.createdBy) !== String(reqAny.user?.userId || '')) {
    return res.status(403).json({ error: 'forbidden' })
  }

  res.json(job)
})
