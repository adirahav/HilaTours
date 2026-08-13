import { Request, Response, NextFunction } from 'express'
import { verifyToken, JwtPayload } from '../lib/jwt'
import { ROLE_ADMIN } from '../models/user.model'

export interface AuthedRequest extends Request {
  admin?: JwtPayload
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const token = header.slice('Bearer '.length).trim()
  try {
    req.admin = verifyToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Authorization, not authentication: a valid token is NOT enough. Every
// admin-only management route must use this on top of `requireAuth`, so an
// account created via public self-signup (roles: ["user"]) is rejected.
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const roles = req.admin?.roles
  if (!Array.isArray(roles) || !roles.includes(ROLE_ADMIN)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
