import { Router } from 'express'
import fs from 'fs'
import mongoose from 'mongoose'
import archiver from 'archiver'
import { requireAuth } from '../auth'
import { ExportedGradebookBatch } from '../models/ExportedGradebookBatch'
import { createSmtpTransporter, getSmtpSettings } from './settings'
import { Setting } from '../models/Setting'
import { resolveGradebookExportPath } from '../utils/gradebookExportStorage'
import { EmailJob } from '../models/EmailJob'

export const gradebookExportsRouter = Router()

type EmailJobOptions = {
  includeFather: boolean
  includeMother: boolean
  includeStudent: boolean
  customMessage: string
  selectedFileIds?: string[]
  testEmailOverride?: string
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

const buildRecipients = (file: any, options: EmailJobOptions) => {
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

const buildEmailContent = async (batch: any, file: any, options: EmailJobOptions) => {
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
    <div style="font-family: 'Inter', Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
      <div style="padding: 32px 40px; background: linear-gradient(135deg, #2563eb, #3b82f6); color: #ffffff;">
        <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.9; margin-bottom: 8px;">${schoolNameHtml}</div>
        <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;">Votre carnet scolaire</h1>
      </div>
      <div style="padding: 40px; line-height: 1.6;">
        <p style="margin: 0 0 24px; font-size: 16px;">Bonjour,</p>
        <p style="margin: 0 0 24px; font-size: 16px;">Veuillez trouver en pièce jointe le carnet scolaire de <strong>${studentNameHtml}</strong>.</p>
        
        ${details.length > 0 ? `
        <div style="background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #f1f5f9; margin-bottom: 24px;">
          <ul style="padding: 0; margin: 0; list-style: none; font-size: 14px; color: #475569;">
            ${detailsHtml.map((detail) => `<li style="margin-bottom: 8px; display: flex; align-items: center;"><span style="width: 6px; height: 6px; background: #3b82f6; border-radius: 50%; display: inline-block; margin-right: 10px;"></span>${detail}</li>`).join('')}
          </ul>
        </div>` : ''}

        ${extraMessage ? `<div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px 20px; border-radius: 4px; color: #92400e; font-size: 15px; margin-bottom: 24px;">${extraMessageHtml}</div>` : ''}
        
        <p style="margin: 0; font-size: 15px; color: #64748b;">Merci de votre confiance.</p>
      </div>
      <div style="padding: 24px 40px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 13px; color: #94a3b8;">
        Ce carnet est un document officiel exporté depuis votre portail scolaire.
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
  if (extraMessage) textLines.push('', extraMessage)
  textLines.push('', senderName)

  return {
    subject,
    html,
    text: textLines.join('\n'),
    fromName: senderName,
    fromEmail: String(settingsMap.smtp_from_email || '').trim(),
    recipients: buildRecipients(file, options)
  }
}

async function runEmailJob(jobId: string, batch: any, files: any[], options: EmailJobOptions) {
  try {
    const transporter = await createSmtpTransporter()
    if (!transporter) throw new Error('SMTP not configured')

    const smtpSettings = await getSmtpSettings()

    for (const file of files) {
      const item: any = {
        fileId: file._id,
        studentName: `${file.firstName} ${file.lastName}`,
        recipients: [],
        status: 'pending'
      }

      try {
        const emailContent = await buildEmailContent(batch, file, options)

        let recipients = emailContent.recipients
        if (options.testEmailOverride) {
          recipients = [options.testEmailOverride]
        }

        item.recipients = recipients

        if (recipients.length === 0) {
          item.status = 'skipped'
          item.error = 'Aucun destinataire valide trouvé'
        } else {
          const absolutePath = resolveGradebookExportPath(file.relativePath)
          
          await transporter.sendMail({
            from: emailContent.fromEmail ? `"${emailContent.fromName}" <${emailContent.fromEmail}>` : smtpSettings.user,
            to: recipients.join(', '),
            subject: options.testEmailOverride ? `[TEST] ${emailContent.subject}` : emailContent.subject,
            text: emailContent.text,
            html: emailContent.html,
            attachments: [
              {
                filename: file.fileName,
                path: absolutePath
              }
            ]
          })
          item.status = 'sent'
        }
      } catch (err: any) {
        item.status = 'failed'
        item.error = err.message
      }

      await EmailJob.updateOne(
        { _id: jobId },
        { 
          $push: { items: item },
          $inc: { 
            processedItems: 1,
            sentItems: item.status === 'sent' ? 1 : 0,
            failedItems: item.status === 'failed' ? 1 : 0,
            skippedItems: item.status === 'skipped' ? 1 : 0
          }
        }
      )
    }

    await EmailJob.updateOne({ _id: jobId }, { status: 'completed', completedAt: new Date() })
  } catch (error: any) {
    await EmailJob.updateOne({ _id: jobId }, { status: 'failed', error: error.message, completedAt: new Date() })
  }
}

// ROUTES
gradebookExportsRouter.get('/batches', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const reqAny = req as any
    const query: Record<string, unknown> = {}
    if (!isAdminRole(String(reqAny.user?.role || ''))) {
      query.createdBy = String(reqAny.user?.userId || '')
    }
    const batches = await ExportedGradebookBatch.find(query).sort({ createdAt: -1 }).limit(100).lean()
    res.json(batches)
  } catch (error: any) {
    res.status(500).json({ error: 'fetch_failed', message: error.message })
  }
})

gradebookExportsRouter.post('/batches/:batchId/download', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const batch = await getOwnedBatch(req, String(req.params.batchId || ''))
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })

    const selectedFileIds = Array.isArray(req.body?.selectedFileIds) ? req.body.selectedFileIds.map((id: unknown) => String(id)) : []
    const files = selectedFileIds.length > 0 ? batch.files.filter((file: any) => selectedFileIds.includes(String(file._id))) : batch.files

    if (files.length === 0) return res.status(400).json({ error: 'no_files_selected' })

    const zipName = sanitizeDownloadFileName(batch.groupLabel || batch.archiveFileName || 'exports', 'exports.zip')
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}.zip"`)

    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.pipe(res)

    for (const file of files as any[]) {
      const absolutePath = resolveGradebookExportPath(String(file.relativePath || ''))
      if (fs.existsSync(absolutePath)) {
        const yearDir = sanitizeArchiveSegment(String(file.yearName || ''), 'Sans annee')
        const levelDir = sanitizeArchiveSegment(String(file.level || ''), 'Sans niveau')
        const classDir = sanitizeArchiveSegment(String(file.className || ''), 'Sans classe')
        const safeFileName = sanitizeDownloadFileName(String(file.fileName || 'carnet.pdf'), 'carnet.pdf')
        archive.file(absolutePath, { name: `${yearDir}/${levelDir}/${classDir}/${safeFileName}` })
      }
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

    const options: EmailJobOptions = {
      includeFather: req.body?.includeFather !== false,
      includeMother: req.body?.includeMother !== false,
      includeStudent: req.body?.includeStudent !== false,
      customMessage: String(req.body?.customMessage || ''),
      selectedFileIds: Array.isArray(req.body?.selectedFileIds) ? req.body.selectedFileIds.map((id: unknown) => String(id)) : []
    }

    const selectedFiles = (options.selectedFileIds && options.selectedFileIds.length > 0
      ? batch.files.filter((file: any) => options.selectedFileIds!.includes(String(file._id)))
      : batch.files)

    if (selectedFiles.length === 0) return res.status(400).json({ error: 'no_files_selected' })

    const previewFile = selectedFiles[0]
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
      sampleRecipients: emailContent.recipients,
      selectedFileCount: selectedFiles.length,
      totalRecipientCount: totalRecipients
    })
  } catch (error: any) {
    res.status(500).json({ error: 'preview_failed', message: error.message })
  }
})

gradebookExportsRouter.post('/batches/:batchId/send', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const { selectedFileIds, includeFather, includeMother, includeStudent, customMessage, testEmailOverride } = req.body
    const batch = await getOwnedBatch(req, String(req.params.batchId || ''))
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })

    const files = selectedFileIds && selectedFileIds.length > 0 
      ? batch.files.filter((f: any) => selectedFileIds.includes(String(f._id)))
      : batch.files

    if (files.length === 0) return res.status(400).json({ error: 'no_files_selected' })

    const jobId = new mongoose.Types.ObjectId().toString()
    const job = new EmailJob({
      _id: jobId,
      batchId: batch._id,
      createdBy: (req as any).user.id || (req as any).user.userId,
      creatorName: (req as any).user.displayName || (req as any).user.email,
      totalItems: files.length,
      status: 'running',
      isTest: !!testEmailOverride,
      options: {
        includeFather,
        includeMother,
        includeStudent,
        customMessage,
        selectedFileIds: selectedFileIds || []
      }
    })
    await job.save()

    runEmailJob(jobId, batch, files, { includeFather, includeMother, includeStudent, customMessage, selectedFileIds, testEmailOverride })
    res.json({ jobId })
  } catch (error: any) {
    res.status(500).json({ error: 'send_failed', message: error.message })
  }
})

gradebookExportsRouter.get('/batches/:batchId/email-jobs', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const batch = await getOwnedBatch(req, String(req.params.batchId || ''))
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })
    const jobs = await EmailJob.find({ batchId: batch._id }).sort({ createdAt: -1 }).lean()
    res.json(jobs)
  } catch (error: any) {
    res.status(500).json({ error: 'fetch_jobs_failed', message: error.message })
  }
})

gradebookExportsRouter.get('/email-jobs/:jobId', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const job = await EmailJob.findById(req.params.jobId).lean()
    if (!job) return res.status(404).json({ error: 'job_not_found' })
    res.json(job)
  } catch (error: any) {
    res.status(500).json({ error: 'fetch_job_failed', message: error.message })
  }
})

gradebookExportsRouter.delete('/batches/:batchId', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const batch = await ExportedGradebookBatch.findById(req.params.batchId)
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })
    await ExportedGradebookBatch.findByIdAndDelete(req.params.batchId)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: 'delete_failed', message: error.message })
  }
})

gradebookExportsRouter.delete('/batches/:batchId/files/:fileId', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const batch = await ExportedGradebookBatch.findById(req.params.batchId)
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })
    const fileIndex = batch.files.findIndex(f => String(f._id) === req.params.fileId)
    if (fileIndex === -1) return res.status(404).json({ error: 'file_not_found' })
    batch.files.splice(fileIndex, 1)
    batch.exportedCount = Math.max(0, batch.exportedCount - 1)
    if (batch.files.length === 0) {
      await ExportedGradebookBatch.findByIdAndDelete(batch._id)
      res.json({ success: true, batchDeleted: true })
    } else {
      await batch.save()
      res.json({ success: true, batchDeleted: false })
    }
  } catch (error: any) {
    res.status(500).json({ error: 'delete_failed', message: error.message })
  }
})
