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
    const token = await authService.login(req.body || {})
    res.status(200).json(token)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Server error' })
  }
}

export function logout(_req: Request, res: Response) {
  res.clearCookie('loginToken')
  res.status(200).json(true)
}
