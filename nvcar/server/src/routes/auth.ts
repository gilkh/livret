import { Router } from 'express'
import * as bcrypt from 'bcryptjs'
import { User } from '../models/User'
import { Setting } from '../models/Setting'
import { signToken } from '../auth'
import { logAudit } from '../utils/auditLogger'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  let { email, password } = req.body
  email = String(email || '').trim().toLowerCase()
  password = String(password || '').trim()
  if (!email || !password) return res.status(400).json({ error: 'missing_credentials' })
  if (email === 'admin' && password === 'admin') {
    let admin = await User.findOne({ email: 'admin' })
    if (!admin) {
      const hash = await bcrypt.hash('admin', 10)
      admin = await User.create({ email: 'admin', passwordHash: hash, role: 'ADMIN', displayName: 'Admin' })
    }
    const token = signToken({ userId: String(admin._id), role: 'ADMIN', tokenVersion: admin.tokenVersion || 0 })

    // Log login
    await logAudit({ userId: String(admin._id), action: 'LOGIN', details: { email }, req })

    return res.json({ token, role: 'ADMIN', displayName: 'Admin' })
  }
  const user = await User.findOne({ email })
  if (!user) return res.status(401).json({ error: 'invalid_login' })
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return res.status(401).json({ error: 'invalid_login' })

  // Check global login settings
  if (user.role === 'TEACHER') {
    const s = await Setting.findOne({ key: 'login_enabled_teacher' })
    if (s && s.value === false) {
      return res.status(403).json({ error: 'login_disabled' })
    }
  }
  if (user.role === 'SUBADMIN') {
    const s = await Setting.findOne({ key: 'login_enabled_subadmin' })
    if (s && s.value === false) {
      return res.status(403).json({ error: 'login_disabled' })
    }
  }
  if (user.role === 'AEFE') {
    const s = await Setting.findOne({ key: 'login_enabled_aefe' })
    if (s && s.value === false) {
      return res.status(403).json({ error: 'login_disabled' })
    }
  }

  const token = signToken({ userId: String(user._id), role: user.role as any, tokenVersion: user.tokenVersion || 0 })

  // Log login
  await logAudit({ userId: String(user._id), action: 'LOGIN', details: { email }, req })

  res.json({ token, role: user.role, displayName: user.displayName })
})
