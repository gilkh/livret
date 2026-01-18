import { Router } from 'express'
import { Student } from '../models/Student'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateSignature } from '../models/TemplateSignature'
import { SavedGradebook } from '../models/SavedGradebook'
import { requireAuth } from '../auth'
import puppeteer, { Browser } from 'puppeteer'
import archiver from 'archiver'
import fs from 'fs'
import PDFDocument from 'pdfkit'

export const pdfPuppeteerRouter = Router()

// Singleton browser instance
let browserInstance: Browser | null = null

const getBrowser = async () => {
  console.log('[PDF DEBUG] getBrowser called')
  if (browserInstance && browserInstance.isConnected()) {
    console.log('[PDF DEBUG] Reusing existing browser instance')
    return browserInstance
  }

  console.log('[PDF] Launching new browser instance...')
  try {
    browserInstance = await puppeteer.launch({
      headless: true,
      // @ts-ignore - available at runtime, not in older type defs
      ignoreHTTPSErrors: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--ignore-certificate-errors'
      ]
    })
    console.log('[PDF DEBUG] New browser instance launched successfully')
  } catch (e) {
    console.error('[PDF DEBUG] Failed to launch browser:', e)
    throw e
  }

  browserInstance.on('disconnected', () => {
    console.log('[PDF] Browser disconnected')
    browserInstance = null
  })

  return browserInstance
}

const sanitizeFileName = (value: string) => {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || 'file'
}

const getTokenFromReq = (req: any) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.slice('Bearer '.length)
  }
  if (req.query?.token) return String(req.query.token)
  if (req.body?.token) return String(req.body.token)
  return ''
}

const resolveFrontendUrl = (req?: any) => {
  // DEBUG: Log all available sources for frontend URL resolution
  const explicitRaw =
    String(req?.query?.frontendOrigin || req?.query?.frontendUrl || req?.headers?.['x-frontend-origin'] || '').trim()

  const envUrlRaw = String(process.env.FRONTEND_URL || '').trim()
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').trim()
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').trim()
  const hostHeader = String(req?.headers?.host || '').trim()
  const originHeader = String(req?.headers?.origin || '').trim()
  const refererHeader = String(req?.headers?.referer || '').trim()

  console.log('[PDF URL DEBUG] Resolving frontend URL from sources:', {
    explicitRaw: explicitRaw || '(empty)',
    envUrlRaw: envUrlRaw || '(empty)',
    forwardedProto: forwardedProto || '(empty)',
    forwardedHost: forwardedHost || '(empty)',
    hostHeader: hostHeader || '(empty)',
    originHeader: originHeader || '(empty)',
    refererHeader: refererHeader || '(empty)'
  })

  if (explicitRaw) {
    try {
      const result = new URL(explicitRaw).origin
      console.log('[PDF URL DEBUG] Using explicit query/header origin:', result)
      return result
    } catch { }
  }

  let fromReq = ''
  if (forwardedProto && forwardedHost) {
    fromReq = `${forwardedProto}://${forwardedHost}`
    console.log('[PDF URL DEBUG] Built fromReq from forwarded headers:', fromReq)
  } else if (refererHeader) {
    try {
      fromReq = new URL(refererHeader).origin
      console.log('[PDF URL DEBUG] Built fromReq from referer:', fromReq)
    } catch { }
  } else if (originHeader) {
    fromReq = originHeader
    console.log('[PDF URL DEBUG] Built fromReq from origin header:', fromReq)
  } else if (hostHeader) {
    const proto = forwardedProto || 'http'
    fromReq = `${proto}://${hostHeader}`
    console.log('[PDF URL DEBUG] Built fromReq from host header:', fromReq)
  }

  const isLocalhostLike = (urlString: string) => {
    try {
      const h = new URL(urlString).hostname
      return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0'
    } catch {
      return false
    }
  }

  if (envUrlRaw) {
    if (isLocalhostLike(envUrlRaw) && fromReq && !isLocalhostLike(fromReq)) {
      console.log('[PDF URL DEBUG] FRONTEND_URL is localhost but request is from non-localhost, using fromReq:', fromReq)
      return fromReq
    }
    const resolved = envUrlRaw.replace('//localhost', '//127.0.0.1')
    console.log('[PDF URL DEBUG] Using FRONTEND_URL env var (normalized):', resolved)
    return resolved
  }

  if (fromReq) {
    const resolved = fromReq.replace('//localhost', '//127.0.0.1')
    console.log('[PDF URL DEBUG] Using fromReq (normalized):', resolved)
    return resolved
  }

  console.log('[PDF URL DEBUG] FALLBACK to default: https://127.0.0.1:443')
  return 'https://127.0.0.1:443'
}

const generatePdfBufferFromPrintUrl = async (printUrl: string, token: string, frontendUrl: string) => {
  const pdfPageWidthPxRaw = Number(process.env.PDF_PAGE_WIDTH_PX || '800')
  const pdfPageHeightPxRaw = Number(process.env.PDF_PAGE_HEIGHT_PX || '1120')
  const pdfPageWidthPx = Number.isFinite(pdfPageWidthPxRaw) && pdfPageWidthPxRaw > 0 ? Math.round(pdfPageWidthPxRaw) : 800
  const pdfPageHeightPx = Number.isFinite(pdfPageHeightPxRaw) && pdfPageHeightPxRaw > 0 ? Math.round(pdfPageHeightPxRaw) : 1120

  // Device scale factor controls DPI: 1.35 = ~130 DPI (sharp for screen/print, optimized for size)
  // Lower = smaller files, Higher = sharper but larger files
  const pdfDeviceScaleFactorRaw = Number(process.env.PDF_DEVICE_SCALE_FACTOR || process.env.PDF_DPI_SCALE || '1.35')
  const pdfDeviceScaleFactor = Number.isFinite(pdfDeviceScaleFactorRaw) && pdfDeviceScaleFactorRaw > 0 ? Math.min(3, Math.max(1, pdfDeviceScaleFactorRaw)) : 1.35

  // Use native page.pdf() instead of screenshot-based approach
  // Default to screenshot (false) since native PDF can add white borders around content
  const useNativePdf = process.env.PDF_USE_NATIVE === 'true' // Must explicitly enable

  // SAFETY: Force 127.0.0.1 if localhost leaked through (e.g. stale code or resolve bypass)
  if (printUrl.includes('//localhost')) {
    printUrl = printUrl.replace('//localhost', '//127.0.0.1')
    console.log('[PDF DEBUG] Rewrote printUrl localhost to 127.0.0.1')
  }
  // SAFETY: Fix port 5173 to 443 (user's Vite runs on 443)
  if (printUrl.includes(':5173')) {
    printUrl = printUrl.replace(':5173', ':443')
    console.log('[PDF DEBUG] Rewrote printUrl port 5173 to 443')
  }
  if (frontendUrl.includes('//localhost')) {
    frontendUrl = frontendUrl.replace('//localhost', '//127.0.0.1')
  }
  if (frontendUrl.includes(':5173')) {
    frontendUrl = frontendUrl.replace(':5173', ':443')
  }

  let page: any = null
  const tStart = Date.now()
  const safePrintUrl = String(printUrl || '').replace(/([?&])token=[^&]*/, '$1token=***')
  const browser = await getBrowser()
  page = await browser.newPage()
  console.log(`[PDF TIMING] Starting PDF generation for ${safePrintUrl} (native=${useNativePdf})`)

  try {
    page.on('console', (msg: any) => {
      console.log('[BROWSER LOG]', msg.text())
    })
    page.on('pageerror', (err: any) => {
      console.error('[PAGE ERROR]', err)
    })
    page.on('requestfailed', (req: any) => {
      console.error('[FAILED REQUEST]', req.url(), req.failure())
    })

    await page.setViewport({ width: pdfPageWidthPx, height: pdfPageHeightPx, deviceScaleFactor: pdfDeviceScaleFactor })
    console.log(`[PDF TIMING] newPage created in ${Date.now() - tStart}ms`)

    if (token) {
      let cookieDomain = 'localhost'
      try {
        cookieDomain = new URL(frontendUrl).hostname
      } catch { }
      await page.setCookie({
        name: 'token',
        value: token,
        domain: cookieDomain,
        path: '/'
      })
    }

    // Try to navigate until DOM content loaded only (faster and avoids long-polling third-party scripts)
    let navStart = Date.now()
    let navMs = 0
    let response: any = null

    console.log(`[PDF DEBUG] Attempting to navigate to: ${safePrintUrl}`)
    console.log(`[PDF DEBUG] Frontend URL being used: ${frontendUrl}`)

    try {
      response = await page.goto(printUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      navMs = Date.now() - navStart
      console.log(`[PDF TIMING] page.goto completed in ${navMs}ms for ${safePrintUrl}`)
    } catch (navError: any) {
      navMs = Date.now() - navStart
      console.error(`[PDF ERROR] Navigation failed after ${navMs}ms for ${safePrintUrl}`)
      console.error(`[PDF ERROR] Error type: ${navError?.name || 'Unknown'}`)
      console.error(`[PDF ERROR] Error message: ${navError?.message || 'No message'}`)

      // Provide helpful diagnostic info for common errors
      if (navError?.message?.includes('ERR_CONNECTION_REFUSED')) {
        console.error('[PDF ERROR] *** CONNECTION REFUSED ***')
        console.error(`[PDF ERROR] The browser could not connect to: ${printUrl}`)
        console.error('[PDF ERROR] Possible causes:')
        console.error('[PDF ERROR]   1. Frontend dev server is not running (run "npm run dev" in client folder)')
        console.error('[PDF ERROR]   2. Frontend is running on a different port')
        console.error('[PDF ERROR]   3. FRONTEND_URL env variable is not set correctly for production')
        console.error(`[PDF ERROR] Current FRONTEND_URL env: ${process.env.FRONTEND_URL || '(not set)'}`)
      } else if (navError?.message?.includes('ERR_CERT')) {
        console.error('[PDF ERROR] *** SSL CERTIFICATE ERROR ***')
        console.error('[PDF ERROR] Puppeteer cannot verify the SSL certificate')
        console.error('[PDF ERROR] For local HTTPS dev, ensure ignoreHTTPSErrors is enabled')
      } else if (navError?.message?.includes('TIMEOUT') || navError?.message?.includes('timeout')) {
        console.error('[PDF ERROR] *** NAVIGATION TIMEOUT ***')
        console.error('[PDF ERROR] The page took too long to load')
      }

      throw new Error(`${navError?.message || 'Navigation failed'} at ${safePrintUrl}`)
    }

    if (!response) {
      const currentUrl = String(page.url() || '')
      throw new Error(`Failed to load print page (no response). currentUrl=${currentUrl}`)
    }
    const status = response.status()
    if (status >= 400) {
      throw new Error(`Failed to load print page (HTTP ${status})`)
    }

    try {
      await page.emulateMediaType('print')
    } catch { }

    // Wait for explicit ready signal from client, but shorter timeout (10s)
    let readyStart = Date.now()
    let readyMs = 0
    try {
      await page.waitForFunction(() => {
        // @ts-ignore
        return (window as any).__READY_FOR_PDF__ === true
      }, { timeout: 10000 })
      readyMs = Date.now() - readyStart
      console.log(`[PDF TIMING] waitForFunction resolved in ${readyMs}ms for ${safePrintUrl}`)
    } catch (e) {
      readyMs = Date.now() - readyStart
      console.warn(`[PDF TIMING] Timeout waiting for READY_FOR_PDF after ${readyMs}ms for ${safePrintUrl}, proceeding...`)
    }

    // Keep a short safety delay (reduce from 1s to 250ms)
    const delayStart = Date.now()
    await new Promise(resolve => setTimeout(resolve, 250))
    console.log(`[PDF TIMING] pre-pdf delay ${Date.now() - delayStart}ms for ${safePrintUrl}`)

    // Get page dimensions from .page-canvas elements
    let resolvedPdfPageWidthPx = pdfPageWidthPx
    let resolvedPdfPageHeightPx = pdfPageHeightPx
    let pageCount = 1
    try {
      const pageInfo = await page.evaluate(() => {
        const pages = document.querySelectorAll('.page-canvas')
        if (!pages.length) return null
        const first = pages[0] as HTMLElement
        const r = first.getBoundingClientRect()
        const width = Math.round(r.width)
        const height = Math.round(r.height)
        if (!width || !height) return null
        return { width, height, count: pages.length }
      })
      if (pageInfo?.width && pageInfo?.height) {
        resolvedPdfPageWidthPx = pageInfo.width
        resolvedPdfPageHeightPx = pageInfo.height
        pageCount = pageInfo.count || 1
      }
    } catch { }
    console.log(`[PDF DEBUG] Found ${pageCount} pages, size ${resolvedPdfPageWidthPx}x${resolvedPdfPageHeightPx}px @ scale ${pdfDeviceScaleFactor} for ${safePrintUrl}`)

    const tPdfStart = Date.now()
    let pdfBuffer: Buffer

    if (useNativePdf) {
      // ========== NATIVE PDF APPROACH ==========
      // Uses page.pdf() directly - text stays as vectors, only images are rasterized
      // NOTE: This may add white borders if CSS @page rules don't match exactly

      // Convert pixel dimensions to points (72 points = 1 inch, assuming 96 DPI screen)
      const pageWidthInches = resolvedPdfPageWidthPx / 96
      const pageHeightInches = resolvedPdfPageHeightPx / 96

      console.log(`[PDF DEBUG] Using NATIVE page.pdf() - ${pageWidthInches.toFixed(2)}in x ${pageHeightInches.toFixed(2)}in per page`)

      pdfBuffer = await page.pdf({
        width: `${pageWidthInches}in`,
        height: `${pageHeightInches}in`, // Single page height - CSS page-break-after handles pagination
        printBackground: true,
        preferCSSPageSize: true, // Prefer CSS @page rules if defined
        scale: 1, // Full scale - CSS handles sizing
        margin: { top: 0, right: 0, bottom: 0, left: 0 }
      }) as Buffer

    } else {
      // ========== SCREENSHOT-BASED APPROACH (DEFAULT) ==========
      // Rasterizes everything - guaranteed visual fidelity matching the screen exactly
      // Optimized: JPEG compression, 150 DPI (1.5 scale), PDF compression

      const pageCanvases = await page.$$('.page-canvas')
      if (!pageCanvases.length) {
        throw new Error('No .page-canvas elements found on print page')
      }

      // PDF quality settings - optimized for size while maintaining good quality
      // 72% JPEG quality: imperceptible quality loss on gradebooks, ~20% smaller than 80%
      const pdfImageQuality = Number(process.env.PDF_IMAGE_QUALITY || '72')
      const pdfUseJpeg = process.env.PDF_USE_JPEG !== 'false'

      console.log(`[PDF DEBUG] Using SCREENSHOT approach - quality=${pdfImageQuality}, jpeg=${pdfUseJpeg}, pages=${pageCanvases.length}`)

      pdfBuffer = await new Promise<Buffer>(async (resolve, reject) => {
        try {
          const chunks: Buffer[] = []
          const doc = new PDFDocument({ autoFirstPage: false, margin: 0, compress: true })
          doc.on('data', (c: any) => chunks.push(Buffer.from(c)))
          doc.on('end', () => resolve(Buffer.concat(chunks)))
          doc.on('error', reject)

          for (const handle of pageCanvases) {
            try {
              await handle.evaluate((el: any) => el?.scrollIntoView?.({ block: 'start' }))
            } catch { }

            const imageBuffer = pdfUseJpeg
              ? (await handle.screenshot({ type: 'jpeg', quality: pdfImageQuality, omitBackground: false })) as Buffer
              : (await handle.screenshot({ type: 'png', omitBackground: true })) as Buffer

            doc.addPage({ size: [resolvedPdfPageWidthPx, resolvedPdfPageHeightPx], margin: 0 })
            doc.image(imageBuffer, 0, 0, { width: resolvedPdfPageWidthPx, height: resolvedPdfPageHeightPx })
          }

          doc.end()
        } catch (e) {
          reject(e)
        }
      })
    }

    const pdfMs = Date.now() - tPdfStart

    console.log(`[PDF TIMING] pdf render took ${pdfMs}ms, size: ${pdfBuffer?.length || 0}, isBuffer: ${Buffer.isBuffer(pdfBuffer)}, native: ${useNativePdf} for ${safePrintUrl}`)
    const totalMs = Date.now() - tStart
    console.log(`[PDF TIMING] generatePdfBufferFromPrintUrl total ${totalMs}ms (nav ${navMs}ms, ready ${readyMs}ms, pdf ${pdfMs}ms) for ${safePrintUrl}`)

    try {
      fs.appendFileSync('pdf-timings.log', `${new Date().toISOString()} ${safePrintUrl} totalMs=${totalMs} navMs=${navMs} readyMs=${readyMs} pdfMs=${pdfMs} size=${pdfBuffer?.length || 0} native=${useNativePdf}\n`)
    } catch (e) {
      console.warn('[PDF] Failed to append timing to file:', e)
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF buffer is empty')
    }

    return pdfBuffer
  } finally {
    try {
      await page?.close()
    } catch { }
  }
}

// Generate PDF using Puppeteer from HTML render
pdfPuppeteerRouter.get('/student/:id', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  let page: any = null
  try {
    const { id } = req.params
    const { templateId } = req.query

    if (!templateId) {
      return res.status(400).json({ error: 'templateId required' })
    }

    console.log('[PDF] Starting PDF generation for student:', id, 'template:', templateId)

    const student = await Student.findById(id).lean()
    if (!student) {
      console.log('[PDF] Student not found:', id)
      return res.status(404).json({ error: 'student_not_found' })
    }

    const template = await GradebookTemplate.findById(templateId).lean()
    if (!template) {
      console.log('[PDF] Template not found:', templateId)
      return res.status(404).json({ error: 'template_not_found' })
    }

    const assignment = await TemplateAssignment.findOne({
      studentId: id,
      templateId: templateId
    }).lean()

    if (!assignment) {
      console.log('[PDF] Assignment not found')
      return res.status(404).json({ error: 'assignment_not_found' })
    }

    // Get token for authentication
    let token = ''
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice('Bearer '.length)
    } else if (req.query.token) {
      token = String(req.query.token)
    }

    console.log('[PDF] Getting browser instance...')

    const frontendUrl = resolveFrontendUrl(req)
    const printUrl = `${frontendUrl}/print/carnet/${assignment._id}?token=${token}`

    const safePrintUrl = String(printUrl || '').replace(/([?&])token=[^&]*/, '$1token=***')
    console.log('[PDF] Generating PDF via shared function:', safePrintUrl)
    const genStart = Date.now()
    const pdfBuffer = await generatePdfBufferFromPrintUrl(printUrl, token, frontendUrl)
    console.log(`[PDF TIMING] generatePdfBufferFromPrintUrl total ${Date.now() - genStart}ms for ${safePrintUrl}`)

    console.log('[PDF] PDF generated successfully, size:', pdfBuffer.length, 'bytes')

    // Verify PDF is valid
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF buffer is empty')
    }

    // Send PDF with proper headers to avoid corruption
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="carnet-${student.lastName}-${student.firstName}.pdf"`,
      'Content-Length': pdfBuffer.length.toString()
    })
    res.end(pdfBuffer)

    console.log('[PDF] PDF sent successfully')

  } catch (error: any) {
    console.error('[PDF] PDF generation error:', error.message)
    console.error('[PDF] Stack:', error.stack)

    // Clean up page if it's still open
    if (page) {
      try {
        await page.close()
      } catch (e) {
        console.error('[PDF] Error closing page:', e)
      }
    }

    res.status(500).json({
      error: 'pdf_generation_failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

pdfPuppeteerRouter.post('/assignments/zip', requireAuth(['ADMIN', 'SUBADMIN', 'AEFE']), async (req, res) => {
  // Increase timeout for large batches
  req.setTimeout(3600000) // 1 hour

  let archive: archiver.Archiver | null = null
  try {
    const assignmentIds = Array.isArray(req.body?.assignmentIds) ? req.body.assignmentIds.filter(Boolean) : []
    const groupLabel = String(req.body?.groupLabel || '').trim()
    const hideSignatures = req.body?.hideSignatures === true

    if (assignmentIds.length === 0) {
      return res.status(400).json({ error: 'missing_assignment_ids' })
    }

    const token = getTokenFromReq(req)
    const frontendUrl = resolveFrontendUrl(req)

    try {
      await getBrowser()
    } catch (err: any) {
      console.error('[PDF ZIP] Browser launch failed:', err)
      return res.status(500).json({
        error: 'browser_launch_failed',
        message: err.message
      })
    }

    const archiveFileName = sanitizeFileName(groupLabel ? `carnets-${groupLabel}.zip` : 'carnets.zip')
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${archiveFileName}"`
    })

    archive = archiver('zip', { zlib: { level: 9 } })
    let aborted = false
    res.on('close', () => {
      if (res.writableEnded) return
      aborted = true
      try { archive?.abort() } catch { }
    })
    archive.on('error', (err) => {
      console.error('[PDF ZIP] Archiver error:', err)
      res.destroy(err)
    })
    archive.on('warning', (err) => {
      console.warn('[PDF ZIP] Archiver warning:', err)
    })

    archive.pipe(res)

    const zipStart = Date.now()
    console.log(`[PDF ZIP] Starting zip generation for ${assignmentIds.length} assignments, group="${groupLabel}"`)

    archive.append(`Archive started at ${new Date().toISOString()}\n`, { name: 'info.txt' })

    // Parallelize generation with a small worker pool to reduce wall-clock
    const concurrency = Math.min(Math.max(1, Number(process.env.PDF_CONCURRENCY || '3')), assignmentIds.length)
    console.log(`[PDF ZIP] Generating ${assignmentIds.length} PDFs using concurrency=${concurrency}`)

    let idx = 0
    const getNext = () => {
      const i = idx
      idx += 1
      return assignmentIds[i]
    }

    const workers = Array.from({ length: concurrency }).map((_, workerIdx) => (async () => {
      while (true) {
        if (aborted) break
        const assignmentId = getNext()
        if (!assignmentId) break
        try {
          const assignment = await TemplateAssignment.findById(assignmentId).lean()
          if (!assignment) {
            if (archive) archive.append(`Assignment not found: ${assignmentId}\n`, { name: `errors/${sanitizeFileName(String(assignmentId))}.txt` })
            continue
          }

          const student = await Student.findById(assignment.studentId).lean()
          const template = await GradebookTemplate.findById(assignment.templateId).lean()

          const studentLast = student?.lastName || 'Eleve'
          const studentFirst = student?.firstName || ''
          const templateName = template?.name || 'Carnet'
          const pdfName = sanitizeFileName(`${studentLast}-${studentFirst}-${templateName}.pdf`)

          const printUrl = `${frontendUrl}/print/carnet/${assignment._id}?token=${token}${hideSignatures ? '&hideSignatures=true' : ''}`
          const safePrintUrl = String(printUrl || '').replace(/([?&])token=[^&]*/, '$1token=***')
          console.log(`[PDF ZIP] (worker ${workerIdx}) Generating PDF for assignment ${assignmentId} (${safePrintUrl})`)
          const assignStart = Date.now()
          const pdfBuffer = await generatePdfBufferFromPrintUrl(printUrl, token, frontendUrl)
          const assignMs = Date.now() - assignStart
          console.log(`[PDF ZIP] (worker ${workerIdx}) PDF for ${assignmentId} generated in ${assignMs}ms, size=${pdfBuffer?.length || 0}`)
          try {
            fs.appendFileSync('pdf-timings.log', `${new Date().toISOString()} assignment=${assignmentId} worker=${workerIdx} totalMs=${assignMs} size=${pdfBuffer?.length || 0} name=${pdfName}\n`)
          } catch (e) {
            console.warn('[PDF ZIP] Failed to append timing to file:', e)
          }

          // Append to archive
          if (archive) archive.append(pdfBuffer, { name: pdfName })

        } catch (e: any) {
          const errMsg = e?.message ? String(e.message) : 'pdf_generation_failed'
          if (archive) archive.append(`${errMsg}\n`, { name: `errors/${sanitizeFileName(String(assignmentId))}.txt` })
        }
      }
    })())

    await Promise.all(workers)

    // finalize archive after all workers finish
    console.log('[PDF ZIP] All workers completed, finalizing archive')
    await archive.finalize()
  } catch (e: any) {
    console.error('[PDF ZIP] Failed:', e)
    if (res.headersSent) {
      try {
        // If archive is not yet finalized, try to append error and finalize
        // @ts-ignore
        if (archive && archive._state.status !== 'finalized' && archive._state.status !== 'finalizing') {
          archive.append(`${e?.message || 'zip_generation_failed'}\n`, { name: `errors/fatal.txt` })
          await archive.finalize()
        } else {
          console.warn('[PDF ZIP] Archive already finalizing or finalized, forcing response end.')
          try { res.end() } catch { }
        }
      } catch (err) {
        console.error('[PDF ZIP] Error finalizing archive in catch block:', err)
        try { res.end() } catch { }
      }
      return
    }
    res.status(500).json({ error: 'zip_generation_failed', message: e.message })
  }
})

pdfPuppeteerRouter.get('/preview/:templateId/:studentId', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  let page: any = null
  try {
    const { templateId, studentId } = req.params
    const token = getTokenFromReq(req)
    const student = await Student.findById(studentId).lean()
    if (!student) return res.status(404).json({ error: 'student_not_found' })
    const template = await GradebookTemplate.findById(templateId).lean()
    if (!template) return res.status(404).json({ error: 'template_not_found' })
    const frontendUrl = resolveFrontendUrl(req)

    const printUrl = `${frontendUrl}/print/preview/${templateId}/student/${studentId}?token=${token}`

    const safePrintUrl = String(printUrl || '').replace(/([?&])token=[^&]*/, '$1token=***')
    console.log('[PDF] Generating Preview PDF via shared function:', safePrintUrl)
    const genStart = Date.now()
    const pdfBuffer = await generatePdfBufferFromPrintUrl(printUrl, token, frontendUrl)
    console.log(`[PDF TIMING] generatePdfBufferFromPrintUrl total ${Date.now() - genStart}ms for ${safePrintUrl}`)

    // Verify PDF is valid
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF buffer is empty')
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="carnet-${student.lastName}-${student.firstName}.pdf"`,
      'Content-Length': pdfBuffer.length.toString()
    })
    res.end(pdfBuffer)
  } catch (error: any) {
    console.error('[PDF] Preview PDF generation error:', error.message)
    console.error('[PDF] Preview stack:', error.stack)
    if (page) {
      try { await page.close() } catch { }
    }
    res.status(500).json({
      error: 'pdf_generation_failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})
// Generate PDF for Saved Gradebook
pdfPuppeteerRouter.get('/saved/:id', requireAuth(['ADMIN', 'SUBADMIN', 'TEACHER']), async (req, res) => {
  let page: any = null
  try {
    const { id } = req.params

    console.log('[PDF] Starting PDF generation for saved gradebook:', id)

    const saved = await SavedGradebook.findById(id).lean()
    if (!saved) {
      console.log('[PDF] Saved gradebook not found:', id)
      return res.status(404).json({ error: 'saved_gradebook_not_found' })
    }

    const token = getTokenFromReq(req)
    const frontendUrl = resolveFrontendUrl(req)

    const printUrl = `${frontendUrl}/print/saved/${saved._id}?token=${token}`

    const safePrintUrl = String(printUrl || '').replace(/([?&])token=[^&]*/, '$1token=***')
    console.log('[PDF] Generating Saved Gradebook PDF via shared function:', safePrintUrl)
    const genStart = Date.now()
    const pdfBuffer = await generatePdfBufferFromPrintUrl(printUrl, token, frontendUrl)
    console.log(`[PDF TIMING] generatePdfBufferFromPrintUrl total ${Date.now() - genStart}ms for ${safePrintUrl}`)

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF buffer is empty')
    }

    // Use student name from saved data if available, otherwise generic name
    const studentName = saved.data?.student ? `${saved.data.student.lastName}-${saved.data.student.firstName}` : 'carnet'

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="carnet-${studentName}.pdf"`,
      'Content-Length': pdfBuffer.length.toString()
    })
    res.end(pdfBuffer)

    console.log('[PDF] PDF sent successfully')

  } catch (error: any) {
    console.error('[PDF] PDF generation error:', error.message)
    console.error('[PDF] Stack:', error.stack)

    if (page) {
      try {
        await page.close()
      } catch (e) {
        console.error('[PDF] Error closing page:', e)
      }
    }

    res.status(500).json({
      error: 'pdf_generation_failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})
