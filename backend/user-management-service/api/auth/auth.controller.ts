import { Request, Response } from 'express'
import * as authService from './auth.service'

export async function signup(req: Request, res: Response) {
  try {
    const token = await authService.signup(req.body || {})
    res.status(200).json(token)
  } catch (err: any) {
    res.status(err.status || 400).json({ error: err.message || 'Registration failed' })
  }
}

export async function login(req: Request, res: Response) {
  try {
    // DB-only audit metadata (see auth.service.login / UserDoc.lastLogin) —
    // never included in the response, which is still just the raw token.
    const token = await authService.login(req.body || {}, {
      userAgent: req.get('user-agent') ?? null,
      ip: req.ip ?? null,
    })
    res.status(200).json(token)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Server error' })
  }
}

export function logout(_req: Request, res: Response) {
  res.clearCookie('loginToken')
  res.status(200).json(true)
}
