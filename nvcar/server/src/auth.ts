import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change'

export type Role = 'ADMIN' | 'SUBADMIN' | 'TEACHER'

export const signToken = (payload: { userId: string; role: Role; impersonateUserId?: string; impersonateRole?: Role }) => {
  return jwt.sign(payload, jwtSecret, { expiresIn: '2h' })
}

export const requireAuth = (roles?: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' })
    try {
      const token = header.slice('Bearer '.length)
      const decoded = jwt.verify(token, jwtSecret) as { 
        userId: string; 
        role: Role;
        impersonateUserId?: string;
        impersonateRole?: Role;
      }
      
      // If impersonating, use the impersonated user's ID and role for authorization
      // but keep the original admin info for audit trails
      const effectiveUserId = decoded.impersonateUserId || decoded.userId
      const effectiveRole = decoded.impersonateRole || decoded.role
      
      ;(req as any).user = {
        userId: effectiveUserId,
        role: effectiveRole,
        actualUserId: decoded.userId, // Original admin user ID
        actualRole: decoded.role,     // Original admin role
        isImpersonating: !!decoded.impersonateUserId
      }
      
      if (roles && !roles.includes(effectiveRole)) return res.status(403).json({ error: 'forbidden' })
      next()
    } catch (e) {
      return res.status(401).json({ error: 'invalid_token' })
    }
  }
}
