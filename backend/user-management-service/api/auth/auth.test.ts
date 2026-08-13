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

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri(), { dbName: 'HILA_TOURS_TEST' })
  app = (await import('../server')).default
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

beforeEach(async () => {
  const db = mongoose.connection.db
  if (db) await db.dropDatabase()
})

describe('POST /api/auth/signup', () => {
  it('creates a user and returns a JWT', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'Admin One', email: 'admin1@example.com', password: '123456' })
    expect(res.status).toBe(200)
    expect(typeof res.body).toBe('string')
    expect(res.body.split('.')).toHaveLength(3)
  })

  it('returns 400 on duplicate email', async () => {
    const payload = { fullname: 'Dup', email: 'dup@example.com', password: '123456' }
    await request(app).post('/api/auth/signup').send(payload)
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ ...payload, fullname: 'Dup Two' })
    expect(res.status).toBe(400)
  })

  it('never leaks passwordHash, _id or __v', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'Safe', email: 'safe@example.com', password: '123456' })
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('passwordHash')
    expect(body).not.toContain('_id')
    expect(body).not.toContain('__v')
  })

  it('signs the user uuid as the JWT `sub`, not a Mongo ObjectId', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'Uuid Sub', email: 'uuidsub@example.com', password: '123456' })
    const payload = JSON.parse(
      Buffer.from(res.body.split('.')[1], 'base64').toString('utf8')
    )
    expect(payload.sub).toMatch(UUID_RE)
    expect(payload.sub).not.toMatch(/^[0-9a-f]{24}$/)

    const { User } = await import('../models/user.model')
    const user = await User.findOne({ email: 'uuidsub@example.com' })
    expect(payload.sub).toBe(user!.uuid)
    expect(payload.sub).not.toBe(String(user!._id))
  })
})

describe('signup role assignment (privilege escalation guard)', () => {
  const decode = (token: string) =>
    JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'))

  it('creates the account with roles ["user"], never ["admin"]', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'Plain User', email: 'plain@example.com', password: '123456' })
    expect(res.status).toBe(200)

    const { User } = await import('../models/user.model')
    const user = await User.findOne({ email: 'plain@example.com' })
    expect(user!.roles).toEqual(['user'])
  })

  it('ignores a client-supplied `roles` field in the signup body', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      fullname: 'Escalator',
      email: 'escalate@example.com',
      password: '123456',
      roles: ['admin'],
    })
    expect(res.status).toBe(200)

    const { User } = await import('../models/user.model')
    const user = await User.findOne({ email: 'escalate@example.com' })
    expect(user!.roles).toEqual(['user'])
    expect(decode(res.body).roles).toEqual(['user'])
  })

  it('embeds roles in the JWT issued at signup and at login', async () => {
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'Claims', email: 'claims@example.com', password: '123456' })
    expect(decode(signupRes.body).roles).toEqual(['user'])

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'claims@example.com', password: '123456' })
    expect(decode(loginRes.body).roles).toEqual(['user'])
  })

  it('reflects an out-of-band promotion to admin on the next login only', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'Promoted', email: 'promoted@example.com', password: '123456' })

    const { User } = await import('../models/user.model')
    await User.updateOne({ email: 'promoted@example.com' }, { $set: { roles: ['admin'] } })

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'promoted@example.com', password: '123456' })
    expect(decode(loginRes.body).roles).toEqual(['admin'])
  })

  it('never exposes passwordHash in the client projection', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'Projection', email: 'projection@example.com', password: '123456' })

    const { User } = await import('../models/user.model')
    const user = await User.findOne({ email: 'projection@example.com' })
    const json: any = user!.toJSON()
    expect(json.passwordHash).toBeUndefined()
  })
})

describe('requireAdmin middleware', () => {
  function fakeRes() {
    const res: any = { statusCode: 0, body: undefined }
    res.status = (code: number) => {
      res.statusCode = code
      return res
    }
    res.json = (payload: unknown) => {
      res.body = payload
      return res
    }
    return res
  }

  it('rejects a `user`-role token with 403', async () => {
    const { requireAdmin } = await import('./auth.middleware')
    const res = fakeRes()
    let nexted = false
    requireAdmin({ admin: { roles: ['user'] } } as any, res, () => {
      nexted = true
    })
    expect(nexted).toBe(false)
    expect(res.statusCode).toBe(403)
  })

  it('rejects a token with no roles claim at all with 403', async () => {
    const { requireAdmin } = await import('./auth.middleware')
    const res = fakeRes()
    let nexted = false
    requireAdmin({ admin: {} } as any, res, () => {
      nexted = true
    })
    expect(nexted).toBe(false)
    expect(res.statusCode).toBe(403)
  })

  it('allows an `admin`-role token through', async () => {
    const { requireAdmin } = await import('./auth.middleware')
    const res = fakeRes()
    let nexted = false
    requireAdmin({ admin: { roles: ['admin'] } } as any, res, () => {
      nexted = true
    })
    expect(nexted).toBe(true)
    expect(res.statusCode).toBe(0)
  })
})

describe('User identity layer', () => {
  it('serializes uuid as `id` and strips _id/__v/passwordHash', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'Shape', email: 'shape@example.com', password: '123456' })

    const { User } = await import('../models/user.model')
    const user = await User.findOne({ email: 'shape@example.com' })
    const json: any = user!.toJSON()

    expect(json.id).toMatch(UUID_RE)
    expect(json._id).toBeUndefined()
    expect(json.uuid).toBeUndefined()
    expect(json.__v).toBeUndefined()
    expect(json.passwordHash).toBeUndefined()
    expect(json.email).toBe('shape@example.com')
  })

  it('resolves a client uuid back to the internal _id, and 404s on an unknown uuid', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'Resolve', email: 'resolve@example.com', password: '123456' })

    const { User } = await import('../models/user.model')
    const { resolveObjectId } = await import('../lib/resolveId')
    const user = await User.findOne({ email: 'resolve@example.com' })

    const resolved = await resolveObjectId(User, user!.uuid)
    expect(String(resolved)).toBe(String(user!._id))

    await expect(
      resolveObjectId(User, '00000000-0000-4000-8000-000000000000')
    ).rejects.toMatchObject({ status: 404 })
    await expect(resolveObjectId(User, String(user!._id))).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'Login User', email: 'login@example.com', password: 'correct-pass' })
  })

  it('returns a JWT for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'correct-pass' })
    expect(res.status).toBe(200)
    expect(typeof res.body).toBe('string')
    expect(res.body.split('.')).toHaveLength(3)
  })

  it('returns 401 for a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrong-pass' })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(401)
  })

  it('returns true with a valid token', async () => {
    const token = (
      await request(app)
        .post('/api/auth/signup')
        .send({ fullname: 'Logout User', email: 'logout@example.com', password: '123456' })
    ).body
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toBe(true)
  })
})

describe('gateway-prefixed base path (per API contract)', () => {
  it('POST /user-management-service/api/auth/login returns a JWT for valid credentials', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ fullname: 'GW User', email: 'gw@example.com', password: 'correct-pass' })
    const res = await request(app)
      .post('/user-management-service/api/auth/login')
      .send({ email: 'gw@example.com', password: 'correct-pass' })
    expect(res.status).toBe(200)
    expect(typeof res.body).toBe('string')
    expect(res.body.split('.')).toHaveLength(3)
  })
})

describe('POST /api/auth/forgot-password', () => {
  it('always returns 200 for a valid-looking request', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'anyone@example.com' })
    expect(res.status).toBe(200)
  })

  it('returns 400 for an invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'not-an-email' })
    expect(res.status).toBe(400)
  })
})
