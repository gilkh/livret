import { Router } from 'express'
import { requireAuth } from '../auth'
import { User } from '../models/User'
import * as bcrypt from 'bcryptjs'

export const usersRouter = Router()

usersRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
  const users = await User.find({}).lean()
  res.json(users)
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

usersRouter.delete('/:id', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const user = await User.findByIdAndDelete(id)
  if (!user) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})
