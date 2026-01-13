import { Router } from 'express'
import { requireAuth } from '../auth'
import { User } from '../models/User'
import { OutlookUser } from '../models/OutlookUser'
import * as bcrypt from 'bcryptjs'
import { logAudit } from '../utils/auditLogger'

export const usersRouter = Router()

// Get all active users (default) or include deleted with query param
usersRouter.get('/', requireAuth(['ADMIN']), async (req, res) => {
  const { includeDeleted } = req.query

  // Build query based on whether to include deleted users
  const userQuery: any = includeDeleted === 'true'
    ? {}
    : { $or: [{ status: 'active' }, { status: { $exists: false } }] }

  const [users, outlookUsers] = await Promise.all([
    User.find(userQuery).lean(),
    OutlookUser.find({}).lean()
  ])

  const normalizedUsers = users.map(u => {
    const raw = u as any
    const { passwordHash: _passwordHash, ...safe } = raw
    const inferredProvider = raw.authProvider || (raw.passwordHash === 'oauth-managed' ? 'microsoft' : 'local')
    return {
      ...safe,
      status: raw.status || 'active',
      authProvider: inferredProvider,
      isOutlook: false,
    }
  })

  const normalizedOutlookUsers = outlookUsers.map(u => ({
    ...u,
    _id: u._id,
    email: u.email,
    displayName: u.displayName || u.email,
    role: u.role,
    isOutlook: true,
    authProvider: 'microsoft',
    status: 'active'
  }))

  // Merge and normalize
  // Deduplicate: If a user exists in OutlookUsers, prioritize that entry
  // (OutlookUser ID is used for authentication for these users)
  const outlookEmails = new Set(normalizedOutlookUsers.map(u => u.email.toLowerCase()))
  const uniqueLocalUsers = normalizedUsers.filter(u => !outlookEmails.has(u.email.toLowerCase()))

  const allUsers = [...uniqueLocalUsers, ...normalizedOutlookUsers]

  res.json(allUsers)
})

// Get only deleted users (for admin restore functionality)
usersRouter.get('/deleted', requireAuth(['ADMIN']), async (req, res) => {
  const users = await User.find({ status: 'deleted' }).lean()
  res.json(users)
})

usersRouter.post('/', requireAuth(['ADMIN']), async (req, res) => {
  const { email, password, role, displayName } = req.body
  const adminId = (req as any).user?.userId

  if (!email || !password || !role) return res.status(400).json({ error: 'missing_payload' })

  // Check if email exists (including deleted users)
  const exists = await User.findOne({ email })
  if (exists) {
    // If user was deleted, offer to reactivate
    if ((exists as any).status === 'deleted') {
      return res.status(409).json({
        error: 'email_exists_deleted',
        message: 'A deleted user with this email exists. Reactivate instead?',
        userId: exists._id
      })
    }
    return res.status(409).json({ error: 'email_exists' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await User.create({
    email,
    passwordHash,
    role,
    displayName: displayName || email,
    status: 'active'
  })

  // Log the user creation
  await logAudit({
    userId: adminId,
    action: 'CREATE_USER',
    details: {
      createdUserId: String(user._id),
      email: user.email,
      role: user.role,
      displayName: user.displayName
    },
    req
  })

  res.json(user)
})

usersRouter.patch('/:id/password', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const { password } = req.body
  const adminId = (req as any).user?.userId

  if (!password) return res.status(400).json({ error: 'missing_password' })
  const user = await User.findById(id)
  if (!user) return res.status(404).json({ error: 'not_found' })

  user.passwordHash = await bcrypt.hash(password, 10)
  await user.save()

  // Log password reset
  await logAudit({
    userId: adminId,
    action: 'RESET_PASSWORD',
    details: {
      targetUserId: id,
      targetUserEmail: user.email
    },
    req
  })

  res.json({ ok: true })
})

usersRouter.patch('/:id', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const { displayName, status } = req.body
  const adminId = (req as any).user?.userId

  const user = await User.findById(id)
  if (!user) return res.status(404).json({ error: 'not_found' })

  const changes: any = {}
  if (displayName !== undefined) {
    changes.displayName = { from: user.displayName, to: displayName }
    user.displayName = displayName
  }
  if (status !== undefined && ['active', 'inactive'].includes(status)) {
    changes.status = { from: (user as any).status, to: status }
      ; (user as any).status = status
  }

  await user.save()

  // Log user update
  await logAudit({
    userId: adminId,
    action: 'UPDATE_USER',
    details: {
      targetUserId: id,
      targetUserEmail: user.email,
      changes
    },
    req
  })

  res.json(user)
})

// Soft-delete: Mark user as deleted instead of removing
usersRouter.delete('/:id', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const adminId = (req as any).user?.userId

  const user = await User.findById(id)
  if (!user) return res.status(404).json({ error: 'not_found' })

    // Soft-delete instead of hard delete
    ; (user as any).status = 'deleted'
    ; (user as any).deletedAt = new Date()
    ; (user as any).deletedBy = adminId
  await user.save()

  // Log deletion
  await logAudit({
    userId: adminId,
    action: 'DELETE_USER',
    details: {
      deletedUserId: id,
      deletedUserEmail: user.email,
      deletedUserRole: user.role,
      softDelete: true
    },
    req
  })

  res.json({ ok: true, softDeleted: true })
})

// Reactivate a deleted user
usersRouter.post('/:id/reactivate', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const adminId = (req as any).user?.userId

  const user = await User.findById(id)
  if (!user) return res.status(404).json({ error: 'not_found' })

  if ((user as any).status !== 'deleted') {
    return res.status(400).json({ error: 'user_not_deleted', message: 'User is not deleted' })
  }

  // Reactivate
  ; (user as any).status = 'active'
    ; (user as any).deletedAt = null
    ; (user as any).deletedBy = null
  await user.save()

  // Log reactivation
  await logAudit({
    userId: adminId,
    action: 'REACTIVATE_USER',
    details: {
      reactivatedUserId: id,
      reactivatedUserEmail: user.email,
      reactivatedUserRole: user.role
    },
    req
  })

  res.json({ ok: true, user })
})

// Hard delete (permanent) - requires extra confirmation
usersRouter.delete('/:id/permanent', requireAuth(['ADMIN']), async (req, res) => {
  const { id } = req.params
  const { confirm } = req.body
  const adminId = (req as any).user?.userId

  if (confirm !== 'PERMANENTLY_DELETE') {
    return res.status(400).json({
      error: 'confirmation_required',
      message: 'Set confirm: "PERMANENTLY_DELETE" to proceed'
    })
  }

  const user = await User.findById(id)
  if (!user) return res.status(404).json({ error: 'not_found' })

  // Capture details before deletion
  const userDetails = {
    email: user.email,
    role: user.role,
    displayName: user.displayName
  }

  await User.findByIdAndDelete(id)

  // Log permanent deletion
  await logAudit({
    userId: adminId,
    action: 'DELETE_USER',
    details: {
      deletedUserId: id,
      deletedUserEmail: userDetails.email,
      deletedUserRole: userDetails.role,
      permanentDelete: true
    },
    req
  })

  res.json({ ok: true, permanentlyDeleted: true })
})
