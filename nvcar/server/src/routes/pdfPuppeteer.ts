import { Router } from 'express'
import { Student } from '../models/Student'
import { GradebookTemplate } from '../models/GradebookTemplate'
import { TemplateAssignment } from '../models/TemplateAssignment'
import { TemplateSignature } from '../models/TemplateSignature'
import { SavedGradebook } from '../models/SavedGradebook'
import { requireAuth } from '../auth'
import puppeteer, { Browser } from 'puppeteer'

export const pdfPuppeteerRouter = Router()

// Singleton browser instance
let browserInstance: Browser | null = null

const getBrowser = async () => {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance
  }

  console.log('[PDF] Launching new browser instance...')
  browserInstance = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  })

  browserInstance.on('disconnected', () => {
    console.log('[PDF] Browser disconnected')
    browserInstance = null
  })

  return browserInstance
}

// Generate PDF using Puppeteer from HTML render
pdfPuppeteerRouter.get('/student/:id', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
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
    const browser = await getBrowser()
    
    console.log('[PDF] Creating page...')
    page = await browser.newPage()
    
    // Add error logging to see what breaks in headless mode
    page.on('console', (msg: any) => {
      console.log('[BROWSER LOG]', msg.text())
    })
    page.on('pageerror', (err: any) => {
      console.error('[PAGE ERROR]', err)
    })
    page.on('requestfailed', (req: any) => {
      console.error('[FAILED REQUEST]', req.url(), req.failure())
    })
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 800, height: 1120 })
    
    // Set authentication cookie so React can access the API
    if (token) {
      await page.setCookie({
        name: 'token',
        value: token,
        domain: 'localhost',
        path: '/'
      })
    }
    
    // Build URL to load the carnet from frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const printUrl = `${frontendUrl}/print/carnet/${assignment._id}?token=${token}`
    
    console.log('[PDF] Loading page:', printUrl)
    await page.goto(printUrl, { 
      waitUntil: 'networkidle0',
      timeout: 60000
    })
    
    // Wait for the page to signal it's ready
    console.log('[PDF] Waiting for page to be ready...')
    await page.waitForFunction(() => {
      // @ts-ignore
      return window.__READY_FOR_PDF__ === true
    }, { timeout: 30000 })
    console.log('[PDF] Page confirmed ready')
    
    // Give a small delay for any final renders
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    console.log('[PDF] Generating PDF...')
    // Generate PDF - use A4 format and let multiple pages be created automatically
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      }
    })
    
    console.log('[PDF] PDF generated successfully, size:', pdfBuffer.length, 'bytes')
    
    await page.close()
    page = null
    
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

// Generate PDF for Saved Gradebook
pdfPuppeteerRouter.get('/saved/:id', requireAuth(['ADMIN','SUBADMIN','TEACHER']), async (req, res) => {
  let page: any = null
  try {
    const { id } = req.params
    
    console.log('[PDF] Starting PDF generation for saved gradebook:', id)
    
    const saved = await SavedGradebook.findById(id).lean()
    if (!saved) {
      console.log('[PDF] Saved gradebook not found:', id)
      return res.status(404).json({ error: 'saved_gradebook_not_found' })
    }
    
    // Get token for authentication
    let token = ''
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice('Bearer '.length)
    } else if (req.query.token) {
      token = String(req.query.token)
    }
    
    console.log('[PDF] Getting browser instance...')
    const browser = await getBrowser()
    
    console.log('[PDF] Creating page...')
    page = await browser.newPage()
    
    // Add error logging
    page.on('console', (msg: any) => {
      console.log('[BROWSER LOG]', msg.text())
    })
    page.on('pageerror', (err: any) => {
      console.error('[PAGE ERROR]', err)
    })
    page.on('requestfailed', (req: any) => {
      console.error('[FAILED REQUEST]', req.url(), req.failure())
    })
    
    await page.setViewport({ width: 800, height: 1120 })
    
    if (token) {
      await page.setCookie({
        name: 'token',
        value: token,
        domain: 'localhost',
        path: '/'
      })
    }
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const printUrl = `${frontendUrl}/print/saved/${saved._id}?token=${token}`
    
    console.log('[PDF] Loading page:', printUrl)
    
    await page.goto(printUrl, { 
      waitUntil: 'networkidle0',
      timeout: 60000
    })
    
    console.log('[PDF] Waiting for page to be ready...')
    await page.waitForFunction(() => {
      // @ts-ignore
      return window.__READY_FOR_PDF__ === true
    }, { timeout: 30000 })
    console.log('[PDF] Page confirmed ready')
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    console.log('[PDF] Generating PDF...')
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      }
    })
    
    console.log('[PDF] PDF generated successfully, size:', pdfBuffer.length, 'bytes')
    
    await page.close()
    page = null
    
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
