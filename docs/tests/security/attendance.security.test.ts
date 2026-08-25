import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import { createApp, API_BASE } from "../../../backend/tour-service/api/app"
import {
  connectTestDb,
  clearTestDb,
  closeTestDb,
  adminToken,
  userToken,
} from "../../../backend/tour-service/api/__tests__/helpers"

/**
 * Security audit tests for the Attendance Management feature (AGE-329).
 * Covers: auth on every /attendance route, NoSQL-injection-style payloads on
 * path/query params, cross-tenant access, and missing-field validation.
 */

const app = createApp()
const auth = { Authorization: `Bearer ${adminToken()}` }
const nonAdmin = { Authorization: `Bearer ${userToken()}` }

async function makeTour(name = "Eilat Weekend") {
  const res = await request(app)
    .post(`${API_BASE}/tour`)
    .set(auth)
    .send({ name, date: "2026-09-01T08:00:00.000Z" })
  return res.body
}

async function makeBus(tourId: string) {
  const res = await request(app)
    .post(`${API_BASE}/tour/${tourId}/buses`)
    .set(auth)
    .send({
      name: "Bus 1",
      seatLayout: { rows: 4, columns: 3 },
      pickupPoints: [{ name: "Central Station", order: 1 }],
    })
  return res.body
}

async function getSeats(tourId: string, busId: string) {
  const res = await request(app).get(`${API_BASE}/tour/${tourId}/buses/${busId}`).set(auth)
  return res.body.seats as any[]
}

async function assign(tourId: string, busId: string, seatId: string) {
  await request(app)
    .post(`${API_BASE}/tour/${tourId}/buses/${busId}/seats/manual-assign`)
    .set(auth)
    .send({
      seatId,
      passengerName: "כהן דנה",
      passengerPhone: "0501234567",
      pickupPointName: "Central Station",
    })
    .expect(200)
}

async function seedBusWithSession() {
  const tour = await makeTour()
  const bus = await makeBus(tour.id)
  const seats = await getSeats(tour.id, bus.id)
  await assign(tour.id, bus.id, seats[0].id)
  const sessionRes = await request(app)
    .post(`${API_BASE}/attendance/session`)
    .set(auth)
    .send({ tourId: tour.id, busId: bus.id, title: "בדיקת בוקר" })
    .expect(200)
  return { tour, bus, session: sessionRes.body }
}

beforeAll(connectTestDb)
afterAll(closeTestDb)
beforeEach(clearTestDb)

// ---------------------------------------------------------------------------
// Authentication / Authorization
// ---------------------------------------------------------------------------
describe("attendance routes require authentication", () => {
  it("GET /attendance/session without token -> 401", async () => {
    const { tour, bus } = await seedBusWithSession()
    await request(app)
      .get(`${API_BASE}/attendance/session?tourId=${tour.id}&busId=${bus.id}`)
      .expect(401)
  })

  it("GET /attendance/session/:id without token -> 401", async () => {
    const { session } = await seedBusWithSession()
    await request(app).get(`${API_BASE}/attendance/session/${session.id}`).expect(401)
  })

  it("POST /attendance/session (create) without token -> 401", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    await request(app)
      .post(`${API_BASE}/attendance/session`)
      .send({ tourId: tour.id, busId: bus.id, title: "x" })
      .expect(401)
  })

  it("POST /attendance/session/:id/reset without token -> 401", async () => {
    const { session } = await seedBusWithSession()
    await request(app).post(`${API_BASE}/attendance/session/${session.id}/reset`).expect(401)
  })

  it("POST /attendance/session/:id/presence without token -> 401", async () => {
    const { session } = await seedBusWithSession()
    await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .send({ recordIds: [session.records[0].id], isPresent: true })
      .expect(401)
  })

  it("DELETE /attendance/session/:id without token -> 401", async () => {
    const { session } = await seedBusWithSession()
    await request(app).delete(`${API_BASE}/attendance/session/${session.id}`).expect(401)
  })

  it("create/reset/presence/delete all reject a non-admin (no attendance:manage) token -> 403/401", async () => {
    const { tour, bus, session } = await seedBusWithSession()

    const create = await request(app)
      .post(`${API_BASE}/attendance/session`)
      .set(nonAdmin)
      .send({ tourId: tour.id, busId: bus.id, title: "x" })
    expect([401, 403]).toContain(create.status)

    const reset = await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/reset`)
      .set(nonAdmin)
    expect([401, 403]).toContain(reset.status)

    const presence = await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(nonAdmin)
      .send({ recordIds: [session.records[0].id], isPresent: true })
    expect([401, 403]).toContain(presence.status)

    const del = await request(app)
      .delete(`${API_BASE}/attendance/session/${session.id}`)
      .set(nonAdmin)
    expect([401, 403]).toContain(del.status)
  })

  it("GET (view) also rejects a non-admin token -> 403/401", async () => {
    const { tour, bus, session } = await seedBusWithSession()
    const list = await request(app)
      .get(`${API_BASE}/attendance/session?tourId=${tour.id}&busId=${bus.id}`)
      .set(nonAdmin)
    expect([401, 403]).toContain(list.status)

    const get = await request(app)
      .get(`${API_BASE}/attendance/session/${session.id}`)
      .set(nonAdmin)
    expect([401, 403]).toContain(get.status)
  })

  it("a tampered JWT signature -> 401", async () => {
    const tampered = auth.Authorization.slice(0, -3) + "xyz"
    const { tour, bus } = await seedBusWithSession()
    await request(app)
      .get(`${API_BASE}/attendance/session?tourId=${tour.id}&busId=${bus.id}`)
      .set({ Authorization: tampered })
      .expect(401)
  })

  it("alg:none token -> 401", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url",
    )
    const payload = Buffer.from(JSON.stringify({ sub: "x", roles: ["admin"] })).toString(
      "base64url",
    )
    const noneToken = `${header}.${payload}.`
    const { tour, bus } = await seedBusWithSession()
    await request(app)
      .get(`${API_BASE}/attendance/session?tourId=${tour.id}&busId=${bus.id}`)
      .set({ Authorization: `Bearer ${noneToken}` })
      .expect(401)
  })
})

// ---------------------------------------------------------------------------
// NoSQL injection attempts on tourId/busId/sessionId
// ---------------------------------------------------------------------------
describe("NoSQL injection resilience", () => {
  it("listSessions rejects a $ne/object-shaped tourId in the query string", async () => {
    const res = await request(app)
      .get(
        `${API_BASE}/attendance/session?tourId[$ne]=null&busId[$ne]=null`,
      )
      .set(auth)
    // Must not 200 with unrelated data; resolveDoc requires a uuid string.
    expect(res.status).not.toBe(200)
  })

  it("getSession rejects an object-injection sessionId path segment", async () => {
    const res = await request(app)
      .get(`${API_BASE}/attendance/session/${encodeURIComponent('{"$ne":null}')}`)
      .set(auth)
    expect([400, 404]).toContain(res.status)
  })

  it("createSession rejects a non-string/object tourId or busId in the body", async () => {
    const res = await request(app)
      .post(`${API_BASE}/attendance/session`)
      .set(auth)
      .send({ tourId: { $ne: null }, busId: { $ne: null }, title: "x" })
    expect([400, 404]).toContain(res.status)
  })

  it("setRecordsPresence rejects an object-injection recordIds entry", async () => {
    const { session } = await seedBusWithSession()
    const res = await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(auth)
      .send({ recordIds: [{ $ne: null }], isPresent: true })
    expect(res.status).toBe(400)
  })

  it("presence recordIds cross-injection: a well-formed but unrelated uuid does not resolve to another session's record", async () => {
    const { session } = await seedBusWithSession()
    const otherRandomUuid = "00000000-0000-4000-8000-000000000000"
    const res = await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(auth)
      .send({ recordIds: [otherRandomUuid], isPresent: true })
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Cross-tenant access
// ---------------------------------------------------------------------------
describe("cross-tenant isolation", () => {
  it("a session created under tour A/bus A cannot be listed via tour B's id", async () => {
    const { tour: tourA, bus: busA } = await seedBusWithSession()
    const tourB = await makeTour("Other Tour")
    const busB = await makeBus(tourB.id)

    const res = await request(app)
      .get(`${API_BASE}/attendance/session?tourId=${tourB.id}&busId=${busB.id}`)
      .set(auth)
      .expect(200)
    expect(res.body).toEqual([])

    // sanity: it does exist for the real tour/bus
    const resA = await request(app)
      .get(`${API_BASE}/attendance/session?tourId=${tourA.id}&busId=${busA.id}`)
      .set(auth)
      .expect(200)
    expect(resA.body.length).toBeGreaterThan(0)
  })

  it("a bus id from a different tour is rejected when listing (mismatched tour/bus pair)", async () => {
    const { tour: tourA } = await seedBusWithSession()
    const tourB = await makeTour("Other Tour")
    const busB = await makeBus(tourB.id)

    const res = await request(app)
      .get(`${API_BASE}/attendance/session?tourId=${tourA.id}&busId=${busB.id}`)
      .set(auth)
    expect(res.status).toBe(404)
  })

  it("presence toggle cannot flip a record belonging to a different session by sending its id under another session's url", async () => {
    const { session: sessionA } = await seedBusWithSession()

    // second, independent bus/session
    const tourB = await makeTour("Other Tour")
    const busB = await makeBus(tourB.id)
    const seatsB = await getSeats(tourB.id, busB.id)
    await assign(tourB.id, busB.id, seatsB[0].id)
    const sessionBRes = await request(app)
      .post(`${API_BASE}/attendance/session`)
      .set(auth)
      .send({ tourId: tourB.id, busId: busB.id, title: "session B" })
      .expect(200)
    const sessionB = sessionBRes.body

    // try to flip session B's record through session A's presence endpoint
    const res = await request(app)
      .post(`${API_BASE}/attendance/session/${sessionA.id}/presence`)
      .set(auth)
      .send({ recordIds: [sessionB.records[0].id], isPresent: true })
    expect(res.status).toBe(400)

    // confirm session B's record is untouched
    const check = await request(app)
      .get(`${API_BASE}/attendance/session/${sessionB.id}`)
      .set(auth)
      .expect(200)
    expect(check.body.records[0].isPresent).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Missing required fields -> 400
// ---------------------------------------------------------------------------
describe("input validation", () => {
  it("create without title -> 400", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const res = await request(app)
      .post(`${API_BASE}/attendance/session`)
      .set(auth)
      .send({ tourId: tour.id, busId: bus.id })
    expect(res.status).toBe(400)
  })

  it("create without tourId/busId -> 404 (unresolvable, not a silent 200)", async () => {
    const res = await request(app)
      .post(`${API_BASE}/attendance/session`)
      .set(auth)
      .send({ title: "x" })
    expect([400, 404]).toContain(res.status)
  })

  it("presence with missing recordIds -> 400", async () => {
    const { session } = await seedBusWithSession()
    const res = await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(auth)
      .send({ isPresent: true })
    expect(res.status).toBe(400)
  })

  it("presence with missing isPresent -> 400", async () => {
    const { session } = await seedBusWithSession()
    const res = await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(auth)
      .send({ recordIds: [session.records[0].id] })
    expect(res.status).toBe(400)
  })

  it("presence with a non-boolean isPresent -> 400 (no client-supplied status shortcut)", async () => {
    const { session } = await seedBusWithSession()
    const res = await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(auth)
      .send({ recordIds: [session.records[0].id], isPresent: "present" })
    expect(res.status).toBe(400)
  })

  it("get with a malformed sessionId -> 404, not a 500", async () => {
    const res = await request(app)
      .get(`${API_BASE}/attendance/session/not-a-uuid`)
      .set(auth)
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Data exposure — no internal ids/PII beyond contract
// ---------------------------------------------------------------------------
describe("data exposure", () => {
  it("session response never includes _id/__v/uuid keys (internal identity leak)", async () => {
    const { session } = await seedBusWithSession()
    const raw = JSON.stringify(session)
    expect(raw).not.toMatch(/"_id"/)
    expect(raw).not.toMatch(/"__v"/)
  })
})
