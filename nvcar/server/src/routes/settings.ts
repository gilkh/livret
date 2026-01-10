import { Router } from 'express'
import mongoose from 'mongoose'
import nodemailer from 'nodemailer'
import { requireAuth } from '../auth'
import { Setting } from '../models/Setting'
import { getSimulationSandboxDiagnostics, isSimulationSandbox } from '../utils/simulationSandbox'

export const settingsRouter = Router()

// Helper to get SMTP settings from database
export async function getSmtpSettings() {
  const settings = await Setting.find({
    key: { $in: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure'] }
  }).lean()

  const map: Record<string, any> = {}
  settings.forEach(s => { map[s.key] = s.value })

  return {
    host: map.smtp_host || '',
    port: parseInt(map.smtp_port) || 587,
    user: map.smtp_user || '',
    pass: map.smtp_pass || '',
    secure: map.smtp_secure === true
  }
}

// Helper to create nodemailer transporter
export async function createSmtpTransporter() {
  const smtp = await getSmtpSettings()
  if (!smtp.host || !smtp.user || !smtp.pass) {
    return null
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    }
  })
}

settingsRouter.get('/status', requireAuth(['ADMIN']), async (req, res) => {
  const dbState = mongoose.connection.readyState
  const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected'

  res.json({
    backend: 'online',
    database: dbStatus,
    databaseName: mongoose.connection?.db?.databaseName || null,
    simulationSandbox: isSimulationSandbox(),
    simulationSandboxDiagnostics: getSimulationSandboxDiagnostics(),
    uptime: process.uptime()
  })
})

settingsRouter.get('/public', async (req, res) => {
  const settings = await Setting.find({
    key: { $in: ['login_enabled_microsoft', 'school_name', 'nav_permissions', 'teacher_quick_grading_enabled', 'mobile_block_enabled', 'mobile_min_width'] }
  }).lean()

  const settingsMap: Record<string, any> = {}
  settings.forEach(s => {
    settingsMap[s.key] = s.value
  })

  // Defaults
  if (settingsMap.login_enabled_microsoft === undefined) settingsMap.login_enabled_microsoft = true
  if (settingsMap.school_name === undefined) settingsMap.school_name = ''
  if (settingsMap.nav_permissions === undefined) settingsMap.nav_permissions = {}
  if (settingsMap.teacher_quick_grading_enabled === undefined) settingsMap.teacher_quick_grading_enabled = true
  if (settingsMap.mobile_block_enabled === undefined) settingsMap.mobile_block_enabled = false
  if (settingsMap.mobile_min_width === undefined) settingsMap.mobile_min_width = 1024

  res.json(settingsMap)
})

settingsRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
  const settings = await Setting.find({}).lean()
  const settingsMap: Record<string, any> = {}
  settings.forEach(s => {
    settingsMap[s.key] = s.value
  })
  res.json(settingsMap)
})

settingsRouter.post('/', requireAuth(['ADMIN']), async (req, res) => {
  const { key, value } = req.body
  if (!key) return res.status(400).json({ error: 'missing_key' })

  await Setting.findOneAndUpdate(
    { key },
    { key, value },
    { upsert: true, new: true }
  )
  res.json({ success: true })
})

settingsRouter.post('/restart', requireAuth(['ADMIN']), async (req, res) => {
  res.json({ success: true, message: 'Restarting server...' })
  setTimeout(() => {
    process.exit(1)
  }, 1000)
})

// Test SMTP connection
settingsRouter.post('/smtp/test', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { host, port, user, pass, secure, testEmail } = req.body

    if (!host || !user || !pass) {
      return res.status(400).json({ success: false, error: 'Configuration SMTP incomplète' })
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port) || 587,
      secure: secure === true,
      auth: { user, pass }
    })

    // Verify connection
    await transporter.verify()

    // Send test email if address provided
    if (testEmail) {
      await transporter.sendMail({
        from: user,
        to: testEmail,
        subject: 'Test SMTP - NVCAR',
        text: 'Ce message confirme que la configuration SMTP fonctionne correctement.',
        html: '<h2>Test SMTP réussi</h2><p>Ce message confirme que la configuration SMTP fonctionne correctement.</p>'
      })
      return res.json({ success: true, message: 'Email de test envoyé avec succès' })
    }

    res.json({ success: true, message: 'Connexion SMTP vérifiée avec succès' })
  } catch (err: any) {
    console.error('SMTP test error:', err)
    res.status(400).json({
      success: false,
      error: err.message || 'Erreur de connexion SMTP'
    })
  }
})

// Mobile Access Logging
import { MobileAccessLog } from '../models/MobileAccessLog'

// Helper to parse user agent
function parseUserAgent(ua: string) {
  let deviceType = 'unknown'
  let browser = 'unknown'
  let os = 'unknown'

  // Device type
  if (/iPad/i.test(ua)) deviceType = 'tablet'
  else if (/iPhone|iPod/i.test(ua)) deviceType = 'phone'
  else if (/Android/i.test(ua)) {
    deviceType = /Mobile/i.test(ua) ? 'phone' : 'tablet'
  } else if (/Windows Phone/i.test(ua)) deviceType = 'phone'
  else if (/Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua)) deviceType = 'phone'
  else deviceType = 'desktop'

  // Browser
  if (/Chrome/i.test(ua) && !/Edge|Edg/i.test(ua)) browser = 'Chrome'
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari'
  else if (/Firefox/i.test(ua)) browser = 'Firefox'
  else if (/Edge|Edg/i.test(ua)) browser = 'Edge'
  else if (/Opera|OPR/i.test(ua)) browser = 'Opera'
  else if (/MSIE|Trident/i.test(ua)) browser = 'Internet Explorer'

  // OS
  if (/Windows/i.test(ua)) os = 'Windows'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/Mac/i.test(ua)) os = 'macOS'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/Linux/i.test(ua)) os = 'Linux'

  return { deviceType, browser, os }
}

// Log a mobile access attempt (public endpoint - no auth required)
settingsRouter.post('/mobile-access-log', async (req, res) => {
  try {
    const { screenWidth, screenHeight, path } = req.body
    const userAgent = req.headers['user-agent'] || 'unknown'

    // Get IP address
    const forwarded = req.headers['x-forwarded-for']
    const ipAddress = typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket.remoteAddress || 'unknown'

    const parsed = parseUserAgent(userAgent)

    await MobileAccessLog.create({
      ipAddress,
      userAgent,
      screenWidth,
      screenHeight,
      deviceType: parsed.deviceType,
      browser: parsed.browser,
      os: parsed.os,
      path,
      timestamp: new Date()
    })

    res.json({ success: true })
  } catch (err) {
    console.error('Mobile access log error:', err)
    res.status(500).json({ error: 'failed_to_log' })
  }
})

// Get mobile access logs (admin only)
settingsRouter.get('/mobile-access-logs', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const logs = await MobileAccessLog.find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()

    res.json(logs)
  } catch (err) {
    console.error('Mobile logs fetch error:', err)
    res.status(500).json({ error: 'failed_to_fetch' })
  }
})

// Clear mobile access logs (admin only)
settingsRouter.delete('/mobile-access-logs', requireAuth(['ADMIN']), async (req, res) => {
  try {
    await MobileAccessLog.deleteMany({})
    res.json({ success: true })
  } catch (err) {
    console.error('Mobile logs clear error:', err)
    res.status(500).json({ error: 'failed_to_clear' })
  }
})

