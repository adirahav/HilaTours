import { Request, Response } from 'express'
import { forgotPassword } from './forgot-password.service'

export async function forgotPasswordHandler(req: Request, res: Response) {
  try {
    await forgotPassword((req.body || {}).email)
    res.status(200).json({ message: 'Password reset instructions sent' })
  } catch (err: any) {
    res.status(err.status || 400).json({ error: err.message || 'Failed to process request' })
  }
}
