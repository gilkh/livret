import { Router } from 'express'
import { requireAuth } from '../auth'
import { User } from '../models/User'
import { OutlookUser } from '../models/OutlookUser'
import * as bcrypt from 'bcryptjs'

export const usersRouter = Router()

usersRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
  const [users, outlookUsers] = await Promise.all([
    User.find({}).lean(),
    OutlookUser.find({}).lean()
  ])
  
  // Merge and normalize
  const allUsers = [
    ...users,
    ...outlookUsers.map(u => ({
      ...u,
      _id: u._id,
      email: u.email,
      displayName: u.displayName || u.email,
      role: u.role,
      isOutlook: true
    }))
  ]
  
  res.json(allUsers)
})

usersRouter.post('/', requireAuth(['ADMIN']), async (req, res) => {
  const { email, password, role, displayName } = req.body
  if (!email || !password || !role) return res.status(400).json({ error: 'missing_payload' })
  const exists = await User.findOne({ email })
  if (exists) return res.status(409).json({ error: 'email_exists' })
  const passwordHash = await bcrypt.hash(password, 10)
  const user = await User.create({ email, passwordHash, role, displayName: displayName || email })
  res.json(user)
})

usersRouter.patch('/:id/password', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const { password } = req.body
  if (!password) return res.status(400).json({ error: 'missing_password' })
  const user = await User.findById(id)
  if (!user) return res.status(404).json({ error: 'not_found' })
  user.passwordHash = await bcrypt.hash(password, 10)
  await user.save()
  res.json({ ok: true })
})

usersRouter.patch('/:id', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const { displayName } = req.body
  const user = await User.findById(id)
  if (!user) return res.status(404).json({ error: 'not_found' })
  
  if (displayName !== undefined) user.displayName = displayName
  
  await user.save()
  res.json(user)
})

usersRouter.delete('/:id', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const user = await User.findByIdAndDelete(id)
  if (!user) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})
