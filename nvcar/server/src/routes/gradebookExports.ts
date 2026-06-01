import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import dns from 'dns'
import mongoose from 'mongoose'
import archiver from 'archiver'
import { requireAuth } from '../auth'
import { ExportedGradebookBatch } from '../models/ExportedGradebookBatch'
import { createSmtpTransporter, getSmtpSettings } from './settings'
import { Setting } from '../models/Setting'
import { resolveGradebookExportPath } from '../utils/gradebookExportStorage'
import { EmailJob } from '../models/EmailJob'
import { EmailTemplate } from '../models/EmailTemplate'
import { RoleScope } from '../models/RoleScope'
import { ClassModel } from '../models/Class'
import { SchoolYear } from '../models/SchoolYear'
import { Student } from '../models/Student'
import { TemplateChangeSuggestion } from '../models/TemplateChangeSuggestion'

export const gradebookExportsRouter = Router()

type EmailJobOptions = {
  includeFather: boolean
  includeMother: boolean
  includeStudent: boolean
  customMessage: string
  overrideEmail?: string
  selectedFileIds?: string[]
  testEmailOverride?: string
  templateId?: string
}

const isAdminRole = (role: string) => role === 'ADMIN' || role === 'SUBADMIN' || role === 'AEFE'
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

const hydrateLatestEmails = async (files: any[]) => {
  const studentIds = files.map(f => f.studentId).filter(Boolean)
  if (!studentIds.length) return files

  const students = await Student.find({ _id: { $in: studentIds } }, 'fatherEmail motherEmail studentEmail').lean()
  const studentMap = new Map(students.map(s => [String(s._id), s]))

  return files.map(f => {
    const s = studentMap.get(String(f.studentId))
    if (s) {
      if (!f.emails) f.emails = {}
      f.emails.father = String((s as any).fatherEmail || '')
      f.emails.mother = String((s as any).motherEmail || '')
      f.emails.student = String((s as any).studentEmail || '')
    }
    return f
  })
}

const buildRecipientsWithTypes = (file: any, options: EmailJobOptions) => {
  const recipients: Array<{ email: string, type: 'father' | 'mother' | 'student' | 'override' }> = []
  const pushIfValid = (raw: unknown, type: 'father' | 'mother' | 'student' | 'override') => {
    const normalized = normalizeEmail(raw)
    if (!normalized || !isValidEmail(normalized)) return
    if (recipients.some(r => r.email === normalized)) return
    recipients.push({ email: normalized, type })
  }
  const isOverride = !!(options.overrideEmail && options.selectedFileIds && options.selectedFileIds.length === 1)
  if (isOverride) {
    if (options.includeFather) {
      pushIfValid(options.overrideEmail, 'father')
    } else if (options.includeMother) {
      pushIfValid(options.overrideEmail, 'mother')
    }
  } else {
    if (options.includeFather) {
      pushIfValid(file?.emails?.father, 'father')
    }
    if (options.includeMother) {
      pushIfValid(file?.emails?.mother, 'mother')
    }
    if (options.includeStudent) {
      pushIfValid(file?.emails?.student, 'student')
    }
  }
  return recipients
}

// #10: Load shared email settings once per job (not once per file)
const loadEmailSettings = async () => {
  const settings = await Setting.find({
    key: { $in: ['school_name', 'smtp_from_name', 'smtp_from_email'] }
  }).lean()
  const map = settings.reduce<Record<string, unknown>>((acc, entry: any) => {
    acc[String(entry.key)] = entry.value
    return acc
  }, {})
  const schoolName = String(map.school_name || 'Votre école').trim() || 'Votre école'
  return {
    schoolName,
    senderName: String(map.smtp_from_name || schoolName).trim() || schoolName,
    fromEmail: String(map.smtp_from_email || '').trim()
  }
}

// #10: Resolve template with a per-job cache — at most one DB hit per unique level/class combo
const resolveEmailTemplate = async (
  cache: Map<string, any | null>,
  level: string,
  className: string,
  templateId?: string,
  schoolYearId?: string
): Promise<any | null> => {
  const key = templateId || `${level}::${className}::${schoolYearId || ''}`
  if (cache.has(key)) return cache.get(key) ?? null
  let t: any = null
  if (templateId) t = await EmailTemplate.findById(templateId).lean()
  if (!t) {
    const yearFilter = schoolYearId
      ? { $or: [{ schoolYearId }, { schoolYearId: '' }, { schoolYearId: { $exists: false } }] }
      : {}
    t = await EmailTemplate.findOne({
      $and: [
        { $or: [{ linkedLevels: level }, { linkedClasses: className }] },
        yearFilter,
      ]
    }).lean()
  }
  if (!t) {
    const yearFilter = schoolYearId
      ? { $or: [{ schoolYearId }, { schoolYearId: '' }, { schoolYearId: { $exists: false } }] }
      : {}
    t = await EmailTemplate.findOne({
      $and: [
        { linkedLevels: { $size: 0 }, linkedClasses: { $size: 0 } },
        yearFilter,
      ]
    }).lean()
  }
  cache.set(key, t ?? null)
  return t
}

const getBaseUrl = (req?: any): string => {
  if (process.env.API_URL) {
    return process.env.API_URL
  }
  if (req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http'
    const host = req.headers['x-forwarded-host'] || req.get('host')
    if (host) {
      return `${protocol}://${host}`
    }
  }
  return 'http://localhost:4000'
}

const prepareEmailAttachmentsAndHtml = (html: string, baseAttachments: any[]) => {
  const attachments = [...baseAttachments]
  let modifiedHtml = html

  if (!html) {
    return { html, attachments }
  }

  const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["']/g
  let match
  const processedSources = new Map<string, string>()

  while ((match = imgRegex.exec(html)) !== null) {
    const originalSrc = match[1]
    if (processedSources.has(originalSrc)) {
      continue
    }

    // Match relative or absolute /uploads/ paths
    const uploadMatch = originalSrc.match(/\/uploads\/(.+)$/)
    if (!uploadMatch) {
      continue
    }

    const relativeFilePath = uploadMatch[1]
    const localPath = path.join(process.cwd(), 'public', 'uploads', relativeFilePath)

    if (fs.existsSync(localPath)) {
      const filename = path.basename(localPath)
      const contentId = `img_${crypto.randomBytes(8).toString('hex')}_${filename}`
      processedSources.set(originalSrc, contentId)

      attachments.push({
        filename,
        path: localPath,
        cid: contentId
      })
    }
  }

  for (const [src, cid] of processedSources.entries()) {
    const escapedSrc = src.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    const replaceRegex = new RegExp(`(src\\s*=\\s*["'])(${escapedSrc})(["'])`, 'g')
    modifiedHtml = modifiedHtml.replace(replaceRegex, `$1cid:${cid}$3`)
  }

  return {
    html: modifiedHtml,
    attachments
  }
}


// #10: Build email body from pre-loaded context — no DB calls
const buildEmailBody = (
  emailSettings: { schoolName: string; senderName: string; fromEmail: string },
  template: any | null,
  file: any,
  options: EmailJobOptions,
  baseUrl: string
) => {
  const { schoolName, senderName, fromEmail } = emailSettings
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
  const studentNameHtml = escapeHtml(studentName)

  let finalSubject = subject
  let finalHtml = ''

  if (template) {
    const replacements: Record<string, string> = {
      '{{studentName}}': studentNameHtml,
      '{{yearName}}': escapeHtml(yearName),
      '{{level}}': escapeHtml(level),
      '{{className}}': escapeHtml(className),
      '{{schoolName}}': schoolNameHtml,
    }
    finalSubject = template.subject
    finalHtml = template.bodyHtml
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
            ${details.map((detail) => `
              <tr>
                <td style="padding: 5px 0; font-size: 14px; color: #64748b; width: 130px;">${detail.split(' : ')[0]}</td>
                <td style="padding: 5px 0; font-size: 14px; font-weight: 700; color: #1e293b;">${detail.split(' : ')[1]}</td>
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

  // Resolve any relative upload/media urls to be absolute
  if (finalHtml && baseUrl) {
    const base = baseUrl.replace(/\/$/, '')
    finalHtml = finalHtml.replace(/(src|href)=["']\/((uploads|media)[^"']*)["']/g, `$1="${base}/$2"`)
  }

  // Ensure img tags have explicit width attributes for email client compatibility (e.g. Outlook)
  if (finalHtml) {
    finalHtml = finalHtml.replace(/<img([^>]*?style=["'][^"']*max-width:\s*(\d+)(%|px)?[^"']*["'][^>]*?)\s*(\/?)>/gi, (match, body, val, unit, selfClose) => {
      if (/\bwidth\s*=/i.test(body)) {
        return match
      }
      const widthVal = unit === '%' ? `${val}%` : val
      return `<img${body} width="${widthVal}"${selfClose ? ' /' : ''}>`
    })
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

  const recipientsWithTypes = buildRecipientsWithTypes(file, options)

  return {
    subject: finalSubject,
    html: finalHtml,
    text: textLines.join('\n'),
    fromName: senderName,
    fromEmail,
    recipients: recipientsWithTypes.map(r => r.email),
    recipientsWithTypes
  }
}

// Backward-compat wrapper used by the preview route (single file only — N+1 is acceptable there)
const buildEmailContent = async (batch: any, file: any, options: EmailJobOptions, baseUrl: string) => {
  const emailSettings = await loadEmailSettings()
  const level = String(file?.level || '').trim()
  const className = String(file?.className || '').trim()
  const cache = new Map<string, any>()
  let schoolYearId: string | undefined
  if (batch?.yearName) {
    const sy = await SchoolYear.findOne({ name: batch.yearName }).lean()
    schoolYearId = sy?._id?.toString()
  }
  const template = await resolveEmailTemplate(cache, level, className, options.templateId, schoolYearId)
  return buildEmailBody(emailSettings, template, file, options, baseUrl)
}

async function runEmailJob(jobId: string, batch: any, files: any[], options: EmailJobOptions, baseUrl: string) {

  // Email validation: format + DNS MX check
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
  const mxCache = new Map<string, boolean>()

  async function validateEmail(email: string): Promise<{ valid: boolean; reason?: string }> {
    if (!email || !EMAIL_REGEX.test(email)) {
      return { valid: false, reason: `Format d'email invalide: ${email}` }
    }
    const domain = email.split('@')[1].toLowerCase()
    if (mxCache.has(domain)) {
      return mxCache.get(domain) 
        ? { valid: true } 
        : { valid: false, reason: `Le domaine '${domain}' n'a aucun enregistrement MX` }
    }
    try {
      const records = await dns.promises.resolveMx(domain)
      const hasMx = records && records.length > 0
      mxCache.set(domain, hasMx)
      if (!hasMx) {
        // Fallback: check if domain has A record
        try {
          await dns.promises.resolve4(domain)
          mxCache.set(domain, true)
          return { valid: true }
        } catch {
          return { valid: false, reason: `Le domaine '${domain}' n'a aucun enregistrement MX` }
        }
      }
      return { valid: true }
    } catch (err: any) {
      // DNS lookup failed entirely — domain does not exist
      mxCache.set(domain, false)
      return { valid: false, reason: `Le domaine '${domain}' n'existe pas ou est injoignable` }
    }
  }
  try {
    const transporter = await createSmtpTransporter()
    if (!transporter) throw new Error('SMTP not configured')

    // #11: verify SMTP connection before starting the batch
    await transporter.verify()

    const smtpSettings = await getSmtpSettings()

    // #10: load settings once — not once per file
    const emailSettings = await loadEmailSettings()
    const templateCache = new Map<string, any | null>()

    // Resolve school year once for year-aware template resolution
    let jobSchoolYearId: string | undefined
    if (batch?.yearName) {
      const sy = await SchoolYear.findOne({ name: batch.yearName }).lean()
      jobSchoolYearId = sy?._id?.toString()
    }

    // #12: wrap sendMail with a hard 15-second timeout per email
    const sendMailWithTimeout = (mailOptions: any): Promise<void> =>
      Promise.race([
        transporter.sendMail(mailOptions) as Promise<any>,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SMTP timeout après 15 secondes')), 15_000)
        )
      ])

    for (const file of files) {
      const level = String(file?.level || '').trim()
      const className = String(file?.className || '').trim()
      const template = await resolveEmailTemplate(templateCache, level, className, options.templateId, jobSchoolYearId)
      const emailContent = buildEmailBody(emailSettings, template, file, options, baseUrl)

      let recipientsToProcess = emailContent.recipientsWithTypes.map(r => ({ ...r }))
      
      if (options.testEmailOverride) {
        recipientsToProcess = [{ email: options.testEmailOverride, type: 'override' as any }]
      }

      const item: any = {
        fileId: String(file._id),
        studentName: `${file.firstName} ${file.lastName}`,
        recipients: recipientsToProcess.map(r => r.email),
        recipientDetails: [],
        status: 'pending'
      }

      try {
        if (recipientsToProcess.length === 0) {
          item.status = 'skipped'
          item.error = 'Aucun destinataire valide trouvé'
        } else {
          const absolutePath = resolveGradebookExportPath(file.relativePath)
          let sentCount = 0
          let failedCount = 0
          const sentEmailsForThisFile = new Set<string>()

          for (const rec of recipientsToProcess) {
            const detail: any = {
              email: rec.email,
              type: rec.type,
              status: 'pending'
            }

            // Validate email format + DNS before sending
            const validation = await validateEmail(rec.email)
            if (!validation.valid) {
              detail.status = 'failed'
              detail.error = validation.reason || 'Email invalide'
              failedCount++
              item.recipientDetails.push(detail)

              await EmailJob.updateOne(
                { _id: jobId, "items.fileId": String(file._id) },
                {
                  $set: {
                    "items.$.recipientDetails.$[recFilter].status": "failed",
                    "items.$.recipientDetails.$[recFilter].error": detail.error
                  },
                  $inc: {
                    processedEmails: 1,
                    failedEmails: 1
                  }
                },
                {
                  arrayFilters: [{ "recFilter.email": rec.email, "recFilter.type": rec.type }]
                }
              )
              continue
            }

            if (sentEmailsForThisFile.has(rec.email)) {
              detail.status = 'sent'
              sentCount++
              item.recipientDetails.push(detail)

              await EmailJob.updateOne(
                { _id: jobId, "items.fileId": String(file._id) },
                {
                  $set: {
                    "items.$.recipientDetails.$[recFilter].status": "sent"
                  },
                  $inc: {
                    processedEmails: 1,
                    sentEmails: 1
                  }
                },
                {
                  arrayFilters: [{ "recFilter.email": rec.email }]
                }
              )
              continue
            }

            try {
              const { html: finalHtml, attachments: finalAttachments } = prepareEmailAttachmentsAndHtml(
                emailContent.html,
                [{ filename: file.fileName, path: absolutePath }]
              )

              await sendMailWithTimeout({
                from: emailContent.fromEmail ? `"${emailContent.fromName}" <${emailContent.fromEmail}>` : smtpSettings.user,
                to: rec.email,
                subject: options.testEmailOverride ? `[TEST] ${emailContent.subject}` : emailContent.subject,
                text: emailContent.text,
                html: finalHtml,
                attachments: finalAttachments
              })
              detail.status = 'sent'
              sentCount++
              sentEmailsForThisFile.add(rec.email)

              await EmailJob.updateOne(
                { _id: jobId, "items.fileId": String(file._id) },
                {
                  $set: {
                    "items.$.recipientDetails.$[recFilter].status": "sent"
                  },
                  $inc: {
                    processedEmails: 1,
                    sentEmails: 1
                  }
                },
                {
                  arrayFilters: [{ "recFilter.email": rec.email }]
                }
              )
            } catch (mailErr: any) {
              detail.status = 'failed'
              detail.error = mailErr.message
              failedCount++

              await EmailJob.updateOne(
                { _id: jobId, "items.fileId": String(file._id) },
                {
                  $set: {
                    "items.$.recipientDetails.$[recFilter].status": "failed",
                    "items.$.recipientDetails.$[recFilter].error": mailErr.message
                  },
                  $inc: {
                    processedEmails: 1,
                    failedEmails: 1
                  }
                },
                {
                  arrayFilters: [{ "recFilter.email": rec.email }]
                }
              )
            }
            item.recipientDetails.push(detail)
          }

          if (sentCount === recipientsToProcess.length) {
            item.status = 'sent'
          } else if (sentCount > 0) {
            item.status = 'partial'
          } else {
            item.status = 'failed'
            item.error = 'Tous les envois ont échoué'
          }
        }
      } catch (err: any) {
        item.status = 'failed'
        item.error = err.message
      }

      await EmailJob.updateOne(
        { _id: jobId, "items.fileId": String(file._id) },
        { 
          $set: { 
            "items.$.status": item.status,
            "items.$.error": item.error 
          },
          $inc: { 
            processedItems: 1,
            sentItems: item.status === 'sent' ? 1 : 0,
            failedItems: item.status === 'failed' ? 1 : 0,
            skippedItems: item.status === 'skipped' ? 1 : 0,
            partialItems: item.status === 'partial' ? 1 : 0
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
    const role = String(reqAny.user?.role || '')
    const userId = String(reqAny.user?.userId || '')
    const query: Record<string, any> = {}

    if (role === 'SUBADMIN' || role === 'AEFE') {
      const scope = await RoleScope.findOne({ userId }).lean()
      if (scope && scope.levels && scope.levels.length > 0) {
        // Filter batches that contain at least one file from these levels
        query['files.level'] = { $in: scope.levels }
      } else if (role === 'SUBADMIN') {
        // SubAdmin with no scope sees only their own batches
        query.createdBy = userId
      }
      // AEFE with no scope continues to see everything (Direction)
    } else if (role !== 'ADMIN') {
      query.createdBy = userId
    }

    const batches = await ExportedGradebookBatch.find(query).sort({ createdAt: -1 }).limit(100).lean()
    
    // Hydrate latest emails onto the files array for each batch
    for (const batch of batches) {
      if (batch.files && batch.files.length > 0) {
        await hydrateLatestEmails(batch.files)
      }
    }

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
      overrideEmail: req.body?.overrideEmail ? String(req.body.overrideEmail) : undefined,
      selectedFileIds: Array.isArray(req.body?.selectedFileIds) ? req.body.selectedFileIds.map((id: unknown) => String(id)) : []
    }

    let selectedFiles = []
    if (options.selectedFileIds && options.selectedFileIds.length > 0) {
      const isAdmin = isAdminRole(String((req as any).user?.role || ''))
      const ownerId = (req as any).user.id || (req as any).user.userId
      const allBatches = await ExportedGradebookBatch.find(
        isAdmin ? {} : { createdBy: ownerId }
      ).lean()
      selectedFiles = allBatches.flatMap(b => b.files).filter(f => options.selectedFileIds!.includes(String(f._id)))
    } else {
      selectedFiles = batch.files
    }

    if (selectedFiles.length === 0) return res.status(400).json({ error: 'no_files_selected' })

    await hydrateLatestEmails(selectedFiles)

    const previewFile = selectedFiles[0]
    const baseUrl = getBaseUrl(req)
    const emailContent = await buildEmailContent(batch, previewFile, options, baseUrl)
    const totalRecipients = selectedFiles.reduce((acc: number, file: any) => acc + buildRecipientsWithTypes(file, options).length, 0)

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
    const { selectedFileIds, testEmailOverride, templateId, overrideEmail } = req.body
    const includeFather = req.body.includeFather !== false
    const includeMother = req.body.includeMother !== false
    const includeStudent = req.body.includeStudent !== false
    const customMessage = String(req.body.customMessage || '')

    const batch = await getOwnedBatch(req, String(req.params.batchId || ''))
    if (!batch) return res.status(404).json({ error: 'batch_not_found' })

    // If selectedFileIds contains IDs that are NOT in this batch, we might want to search in other batches 
    // of the same lot/owner. For now, let's just make sure we find all requested files that the user owns.
    let files = []
    if (selectedFileIds && selectedFileIds.length > 0) {
      const isAdmin = isAdminRole(String((req as any).user?.role || ''))
      const ownerId = (req as any).user.id || (req as any).user.userId
      
      const allBatches = await ExportedGradebookBatch.find(
        isAdmin ? {} : { createdBy: ownerId }
      ).lean()
      
      files = allBatches.flatMap(b => b.files).filter(f => selectedFileIds.includes(String(f._id)))
    } else {
      files = batch.files
    }

    if (files.length === 0) return res.status(400).json({ error: 'no_files_selected' })

    await hydrateLatestEmails(files)

    let totalEmails = 0
    const items = files.map(file => {
      let recipientsToProcess: Array<{ email: string, type: 'father' | 'mother' | 'student' | 'override' }> = []
      if (testEmailOverride) {
        recipientsToProcess = [{ email: testEmailOverride, type: 'override' }]
      } else {
        recipientsToProcess = buildRecipientsWithTypes(file, {
          includeFather,
          includeMother,
          includeStudent,
          customMessage,
          overrideEmail: overrideEmail ? String(overrideEmail).trim() : undefined,
          selectedFileIds: files.map(f => String(f._id))
        })
      }
      totalEmails += recipientsToProcess.length

      return {
        fileId: String(file._id),
        studentId: String(file.studentId || ''),
        studentName: `${file.firstName} ${file.lastName}`.trim(),
        recipients: recipientsToProcess.map(r => r.email),
        recipientDetails: recipientsToProcess.map(r => ({
          email: r.email,
          type: r.type,
          status: 'pending'
        })),
        status: 'pending'
      }
    })

    const jobId = new mongoose.Types.ObjectId().toString()
    const job = new EmailJob({
      _id: jobId,
      batchId: batch._id,
      createdBy: (req as any).user.id || (req as any).user.userId,
      creatorName: (req as any).user.displayName || (req as any).user.email,
      totalItems: files.length,
      status: 'running',
      isTest: !!testEmailOverride,
      totalEmails,
      processedEmails: 0,
      sentEmails: 0,
      failedEmails: 0,
      options: {
        includeFather,
        includeMother,
        includeStudent,
        customMessage,
        overrideEmail: overrideEmail ? String(overrideEmail).trim() : undefined,
        selectedFileIds: files.map(f => String(f._id)),
        testEmailOverride
      },
      items
    })
    await job.save()

    if (overrideEmail && String(overrideEmail).trim() && files.length === 1) {
      const file = files[0]
      const studentName = `${file.firstName || ''} ${file.lastName || ''}`.trim()
      await TemplateChangeSuggestion.create({
        subAdminId: String((req as any).user?.id || (req as any).user?.userId || ''),
        type: 'alternative_email',
        originalText: studentName,
        suggestedText: String(overrideEmail).trim().toLowerCase(),
        status: 'approved'
      })
    }

    // Use the first batch as a reference for SMTP settings/context
    const baseUrl = getBaseUrl(req)
    runEmailJob(jobId, batch, files, {
      includeFather,
      includeMother,
      includeStudent,
      customMessage,
      overrideEmail: overrideEmail ? String(overrideEmail).trim() : undefined,
      selectedFileIds: files.map(f => String(f._id)),
      testEmailOverride,
      templateId
    }, baseUrl)
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

gradebookExportsRouter.get('/email-jobs/mine', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  try {
    const reqAny = req as any
    const role = String(reqAny.user?.role || '')
    const userId = String(reqAny.user?.userId || '')
    const query: Record<string, any> = {}

    if (role === 'SUBADMIN' || role === 'AEFE') {
      const scope = await RoleScope.findOne({ userId }).lean()
      if (scope && scope.levels && scope.levels.length > 0) {
        // Find batches that match the levels
        const matchingBatches = await ExportedGradebookBatch.find({
          'files.level': { $in: scope.levels }
        }).select('_id').lean()
        const batchIds = matchingBatches.map(b => b._id)
        
        // Query jobs that belong to these batches OR were created by the user
        query.$or = [
          { batchId: { $in: batchIds } },
          { createdBy: userId }
        ]
      } else if (role === 'SUBADMIN') {
        query.createdBy = userId
      }
    } else if (role !== 'ADMIN') {
      query.createdBy = userId
    }

    const jobs = await EmailJob.find(query).sort({ createdAt: -1 }).limit(200).lean()
    res.json(jobs)
  } catch (error: any) {
    res.status(500).json({ error: 'fetch_mine_failed', message: error.message })
  }
})

gradebookExportsRouter.get('/email-jobs', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
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
