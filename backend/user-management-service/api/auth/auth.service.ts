import bcrypt from 'bcrypt'
import { User, ROLE_USER } from '../models/user.model'
import { signToken } from '../lib/jwt'

const SALT_ROUNDS = 10

export interface SignupInput {
  fullname?: string
  email: string
  password: string
  // NOTE: no `roles` here by design. Even if a client sends one, signup()
  // builds the User document field-by-field (never spreading req.body), so
  // a client-supplied role can never reach the database.
}

export interface LoginInput {
  email: string
  password: string
}

function deriveUsername(input: SignupInput): string {
  if (input.fullname && input.fullname.trim()) return input.fullname.trim()
  return input.email.split('@')[0]
}

// Reject non-string email/password before they can reach a Mongoose query —
// an object like { $gt: "" } is truthy and would otherwise inject a query
// operator into User.findOne (see security report AGE-124 SEV-003).
function assertCredentialStrings(email: unknown, password: unknown): void {
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw Object.assign(new Error('email and password are required'), { status: 400 })
  }
}

export async function signup(input: SignupInput): Promise<string> {
  const { email, password } = input
  assertCredentialStrings(email, password)

  const username = deriveUsername(input)

  const existing = await User.findOne({ $or: [{ email }, { username }] })
  if (existing) {
    throw Object.assign(new Error('email already exists'), { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  // Self-signup is ALWAYS created with the permission-less `user` role.
  // Fields are listed explicitly (no `...input` spread) so a client-supplied
  // `roles` in the request body cannot escalate privileges.
  const user = await User.create({
    username,
    email,
    passwordHash,
    roles: [ROLE_USER],
  })

  // `sub` is the public uuid identity — never the Mongo `_id`.
  return signToken({
    sub: user.uuid,
    email: user.email,
    username: user.username,
    roles: user.roles,
  })
}

export async function login(input: LoginInput): Promise<string> {
  const { email, password } = input
  assertCredentialStrings(email, password)

  const user = await User.findOne({ email })
  if (!user) {
    throw Object.assign(new Error('invalid email or password'), { status: 401 })
  }

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    throw Object.assign(new Error('invalid email or password'), { status: 401 })
  }

  // `sub` is the public uuid identity — never the Mongo `_id`. The roles are
  // read fresh from the DB at each login, so a promotion/demotion applied
  // out-of-band takes effect on the user's next login.
  return signToken({
    sub: user.uuid,
    email: user.email,
    username: user.username,
    roles: user.roles ?? [],
  })
}
