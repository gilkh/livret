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
    key: { $in: ['login_enabled_microsoft', 'school_name', 'nav_permissions'] }
  }).lean()

  const settingsMap: Record<string, any> = {}
  settings.forEach(s => {
    settingsMap[s.key] = s.value
  })

  // Defaults
  if (settingsMap.login_enabled_microsoft === undefined) settingsMap.login_enabled_microsoft = true
  if (settingsMap.school_name === undefined) settingsMap.school_name = ''
  if (settingsMap.nav_permissions === undefined) settingsMap.nav_permissions = {}

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
