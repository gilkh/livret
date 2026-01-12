import { Request, Response, NextFunction } from 'express'
import jwt, { SignOptions } from 'jsonwebtoken'

import { User } from './models/User'
import { isSimulationSandbox } from './utils/simulationSandbox'

const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change'

export type Role = 'ADMIN' | 'SUBADMIN' | 'TEACHER' | 'AEFE'

export const signToken = (
  payload: { userId: string; role: Role; impersonateUserId?: string; impersonateRole?: Role; tokenVersion?: number },
  options?: { expiresIn?: SignOptions['expiresIn'] }
) => {
  return jwt.sign(payload, jwtSecret, { expiresIn: options?.expiresIn ?? '2h' })
}

export const requireAuth = (roles?: Role[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    let token = ''
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice('Bearer '.length)
    } else if (req.query.token) {
      token = String(req.query.token)
    }

    if (!token) return res.status(401).json({ error: 'unauthorized' })

    try {
      const decoded = jwt.verify(token, jwtSecret) as {
        userId: string;
        role: Role;
        impersonateUserId?: string;
        impersonateRole?: Role;
        tokenVersion?: number;
        iat?: number;
        exp?: number;
      }
        ; (req as any).authToken = token
        ; (req as any).tokenPayload = decoded

      // If impersonating, use the impersonated user's ID and role for authorization
      // but keep the original admin info for audit trails
      const effectiveUserId = decoded.impersonateUserId || decoded.userId
      const effectiveRole = decoded.impersonateRole || decoded.role

      // Check token version and update lastActive
      // We check the ACTUAL user (the one who logged in) - could be in User or OutlookUser collection
      let user = await User.findById(decoded.userId)
      let isOutlookUser = false
      let outlookUser: any = null

      if (!user) {
        // Check OutlookUser collection - MS OAuth users may be stored there
        const { OutlookUser } = await import('./models/OutlookUser')
        outlookUser = await OutlookUser.findById(decoded.userId)

        if (outlookUser) {
          isOutlookUser = true
        } else {
          // In the sandbox server, we intentionally run against an isolated DB.
          // We still want to reuse the normal admin login to control simulations,
          // so allow a valid ADMIN token even if the user doc isn't present in the sandbox DB.
          if (isSimulationSandbox() && decoded.role === 'ADMIN') {
            ; (req as any).user = {
              userId: effectiveUserId,
              role: effectiveRole,
              actualUserId: decoded.userId,
              actualRole: decoded.role,
              isImpersonating: !!decoded.impersonateUserId,
              bypassScopes: [],
            }

            if (roles && !roles.includes(effectiveRole)) return res.status(403).json({ error: 'forbidden' })
            return next()
          }

          return res.status(401).json({ error: 'user_not_found' })
        }
      }

      if (isOutlookUser && outlookUser) {
        // OutlookUser doesn't have tokenVersion, so skip that check
        // Update lastLogin for OutlookUser
        await import('./models/OutlookUser').then(({ OutlookUser }) =>
          OutlookUser.findByIdAndUpdate(decoded.userId, { lastLogin: new Date() })
        )

          ; (req as any).user = {
            userId: effectiveUserId,
            role: effectiveRole,
            actualUserId: decoded.userId,
            actualRole: decoded.role,
            isImpersonating: !!decoded.impersonateUserId,
            bypassScopes: []
          }
      } else if (user) {
        const tokenVersion = decoded.tokenVersion || 0
        if ((user.tokenVersion || 0) > tokenVersion) {
          return res.status(401).json({ error: 'token_expired' })
        }

        // Check if user account is active
        const userStatus = (user as any).status || 'active'
        if (userStatus === 'deleted') {
          return res.status(401).json({ error: 'account_deleted', message: 'This account has been deleted' })
        }
        if (userStatus === 'inactive') {
          return res.status(401).json({ error: 'account_disabled', message: 'This account has been deactivated' })
        }

        // Update lastActive
        user.lastActive = new Date()
        await user.save()

          ; (req as any).user = {
            userId: effectiveUserId,
            role: effectiveRole,
            actualUserId: decoded.userId, // Original admin user ID
            actualRole: decoded.role,     // Original admin role
            isImpersonating: !!decoded.impersonateUserId,
            bypassScopes: user.bypassScopes || []
          }
      }

      if (roles && !roles.includes(effectiveRole)) return res.status(403).json({ error: 'forbidden' })
      next()
    } catch (e) {
      return res.status(401).json({ error: 'invalid_token' })
    }
  }
}
