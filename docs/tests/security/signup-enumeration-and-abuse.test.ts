/**
 * Security regression tests — AGE-294 "Signup page" audit.
 *
 * Covers two secondary findings on user-management-service's public
 * POST /auth/signup endpoint:
 *   1. User/email enumeration via the verbatim "email already exists" error.
 *   2. Absence of any rate limiting, allowing unlimited account creation.
 *
 * Run with: npx vitest run docs/tests/security/signup-enumeration-and-abuse.test.ts
 * (executed from repo root)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret'
process.env.JWT_EXPIRES_IN = '7d'

let mongo: MongoMemoryServer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri(), { dbName: 'HILA_TOURS_SECURITY_TEST' })
  app = (await import('../../../backend/user-management-service/api/server')).default
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

beforeEach(async () => {
  const db = mongoose.connection.db
  if (db) await db.dropDatabase()
})

describe('SECURITY: POST /api/auth/signup enumeration', () => {
  it('FINDING (medium): reveals via distinct error text whether an email is already registered', async () => {
    const payload = { fullname: 'Existing User', email: 'exists@example.com', password: '123456' }
    await request(app).post('/api/auth/signup').send(payload)

    const dupRes = await request(app)
      .post('/api/auth/signup')
      .send({ ...payload, fullname: 'Someone Else' })

    const freshRes = await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'Brand New', email: 'never-seen@example.com', password: '123456' })

    expect(dupRes.status).toBe(400)
    // This currently passes, proving the endpoint tells an attacker
    // "exists@example.com" is a registered account — a user-enumeration oracle.
    // A hardened response would use a generic message that doesn't confirm
    // whether the collision was on email specifically.
    expect(dupRes.body.error).toMatch(/email already exists/i)
    expect(freshRes.status).toBe(200)
  })
})

describe('SECURITY: POST /api/auth/signup abuse / rate limiting', () => {
  it('FINDING (medium): allows unlimited rapid-fire account creation with no throttling', async () => {
    const attempts = 8
    const results: number[] = []
    for (let i = 0; i < attempts; i++) {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ fullname: `Bot ${i}`, email: `bot${i}@example.com`, password: '123456' })
      results.push(res.status)
    }
    // Vulnerable current behavior: every single request succeeds (200),
    // none are throttled with 429. A hardened endpoint should start
    // rejecting after a small number of attempts from the same
    // IP/session within a short window.
    expect(results.filter((s) => s === 200)).toHaveLength(attempts)
    expect(results.includes(429)).toBe(false)
  })
})

describe('SECURITY: POST /api/auth/signup cannot self-grant admin role', () => {
  it('ignores a client-supplied roles field attempting privilege escalation', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        fullname: 'Would Be Admin',
        email: 'wannabe-admin@example.com',
        password: '123456',
        roles: ['admin'],
      })
    expect(res.status).toBe(200)
    const token = res.body as string
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'))
    expect(decoded.roles).toEqual(['user'])
  })
})
