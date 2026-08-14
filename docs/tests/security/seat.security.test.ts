/**
 * Security tests - tour-service seat + tour surface.
 * Ticket: AGE-159 (base) + AGE-199 (BusMap component additions)
 *
 * EXECUTION: run from the tour-service package so its node_modules and TS config
 * resolve. Imports are relative to this file. NOTE: in this monorepo layout the
 * repo-root `docs/tests/security/` files sit outside each package's vitest root,
 * so vitest's default include excludes them. The equivalent code paths are also
 * covered by the in-package suite `backend/tour-service/api/__tests__/`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp, API_BASE } from '../../../backend/tour-service/api/app'
import {
  connectTestDb,
  clearTestDb,
  closeTestDb,
  adminToken,
} from '../../../backend/tour-service/api/__tests__/helpers'

const app = createApp()
const auth = { Authorization: `Bearer ${adminToken()}` }

async function makeTour() {
  const res = await request(app)
    .post(`${API_BASE}/tour`)
    .set(auth)
    .send({ name: 'Sec Tour', date: '2026-09-01T08:00:00.000Z' })
  return res.body
}

async function makeBus(tourId: string) {
  const res = await request(app)
    .post(`${API_BASE}/tour/${tourId}/buses`)
    .set(auth)
    .send({
      name: 'Bus 1',
      seatLayout: { rows: 2, columns: 2 },
      pickupPoints: [{ name: 'Central', order: 1 }],
    })
  return res.body
}

async function seatsOf(tourId: string, busId: string) {
  const res = await request(app).get(`${API_BASE}/tour/${tourId}/buses/${busId}`)
  return res.body.seats as any[]
}

beforeAll(connectTestDb)
afterAll(closeTestDb)
beforeEach(clearTestDb)

const seatBase = (t: string, b: string) => `${API_BASE}/tour/${t}/buses/${b}/seats`

describe('Admin-only seat routes reject anonymous callers (401)', () => {
  const actions = ['approve', 'cancel', 'toggle-reserve', 'manual-assign', 'swap-move']
  for (const a of actions) {
    it(`POST .../seats/${a} without a token -> 401`, async () => {
      const res = await request(app)
        .post(`${seatBase('000000000000000000000001', '000000000000000000000002')}/${a}`)
        .send({ seatIds: ['000000000000000000000003'] })
      expect(res.status).toBe(401)
    })
  }

  it('POST .../seats/approve with a tampered token -> 401', async () => {
    const bad = adminToken().slice(0, -3) + 'xyz'
    const res = await request(app)
      .post(`${seatBase('000000000000000000000001', '000000000000000000000002')}/approve`)
      .set({ Authorization: `Bearer ${bad}` })
      .send({ seatIds: ['000000000000000000000003'] })
    expect(res.status).toBe(401)
  })

  it('DELETE /tour/:id without a token -> 401', async () => {
    const res = await request(app).delete(`${API_BASE}/tour/000000000000000000000001`)
    expect(res.status).toBe(401)
  })
})

describe('Public passenger booking route', () => {
  it('rejects missing required fields with 400 (still no auth required)', async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour._id)
    const seats = await seatsOf(tour._id, bus._id)
    const res = await request(app)
      .post(`${seatBase(tour._id, bus._id)}/bookings`)
      .send({ seatIds: [seats[0]._id] }) // missing passengerName/phone/pickup
    expect(res.status).toBe(400)
  })

  it('ignores a client-supplied status field; seat becomes pending, never taken', async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour._id)
    const seats = await seatsOf(tour._id, bus._id)
    const res = await request(app)
      .post(`${seatBase(tour._id, bus._id)}/bookings`)
      .send({
        seatIds: [seats[0]._id],
        status: 'taken',
        passengerName: 'P',
        passengerPhone: '050',
        pickupPointName: 'Central',
      })
    expect(res.status).toBe(200)
    expect(res.body[0].status).toBe('pending')
  })

  it('two concurrent bookings for the same seat -> exactly one 200 and one 409', async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour._id)
    const seats = await seatsOf(tour._id, bus._id)
    const payload = {
      seatIds: [seats[0]._id],
      passengerName: 'P',
      passengerPhone: '050',
      pickupPointName: 'Central',
    }
    const [a, b] = await Promise.all([
      request(app).post(`${seatBase(tour._id, bus._id)}/bookings`).send(payload),
      request(app).post(`${seatBase(tour._id, bus._id)}/bookings`).send(payload),
    ])
    const codes = [a.status, b.status].sort()
    expect(codes).toEqual([200, 409])
  })
})

describe('Soft delete', () => {
  it('a soft-deleted tour is excluded from GET /tour', async () => {
    const tour = await makeTour()
    await request(app).delete(`${API_BASE}/tour/${tour._id}`).set(auth).expect(200)
    const res = await request(app).get(`${API_BASE}/tour`).expect(200)
    expect(res.body.find((t: any) => t._id === tour._id)).toBeUndefined()
  })
})

// --- AGE-199 (BusMap component) addition ---

describe('Data exposure - public bus-with-seats endpoint (SEV-001)', () => {
  // The passenger view feeds BusMap from the UNAUTHENTICATED
  // GET /tour/:tourId/buses/:busId endpoint, which returns raw seat documents
  // including passengerName + passengerPhone. This test DOCUMENTS the leak: it
  // PASSES while PII is exposed. After the fix (strip passenger fields for
  // unauthenticated callers) change these assertions to `.toBeNull()`.
  it('returns passenger PII (name + phone) to an anonymous caller', async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour._id)
    const seats = await seatsOf(tour._id, bus._id)
    await request(app)
      .post(`${seatBase(tour._id, bus._id)}/bookings`)
      .send({
        seatIds: [seats[0]._id],
        passengerName: 'Dana Cohen',
        passengerPhone: '0500000000',
        pickupPointName: 'Central',
      })
      .expect(200)

    const anon = await seatsOf(tour._id, bus._id) // no Authorization header
    const booked = anon.find((s) => s._id === seats[0]._id)
    // Documented finding: PII IS present. (Should be null once fixed.)
    expect(booked.passengerPhone).toBe('0500000000')
    expect(booked.passengerName).toBe('Dana Cohen')
  })
})
