import jwt from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  email: string
  username: string
  // Embedded at issuance so `tour-service` can authorize locally without
  // calling back into this service. A role change only takes effect on the
  // admin's next login (see api-contract, "Roles & permissions").
  roles: string[]
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET is not set')
  }
  return secret
}

export function signToken(payload: JwtPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d'
  return jwt.sign(payload, getSecret(), { expiresIn } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload
}
