import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret'
process.env.JWT_EXPIRES_IN = '7d'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let mongo: MongoMemoryServer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any

// Mirrors the reference data api/scripts/seed.ts upserts at bootstrap.
const PERMISSION_KEYS = [
  'tour:view',
  'tour:insert',
  'tour:update',
  'tour:delete',
  'bus:view',
  'bus:insert',
  'bus:update',
  'bus:delete',
  'seat:view',
  'seat:bookings',
  'seat:approve',
  'seat:cancel',
  'seat:toggleReserve',
  'seat:manualAssign',
  'seat:swapMove',
]

async function seedRbac() {
  const { Permission } = await import('../models/permission.model')
  const { Role } = await import('../models/role.model')
  await Permission.insertMany(
    PERMISSION_KEYS.map((key) => ({
      key,
      description: `Permission ${key}`,
      category: key.split(':')[0] as 'tour' | 'bus' | 'seat',
    }))
  )
  await Role.insertMany([
    { name: 'admin', description: 'System administrator', permissions: PERMISSION_KEYS },
    { name: 'user', description: 'Self-signed-up account', permissions: [] },
  ])
}

async function signupToken(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ fullname: 'Rbac Tester', email, password: '123456' })
  return res.body
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri(), { dbName: 'HILA_TOURS_TEST_RBAC' })
  app = (await import('../server')).default
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

beforeEach(async () => {
  const db = mongoose.connection.db
  if (db) await db.dropDatabase()
  await seedRbac()
})

describe('GET /api/role', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/role')
    expect(res.status).toBe(401)
  })

  it('returns 401 with an invalid token', async () => {
    const res = await request(app).get('/api/role').set('Authorization', 'Bearer not-a-jwt')
    expect(res.status).toBe(401)
  })

  it('returns the seeded admin and user roles with a valid token', async () => {
    const token = await signupToken('roles@example.com')
    const res = await request(app).get('/api/role').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const names = res.body.map((r: any) => r.name).sort()
    expect(names).toEqual(['admin', 'user'])

    const admin = res.body.find((r: any) => r.name === 'admin')
    expect(admin.permissions).toEqual(expect.arrayContaining(PERMISSION_KEYS))
    const user = res.body.find((r: any) => r.name === 'user')
    expect(user.permissions).toEqual([])
  })

  it('serializes uuid as `id` and strips _id/__v', async () => {
    const token = await signupToken('roleshape@example.com')
    const res = await request(app).get('/api/role').set('Authorization', `Bearer ${token}`)

    for (const role of res.body) {
      expect(role.id).toMatch(UUID_RE)
      expect(role._id).toBeUndefined()
      expect(role.uuid).toBeUndefined()
      expect(role.__v).toBeUndefined()
    }
  })

  it('is also reachable on the gateway-prefixed base path', async () => {
    const token = await signupToken('rolegw@example.com')
    const res = await request(app)
      .get('/user-management-service/api/role')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('GET /api/permission', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/permission')
    expect(res.status).toBe(401)
  })

  it('returns all seeded permissions with a valid token', async () => {
    const token = await signupToken('perms@example.com')
    const res = await request(app).get('/api/permission').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(PERMISSION_KEYS.length)
    expect(res.body.map((p: any) => p.key).sort()).toEqual([...PERMISSION_KEYS].sort())
    for (const permission of res.body) {
      expect(['tour', 'bus', 'seat']).toContain(permission.category)
      expect(permission.id).toMatch(UUID_RE)
      expect(permission._id).toBeUndefined()
      expect(permission.uuid).toBeUndefined()
    }
  })

  it('is also reachable on the gateway-prefixed base path', async () => {
    const token = await signupToken('permgw@example.com')
    const res = await request(app)
      .get('/user-management-service/api/permission')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(PERMISSION_KEYS.length)
  })
})
