import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change'

export type Role = 'ADMIN' | 'SUBADMIN' | 'TEACHER'

export const signToken = (payload: { userId: string; role: Role }) => {
  return jwt.sign(payload, jwtSecret, { expiresIn: '2h' })
}

export const requireAuth = (roles?: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' })
    try {
      const token = header.slice('Bearer '.length)
      const decoded = jwt.verify(token, jwtSecret) as { userId: string; role: Role }
      ;(req as any).user = decoded
      if (roles && !roles.includes(decoded.role)) return res.status(403).json({ error: 'forbidden' })
      next()
    } catch (e) {
      return res.status(401).json({ error: 'invalid_token' })
    }
  }
}
