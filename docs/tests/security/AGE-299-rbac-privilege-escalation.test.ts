/**
 * Security regression tests — AGE-299 "Implement RBAC in user-management-service".
 *
 * Independently verifies (black-box against the real middleware/services, not
 * mocks) that the RBAC rollout actually closes the privilege-escalation gap
 * flagged in the AGE-294 audit, and that no new gap was introduced by it:
 *
 *  1. tour-service's `requirePermission` middleware fails CLOSED for every
 *     malformed/missing/unknown `roles` claim shape (a JWT that is valid but
 *     carries an unexpected roles shape must never resolve to "allow").
 *  2. A self-signed-up `roles: ["user"]` token cannot reach any admin-gated
 *     tour-service route, but a `roles: ["admin"]` token still can.
 *  3. user-management-service's `signup()` cannot be used to self-assign
 *     `roles: ["admin"]` (or any other role) via the request body, even
 *     though the HTTP layer forwards `req.body` verbatim into the service.
 *  4. user-management-service's new `GET /role` / `GET /permission` lookups
 *     require authentication and never leak Mongo internals (`_id`/`__v`/
 *     `uuid`), matching the API contract's documented `Role`/`Permission`
 *     schema shape.
 *
 * Run with:
 *   npx vitest run docs/tests/security/AGE-299-rbac-privilege-escalation.test.ts
 * (executed from repo root; imports each service's real source directly)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import express, { Request, Response } from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

const JWT_SECRET = 'test-secret-age-299-rbac-audit'

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET
  process.env.JWT_EXPIRES_IN = '7d'
})

function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
}

// ---------------------------------------------------------------------------
// Part 1 & 2: tour-service `requirePermission` — fail-closed authorization
// ---------------------------------------------------------------------------
describe('SECURITY: tour-service requirePermission fails closed on the roles claim', () => {
  async function buildAppOnAdminInsert() {
    const { requirePermission } = await import(
      '../../../backend/tour-service/api/auth/auth.middleware'
    )
    const app = express()
    app.use(express.json())
    app.post('/tour', requirePermission('tour:insert'), (_req: Request, res: Response) => {
      res.status(200).json({ ok: true })
    })
    return app
  }

  it('CRITICAL-CLOSED: rejects a well-signed roles:["user"] token on an admin-only mutation with 403', async () => {
    const app = await buildAppOnAdminInsert()
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

    expect(res.status).toBe(403)
  })

  it('allows a well-signed roles:["admin"] token on the same route', async () => {
    const app = await buildAppOnAdminInsert()
    const adminToken = signToken({
      sub: 'a1b2c3d4-0000-0000-0000-000000000002',
      email: 'admin@example.com',
      username: 'admin',
      roles: ['admin'],
    })

    const res = await request(app)
      .post('/tour')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Legit Tour' })

    expect(res.status).toBe(200)
  })

  it('fails closed: empty roles array -> 403, not 200', async () => {
    const app = await buildAppOnAdminInsert()
    const token = signToken({ sub: 'uuid-no-roles', roles: [] })
    const res = await request(app).post('/tour').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(403)
  })

  it('fails closed: roles claim entirely absent -> 403, not 200', async () => {
    const app = await buildAppOnAdminInsert()
    const token = signToken({ sub: 'uuid-missing-roles-claim' })
    const res = await request(app).post('/tour').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(403)
  })

  it('fails closed: roles claim is a non-array (e.g. a string) -> 403, not 200/500', async () => {
    const app = await buildAppOnAdminInsert()
    const token = signToken({ sub: 'uuid-bad-roles-type', roles: 'admin' })
    const res = await request(app).post('/tour').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(403)
  })

  it('fails closed: unknown/typo role name (e.g. "Admin") is not treated as admin', async () => {
    const app = await buildAppOnAdminInsert()
    const token = signToken({ sub: 'uuid-typo-role', roles: ['Admin', 'ADMIN', 'administrator'] })
    const res = await request(app).post('/tour').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(403)
  })

  it('rejects a token signed with the wrong secret (forged/tampered JWT) with 401, not 403', async () => {
    const app = await buildAppOnAdminInsert()
    const forged = jwt.sign({ sub: 'x', roles: ['admin'] }, 'attacker-guessed-secret')
    const res = await request(app).post('/tour').set('Authorization', `Bearer ${forged}`).send({})
    expect(res.status).toBe(401)
  })

  it('a forged "permissions" claim cannot grant access without a validly-signed token', async () => {
    const app = await buildAppOnAdminInsert()
    // Even if an attacker could control the payload shape, they cannot sign it
    // without the shared secret, so this must still 401.
    const forged = jwt.sign({ sub: 'x', roles: ['user'], permissions: ['tour:insert'] }, 'wrong-secret')
    const res = await request(app).post('/tour').set('Authorization', `Bearer ${forged}`).send({})
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Part 3: user-management-service signup cannot self-assign roles
// ---------------------------------------------------------------------------
describe('SECURITY: user-management-service signup ignores client-supplied roles', () => {
  let mongo: MongoMemoryServer

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: 'AGE_299_SIGNUP_SECURITY' })
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongo.stop()
  })

  beforeEach(async () => {
    const db = mongoose.connection.db
    if (db) await db.dropDatabase()
  })

  it('CRITICAL-CLOSED: a signup payload with roles:["admin"] still results in roles:["user"]', async () => {
    const { signup } = await import('../../../backend/user-management-service/api/auth/auth.service')
    const { verifyToken } = await import('../../../backend/user-management-service/api/lib/jwt')

    const token = await signup({
      email: 'escalator@example.com',
      password: 'password123',
      // @ts-expect-error deliberately probing beyond the typed SignupInput shape
      roles: ['admin'],
    })

    const payload = verifyToken(token)
    expect(payload.roles).toEqual(['user'])
    expect(payload.roles).not.toContain('admin')
  })

  it('a signup payload with an arbitrary/garbage roles value is still forced to ["user"]', async () => {
    const { signup } = await import('../../../backend/user-management-service/api/auth/auth.service')
    const { verifyToken } = await import('../../../backend/user-management-service/api/lib/jwt')

    const token = await signup({
      email: 'escalator2@example.com',
      password: 'password123',
      // @ts-expect-error deliberately probing a NoSQL-injection-flavored payload
      roles: { $gt: '' },
    })

    const payload = verifyToken(token)
    expect(payload.roles).toEqual(['user'])
  })

  it('the persisted User document itself has roles:["user"], not just the JWT', async () => {
    const { signup } = await import('../../../backend/user-management-service/api/auth/auth.service')
    const { User } = await import('../../../backend/user-management-service/api/models/user.model')

    await signup({
      email: 'escalator3@example.com',
      password: 'password123',
      // @ts-expect-error deliberately probing beyond the typed SignupInput shape
      roles: ['admin'],
    })

    const stored = await User.findOne({ email: 'escalator3@example.com' })
    expect(stored?.roles).toEqual(['user'])
  })
})

// ---------------------------------------------------------------------------
// Part 4: GET /role and GET /permission — auth-gated, no internal-field leaks
// ---------------------------------------------------------------------------
describe('SECURITY: user-management-service GET /role and GET /permission', () => {
  let mongo: MongoMemoryServer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: 'AGE_299_ROLE_ENDPOINT_SECURITY' })
    app = (await import('../../../backend/user-management-service/api/server')).default
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongo.stop()
  })

  beforeEach(async () => {
    const db = mongoose.connection.db
    if (db) await db.dropDatabase()
    const { Permission } = await import('../../../backend/user-management-service/api/models/permission.model')
    const { Role } = await import('../../../backend/user-management-service/api/models/role.model')
    await Permission.create({ key: 'tour:insert', description: 'Create a tour', category: 'tour' })
    await Role.create({ name: 'admin', description: 'System administrator', permissions: ['tour:insert'] })
  })

  it('GET /api/role rejects unauthenticated requests with 401 (not 200 with data)', async () => {
    const res = await request(app).get('/api/role')
    expect(res.status).toBe(401)
  })

  it('GET /api/permission rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/permission')
    expect(res.status).toBe(401)
  })

  it('GET /api/role rejects a garbage/malformed bearer token with 401', async () => {
    const res = await request(app).get('/api/role').set('Authorization', 'Bearer not-a-jwt')
    expect(res.status).toBe(401)
  })

  it('any authenticated user (not just admin) can read /role and /permission, and the response leaks no _id/__v/uuid', async () => {
    const userToken = signToken({ sub: 'plain-user-uuid', email: 'u@example.com', username: 'u', roles: ['user'] })

    const roleRes = await request(app).get('/api/role').set('Authorization', `Bearer ${userToken}`)
    expect(roleRes.status).toBe(200)
    expect(Array.isArray(roleRes.body)).toBe(true)
    for (const role of roleRes.body) {
      expect(role).not.toHaveProperty('_id')
      expect(role).not.toHaveProperty('__v')
      expect(role).not.toHaveProperty('uuid')
      expect(role).toHaveProperty('id')
    }

    const permRes = await request(app).get('/api/permission').set('Authorization', `Bearer ${userToken}`)
    expect(permRes.status).toBe(200)
    for (const perm of permRes.body) {
      expect(perm).not.toHaveProperty('_id')
      expect(perm).not.toHaveProperty('__v')
      expect(perm).not.toHaveProperty('uuid')
      expect(perm).toHaveProperty('id')
    }
  })
})
