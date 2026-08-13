import { User } from '../models/user.model'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Single-step forgot-password flow. For security we always resolve successfully
 * for a valid-looking email (never reveal whether an account exists). If a
 * matching account exists, this is where a reset email would be dispatched.
 */
export async function forgotPassword(email: string): Promise<void> {
  if (!email || !EMAIL_RE.test(email)) {
    throw Object.assign(new Error('a valid email is required'), { status: 400 })
  }

  // Look up silently; do not leak existence via the response.
  await User.findOne({ email })
  // (Email dispatch would happen here.)
}
