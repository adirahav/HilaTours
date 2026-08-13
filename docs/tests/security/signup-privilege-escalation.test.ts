/**
 * Security regression tests — AGE-294 "Signup page" audit.
 *
 * These tests exercise a cross-service privilege-escalation issue introduced
 * by shipping public self-signup: user-management-service now issues valid,
 * signed JWTs with `roles: ["user"]` to anyone who calls POST /auth/signup.
 * tour-service's `requireAdmin` middleware (backend/tour-service/api/auth/auth.middleware.ts)
 * verifies the JWT signature but never inspects the `roles` claim, so a
 * self-registered non-admin account's token is accepted by every
 * admin-gated tour/bus/manifest/seat mutation route in tour-service.
 *
 * Run with: npx vitest run docs/tests/security/signup-privilege-escalation.test.ts
 * (executed from repo root; imports tour-service's middleware directly)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import express, { Request, Response } from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const JWT_SECRET = 'test-secret-for-security-audit'

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET
})

function buildAppWithMiddleware(requireAdmin: any) {
  const app = express()
  app.use(express.json())
  app.post('/tour', requireAdmin, (_req: Request, res: Response) => {
    res.status(200).json({ ok: true })
  })
  return app
}

function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

describe('SECURITY: tour-service requireAdmin does not enforce roles claim', () => {
  it('CRITICAL: accepts a token minted for a plain self-signup "user" role on an admin-only mutation route', async () => {
    const { requireAdmin } = await import(
      '../../../backend/tour-service/api/auth/auth.middleware'
    )
    const app = buildAppWithMiddleware(requireAdmin)

    // This is exactly the shape of JWT that user-management-service's
    // POST /auth/signup issues to every public self-registered account:
    // roles: ["user"], never "admin".
    const selfSignupToken = signToken({
      sub: 'a1b2c3d4-0000-0000-0000-000000000001',
      email: 'attacker@example.com',
      username: 'attacker',
      roles: ['user'],
    })

    const res = await request(app)
      .post('/tour')
      .set('Authorization', `Bearer ${selfSignupToken}`)
      .send({ name: 'Malicious Tour' })

    // EXPECTED (secure) behavior: 403 Forbidden, because roles does not include "admin".
    // ACTUAL (current) behavior: 200, because requireAdmin never checks roles at all.
    // This assertion documents the vulnerability: it currently PASSES with 200,
    // proving any self-signed-up account can hit admin-only tour-service routes.
    expect(res.status).toBe(200)
  })

  it('also accepts a token with an empty roles array', async () => {
    const { requireAdmin } = await import(
      '../../../backend/tour-service/api/auth/auth.middleware'
    )
    const app = buildAppWithMiddleware(requireAdmin)
    const token = signToken({ sub: 'uuid-no-roles', roles: [] })

    const res = await request(app)
      .post('/tour')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(200) // vulnerable: should be 403
  })

  it('also accepts a token with no roles claim present at all', async () => {
    const { requireAdmin } = await import(
      '../../../backend/tour-service/api/auth/auth.middleware'
    )
    const app = buildAppWithMiddleware(requireAdmin)
    const token = signToken({ sub: 'uuid-missing-roles-claim' })

    const res = await request(app)
      .post('/tour')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(200) // vulnerable: should be 403
  })

  it('correctly rejects a token with a bad signature (baseline sanity check)', async () => {
    const { requireAdmin } = await import(
      '../../../backend/tour-service/api/auth/auth.middleware'
    )
    const app = buildAppWithMiddleware(requireAdmin)
    const forged = jwt.sign({ sub: 'x', roles: ['admin'] }, 'wrong-secret')

    const res = await request(app)
      .post('/tour')
      .set('Authorization', `Bearer ${forged}`)
      .send({})

    expect(res.status).toBe(401)
  })

  it('REFERENCE: user-management-service requireAdmin correctly rejects the same "user"-role token', async () => {
    const { requireAdmin } = await import(
      '../../../backend/user-management-service/api/auth/auth.middleware'
    )
    const app = buildAppWithMiddleware(requireAdmin)
    const selfSignupToken = signToken({
      sub: 'a1b2c3d4-0000-0000-0000-000000000002',
      email: 'attacker2@example.com',
      username: 'attacker2',
      roles: ['user'],
    })

    const res = await request(app)
      .post('/tour')
      .set('Authorization', `Bearer ${selfSignupToken}`)
      .send({})

    // Demonstrates the correct behavior that tour-service is missing.
    expect(res.status).toBe(403)
  })
})
