import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import { randomUUID } from "crypto"
import { createApp, API_BASE } from "../../../backend/tour-service/api/app"
import {
  connectTestDb,
  clearTestDb,
  closeTestDb,
  adminToken,
  userToken,
  tokenWithRoles,
} from "../../../backend/tour-service/api/__tests__/helpers"
import { Seat } from "../../../backend/tour-service/api/models/seat.model"
import { Bus } from "../../../backend/tour-service/api/models/bus.model"

/**
 * AGE-317 — security regression tests for the new destructive path on
 * PUT /tour/:tourId/buses/:busId (sending `busTypeId` on update).
 *
 * This endpoint is the most privileged mutation added by plan 035: it can
 * silently destroy passenger PII (Seat.passengerName/passengerPhone/notes)
 * for any position dropped by the new template. The functional correctness
 * of the reseed-by-position algorithm is already covered by
 * backend/tour-service/api/__tests__/bus-reseed.test.ts; these tests instead
 * probe the security boundary: authn/authz, IDOR/tenant isolation, and that
 * the destructive branch cannot be reached by a caller who shouldn't be able
 * to reach it.
 */

const app = createApp()
const admin = { Authorization: `Bearer ${adminToken()}` }

const BASE_TYPE = {
  name: "אוטובוס 55 מקומות",
  standardRowsCount: 13,
  doorRow: 7,
  backRowSeatsCount: 5,
  disabledSeatSlots: [] as string[],
  isDefault: false,
}

async function makeBusType(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`${API_BASE}/busType`)
    .set(admin)
    .send({ ...BASE_TYPE, name: `type-${randomUUID()}`, ...overrides })
  expect(res.status).toBe(200)
  return res.body
}

async function makeTour() {
  const res = await request(app)
    .post(`${API_BASE}/tour`)
    .set(admin)
    .send({ name: "Eilat Weekend", date: "2026-09-01T08:00:00.000Z" })
  expect(res.status).toBe(200)
  return res.body
}

async function makeBus(tourId: string, busTypeId: string) {
  const res = await request(app)
    .post(`${API_BASE}/tour/${tourId}/buses`)
    .set(admin)
    .send({ name: "אוטובוס א", busTypeId })
  expect(res.status).toBe(200)
  return res.body
}

async function busObjectId(busUuid: string) {
  const bus = await Bus.findOne({ uuid: busUuid }).lean()
  return (bus as any)._id
}

async function occupy(busUuid: string, position: string, patch: Record<string, unknown>) {
  const busId = await busObjectId(busUuid)
  await Seat.updateOne({ busId, position }, { $set: patch })
}

async function seatAt(busUuid: string, position: string) {
  const busId = await busObjectId(busUuid)
  return Seat.findOne({ busId, position }).lean() as any
}

async function seatCount(busUuid: string) {
  const busId = await busObjectId(busUuid)
  return Seat.countDocuments({ busId })
}

beforeAll(connectTestDb)
afterAll(closeTestDb)
beforeEach(clearTestDb)

describe("PUT /tour/:tourId/buses/:busId — authn/authz on the destructive busTypeId path", () => {
  it("rejects with 401 when no Authorization header is sent, and touches no seats", async () => {
    const type = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, type.id)
    await occupy(bus.id, "1", { status: "taken", passengerName: "עדי" })

    const bigger = await makeBusType({ standardRowsCount: 16 })
    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .send({ busTypeId: bigger.id })

    expect(res.status).toBe(401)
    expect(await seatCount(bus.id)).toBe(55)
    expect((await seatAt(bus.id, "1")).passengerName).toBe("עדי")
  })

  it("rejects with 401/403 for a validly-signed non-admin (role: user) token, and touches no seats", async () => {
    const type = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, type.id)
    await occupy(bus.id, "1", { status: "taken", passengerName: "עדי" })

    const bigger = await makeBusType({ standardRowsCount: 16 })
    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set({ Authorization: `Bearer ${userToken()}` })
      .send({ busTypeId: bigger.id })

    expect([401, 403]).toContain(res.status)
    expect(await seatCount(bus.id)).toBe(55)
    expect((await seatAt(bus.id, "1")).passengerName).toBe("עדי")
  })

  it("rejects a token with no roles claim at all, and touches no seats", async () => {
    const type = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, type.id)
    await occupy(bus.id, "1", { status: "taken", passengerName: "עדי" })

    const bigger = await makeBusType({ standardRowsCount: 16 })
    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set({ Authorization: `Bearer ${tokenWithRoles(undefined)}` })
      .send({ busTypeId: bigger.id })

    expect([401, 403]).toContain(res.status)
    expect(await seatCount(bus.id)).toBe(55)
  })

  it("rejects an unsigned/garbage bearer token", async () => {
    const type = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, type.id)

    const bigger = await makeBusType({ standardRowsCount: 16 })
    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set({ Authorization: `Bearer not-a-real-jwt` })
      .send({ busTypeId: bigger.id })

    expect(res.status).toBe(401)
    expect(await seatCount(bus.id)).toBe(55)
  })
})

describe("PUT /tour/:tourId/buses/:busId — IDOR / tenant-isolation on the destructive path", () => {
  it("404s (does not cross-apply) when busId belongs to a different tour than :tourId", async () => {
    const type = await makeBusType()
    const tourA = await makeTour()
    const tourB = await makeTour()
    const busInA = await makeBus(tourA.id, type.id)
    await occupy(busInA.id, "1", { status: "taken", passengerName: "עדי" })

    const bigger = await makeBusType({ standardRowsCount: 16 })
    // Attacker knows a valid busId (busInA) but supplies an unrelated tourId (tourB).
    const res = await request(app)
      .put(`${API_BASE}/tour/${tourB.id}/buses/${busInA.id}`)
      .set(admin)
      .send({ busTypeId: bigger.id })

    expect(res.status).toBe(404)
    // The bus in tour A must be completely untouched by this cross-tenant attempt.
    expect(await seatCount(busInA.id)).toBe(55)
    expect((await seatAt(busInA.id, "1")).passengerName).toBe("עדי")
  })

  it("404s and destroys nothing for a random/nonexistent busId under a real tour", async () => {
    const tour = await makeTour()
    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${randomUUID()}`)
      .set(admin)
      .send({ busTypeId: randomUUID() })

    expect(res.status).toBe(404)
  })

  it("404s and destroys nothing for a random/nonexistent tourId", async () => {
    const res = await request(app)
      .put(`${API_BASE}/tour/${randomUUID()}/buses/${randomUUID()}`)
      .set(admin)
      .send({ busTypeId: randomUUID() })

    expect(res.status).toBe(404)
  })

  it("404s against a soft-deleted bus and leaves its (already gone) seats untouched", async () => {
    const type = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, type.id)
    await occupy(bus.id, "1", { status: "taken", passengerName: "עדי" })

    const del = await request(app)
      .delete(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(admin)
    expect(del.status).toBe(200)

    const bigger = await makeBusType({ standardRowsCount: 16 })
    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(admin)
      .send({ busTypeId: bigger.id })

    expect(res.status).toBe(404)
  })

  it("404s (no info-leak, no seat mutation) when busTypeId references a soft-deleted BusType", async () => {
    const type = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, type.id)
    await occupy(bus.id, "1", { status: "taken", passengerName: "עדי" })

    const doomed = await makeBusType({ standardRowsCount: 16 })
    const delType = await request(app).delete(`${API_BASE}/busType/${doomed.id}`).set(admin)
    expect(delType.status).toBe(200)

    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(admin)
      .send({ busTypeId: doomed.id })

    expect(res.status).toBe(404)
    // Resolving the template must fail BEFORE any seat is touched.
    expect(await seatCount(bus.id)).toBe(55)
    expect((await seatAt(bus.id, "1")).passengerName).toBe("עדי")
  })
})

describe("PUT /tour/:tourId/buses/:busId — injection / mass-assignment hardening on busTypeId", () => {
  it("treats a non-string busTypeId (object) as not-found rather than throwing/500ing", async () => {
    const type = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, type.id)

    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(admin)
      .send({ busTypeId: { $ne: null } })

    expect(res.status).toBeLessThan(500)
    expect(await seatCount(bus.id)).toBe(55)
  })

  it("does not allow the response to leak internal Mongo _id/__v fields (PII-adjacent seat data)", async () => {
    const type = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, type.id)
    await occupy(bus.id, "1", { status: "taken", passengerName: "עדי", passengerPhone: "0501234567" })

    const bigger = await makeBusType({ standardRowsCount: 16 })
    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(admin)
      .send({ busTypeId: bigger.id })

    expect(res.status).toBe(200)
    const raw = JSON.stringify(res.body)
    expect(raw).not.toMatch(/"_id"/)
    expect(raw).not.toMatch(/"__v"/)
  })

  it("ignores an attempted isDefault/tourId override in the request body (no mass-assignment)", async () => {
    const type = await makeBusType()
    const tourA = await makeTour()
    const tourB = await makeTour()
    const bus = await makeBus(tourA.id, type.id)

    const bigger = await makeBusType({ standardRowsCount: 16 })
    const res = await request(app)
      .put(`${API_BASE}/tour/${tourA.id}/buses/${bus.id}`)
      .set(admin)
      .send({ busTypeId: bigger.id, isDefault: true, tourId: tourB.id, _id: randomUUID() })

    expect(res.status).toBe(200)
    const stored = await Bus.findOne({ uuid: bus.id }).lean()
    expect((stored as any).isDefault).toBe(false)
    expect(String((stored as any).tourId)).not.toBe(tourB.id)
  })
})
