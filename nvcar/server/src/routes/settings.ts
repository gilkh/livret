import { Router } from 'express'
import { requireAuth } from '../auth'
import { Setting } from '../models/Setting'

export const settingsRouter = Router()

settingsRouter.get('/public', async (req, res) => {
  const settings = await Setting.find({
    key: { $in: ['login_enabled_microsoft', 'school_name'] }
  }).lean()
  
  const settingsMap: Record<string, any> = {}
  settings.forEach(s => {
    settingsMap[s.key] = s.value
  })
  
  // Defaults
  if (settingsMap.login_enabled_microsoft === undefined) settingsMap.login_enabled_microsoft = true
  if (settingsMap.school_name === undefined) settingsMap.school_name = ''
  
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
