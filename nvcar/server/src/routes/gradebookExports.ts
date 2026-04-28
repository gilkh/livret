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
import { EmailTemplate } from '../models/EmailTemplate'

export const gradebookExportsRouter = Router()

type EmailJobOptions = {
  includeFather: boolean
  includeMother: boolean
  includeStudent: boolean
  customMessage: string
  selectedFileIds?: string[]
  testEmailOverride?: string
  templateId?: string
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

  // Find a matching template
  let matchingTemplate = null
  
  if (options.templateId) {
    matchingTemplate = await EmailTemplate.findById(options.templateId).lean()
  }

  if (!matchingTemplate) {
    matchingTemplate = await EmailTemplate.findOne({
      $or: [
        { linkedLevels: level },
        { linkedClasses: className }
      ]
    }).lean()
  }

  if (!matchingTemplate) {
    matchingTemplate = await EmailTemplate.findOne({
      linkedLevels: { $size: 0 },
      linkedClasses: { $size: 0 }
    }).lean()
  }

  let finalSubject = subject
  let finalHtml = ''

  if (matchingTemplate) {
    const replacements: Record<string, string> = {
      '{{studentName}}': studentNameHtml,
      '{{yearName}}': escapeHtml(yearName),
      '{{level}}': escapeHtml(level),
      '{{className}}': escapeHtml(className),
      '{{schoolName}}': schoolNameHtml,
    }

    finalSubject = matchingTemplate.subject
    finalHtml = matchingTemplate.bodyHtml

    for (const [key, val] of Object.entries(replacements)) {
      finalSubject = finalSubject.replace(new RegExp(key, 'g'), val)
      finalHtml = finalHtml.replace(new RegExp(key, 'g'), val)
    }
  } else {
    finalHtml = `
    <div style="font-family: Arial, sans-serif; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 30px;">
        <div style="font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #4f46e5; margin-bottom: 8px;">${schoolNameHtml}</div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #1e293b;">Carnet Scolaire</h1>
      </div>
      
      <div style="line-height: 1.6;">
        <p style="margin: 0 0 20px; font-size: 16px;">Bonjour,</p>
        <p style="margin: 0 0 25px; font-size: 16px;">Nous vous prions de trouver ci-joint le carnet scolaire de :<br/>
          <strong style="font-size: 18px; color: #1e293b; display: block; margin-top: 5px;">${studentNameHtml}</strong>
        </p>
        
        ${details.length > 0 ? `
        <div style="background-color: #f8fafc; border-radius: 10px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 25px;">
          <table style="width: 100%; border-collapse: collapse;">
            ${details.map((_, idx) => `
              <tr>
                <td style="padding: 5px 0; font-size: 14px; color: #64748b; width: 130px;">${details[idx].split(' : ')[0]}</td>
                <td style="padding: 5px 0; font-size: 14px; font-weight: 700; color: #1e293b;">${details[idx].split(' : ')[1]}</td>
              </tr>
            `).join('')}
          </table>
        </div>` : ''}

        ${extraMessage ? `
        <div style="margin-bottom: 25px; padding: 15px; background-color: #f5f3ff; border-left: 4px solid #4f46e5; color: #4338ca; font-size: 15px;">
          ${escapeHtml(extraMessage)}
        </div>` : ''}
      </div>
    </div>
  `.trim()
  }

  const textLines = [
    `Carnet scolaire de ${studentName}`,
    '',
    `Bonjour,`,
    '',
    `Veuillez trouver ci-joint le carnet scolaire de ${studentName}.`,
    '',
    ...details,
  ]
  if (extraMessage) textLines.push('', extraMessage)

  return {
    subject: finalSubject,
    html: finalHtml,
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

gradebookExportsRouter.post('/zip-files', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const { selectedFileIds, label } = req.body
    if (!Array.isArray(selectedFileIds) || selectedFileIds.length === 0) {
      return res.status(400).json({ error: 'no_files_selected' })
    }

    const batches = await ExportedGradebookBatch.find({
      'files._id': { $in: selectedFileIds }
    }).lean()

    const filesToZip: any[] = []
    selectedFileIds.forEach(id => {
      for (const batch of batches) {
        const f = batch.files.find((file: any) => String(file._id) === String(id))
        if (f) {
          filesToZip.push(f)
          break
        }
      }
    })

    if (filesToZip.length === 0) return res.status(404).json({ error: 'files_not_found' })

    const zipName = sanitizeDownloadFileName(label || 'exports', 'exports.zip')
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}.zip"`)

    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.pipe(res)

    for (const file of filesToZip) {
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

gradebookExportsRouter.get('/batches/:batchId/files/:fileId/download', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const batch = await getOwnedBatch(req, String(req.params.batchId || ''))
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })

    const file = batch.files.find((f: any) => String(f._id) === req.params.fileId)
    if (!file) return res.status(404).json({ error: 'file_not_found' })

    const absolutePath = resolveGradebookExportPath(String(file.relativePath || ''))
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'file_missing_on_disk' })

    res.download(absolutePath, file.fileName)
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
    const { selectedFileIds, includeFather, includeMother, includeStudent, customMessage, testEmailOverride, templateId } = req.body
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
        selectedFileIds: selectedFileIds || [],
        testEmailOverride
      }
    })
    await job.save()

    runEmailJob(jobId, batch, files, { includeFather, includeMother, includeStudent, customMessage, selectedFileIds, testEmailOverride, templateId })
    res.json({ jobId })
  } catch (error: any) {
    res.status(500).json({ error: 'send_failed', message: error.message })
  }
})

gradebookExportsRouter.post('/check-existing', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const { assignmentIds, yearName, semester, highQuality } = req.body
    const targetQuality = highQuality ? 'high' : 'compressed'
    
    if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
      return res.json({ exists: false, count: 0 })
    }

    // Find all batches for this year/semester
    const batches = await ExportedGradebookBatch.find({
      yearName,
      semester
    }).lean()

    const existingStudentIds: string[] = []
    const studentNames: string[] = []

    for (const batch of batches) {
      for (const file of batch.files) {
        if (assignmentIds.includes(String(file.assignmentId))) {
          // If quality matches, we have a direct collision
          if ((file as any).quality === targetQuality) {
            const name = `${file.firstName} ${file.lastName}`
            if (!studentNames.includes(name)) {
              studentNames.push(name)
            }
          }
        }
      }
    }

    res.json({
      exists: studentNames.length > 0,
      count: studentNames.length,
      studentNames: studentNames.slice(0, 10), // Limit for UI preview
      totalCount: studentNames.length
    })
  } catch (error: any) {
    res.status(500).json({ error: 'check_failed', message: error.message })
  }
})

gradebookExportsRouter.get('/email-jobs/mine', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  try {
    const reqAny = req as any
    const query: Record<string, unknown> = {}
    if (!isAdminRole(String(reqAny.user?.role || ''))) {
      query.createdBy = String(reqAny.user?.userId || '')
    }
    const jobs = await EmailJob.find(query).sort({ createdAt: -1 }).limit(200).lean()
    res.json(jobs)
  } catch (error: any) {
    res.status(500).json({ error: 'fetch_mine_failed', message: error.message })
  }
})

gradebookExportsRouter.get('/email-jobs', requireAuth(['ADMIN', 'SUBADMIN']), async (req, res) => {
  try {
    const jobs = await EmailJob.find().sort({ createdAt: -1 }).limit(100).lean()
    res.json(jobs)
  } catch (error: any) {
    res.status(500).json({ error: 'fetch_all_jobs_failed', message: error.message })
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
