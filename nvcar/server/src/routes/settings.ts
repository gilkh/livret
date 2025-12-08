import { Router } from 'express'
import mongoose from 'mongoose'
import { requireAuth } from '../auth'
import { Setting } from '../models/Setting'

export const settingsRouter = Router()

settingsRouter.get('/status', requireAuth(['ADMIN']), async (req, res) => {
  const dbState = mongoose.connection.readyState
  const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected'

  res.json({
    backend: 'online',
    database: dbStatus,
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
