import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import jwt from "jsonwebtoken"
import { createApp, API_BASE } from "../../../backend/tour-service/api/app"
import {
  connectTestDb,
  clearTestDb,
  closeTestDb,
  adminToken,
  userToken,
} from "../../../backend/tour-service/api/__tests__/helpers"

/**
 * Security-focused coverage for the new BusType feature (AGE-311).
 *
 * Complements backend/tour-service/api/__tests__/busType.test.ts (functional
 * tests) — this file targets auth bypass, injection, and data-integrity
 * concerns per agents/security/CLAUDE.md.
 */

const app = createApp()
const auth = { Authorization: `Bearer ${adminToken()}` }
const nonAdmin = { Authorization: `Bearer ${userToken()}` }

const DEFAULT_55 = {
  name: "אוטובוס 55 מקומות",
  description: "13 שורות, דלת בשורה 7, ספסל 5",
  standardRowsCount: 13,
  doorRow: 7,
  backRowSeatsCount: 5,
  disabledSeatSlots: [] as string[],
  isDefault: false,
}

async function makeBusType(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`${API_BASE}/busType`)
    .set(auth)
    .send({ ...DEFAULT_55, ...overrides })
  return res.body
}

async function makeTour() {
  const res = await request(app)
    .post(`${API_BASE}/tour`)
    .set(auth)
    .send({ name: "Eilat Weekend", date: "2026-09-01T08:00:00.000Z" })
  return res.body
}

beforeAll(async () => {
  await connectTestDb()
})

afterAll(async () => {
  await closeTestDb()
})

beforeEach(async () => {
  await clearTestDb()
})

describe("BusType auth", () => {
  it("GET /busType without token -> 401", async () => {
    const res = await request(app).get(`${API_BASE}/busType`)
    expect(res.status).toBe(401)
  })

  it("POST /busType without token -> 401", async () => {
    const res = await request(app).post(`${API_BASE}/busType`).send(DEFAULT_55)
    expect(res.status).toBe(401)
  })

  it("PUT /busType/:id without token -> 401", async () => {
    const created = await makeBusType()
    const res = await request(app)
      .put(`${API_BASE}/busType/${created.id}`)
      .send(DEFAULT_55)
    expect(res.status).toBe(401)
  })

  it("DELETE /busType/:id without token -> 401", async () => {
    const created = await makeBusType()
    const res = await request(app).delete(`${API_BASE}/busType/${created.id}`)
    expect(res.status).toBe(401)
  })

  it("GET /busType with a non-admin (self-signed-up user) token -> 403", async () => {
    const res = await request(app).get(`${API_BASE}/busType`).set(nonAdmin)
    expect(res.status).toBe(403)
  })

  it("POST /busType with a non-admin token -> 403", async () => {
    const res = await request(app).post(`${API_BASE}/busType`).set(nonAdmin).send(DEFAULT_55)
    expect(res.status).toBe(403)
  })

  it("DELETE /busType/:id with a non-admin token -> 403", async () => {
    const created = await makeBusType()
    const res = await request(app).delete(`${API_BASE}/busType/${created.id}`).set(nonAdmin)
    expect(res.status).toBe(403)
  })

  it("expired admin token -> 401", async () => {
    const expired = jwt.sign(
      { sub: "expired-admin", roles: ["admin"] },
      process.env.JWT_SECRET as string,
      { expiresIn: -10 },
    )
    const res = await request(app)
      .get(`${API_BASE}/busType`)
      .set("Authorization", `Bearer ${expired}`)
    expect(res.status).toBe(401)
  })

  it("tampered admin token -> 401", async () => {
    const tampered = adminToken().slice(0, -3) + "xyz"
    const res = await request(app)
      .get(`${API_BASE}/busType`)
      .set("Authorization", `Bearer ${tampered}`)
    expect(res.status).toBe(401)
  })

  it("alg:none token -> 401 (no signature verification bypass)", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url",
    )
    const payload = Buffer.from(JSON.stringify({ sub: "attacker", roles: ["admin"] })).toString(
      "base64url",
    )
    const noneToken = `${header}.${payload}.`
    const res = await request(app)
      .get(`${API_BASE}/busType`)
      .set("Authorization", `Bearer ${noneToken}`)
    expect(res.status).toBe(401)
  })
})

describe("BusType input validation / injection resistance", () => {
  it("rejects a NoSQL-injection-style busTypeId path param with 404, not a 500/crash", async () => {
    const res = await request(app)
      .get(`${API_BASE}/busType/${encodeURIComponent('{"$ne":null}')}`)
      .set(auth)
    expect([400, 404]).toContain(res.status)
  })

  it("never accepts totalSeats from client input on create", async () => {
    const res = await request(app)
      .post(`${API_BASE}/busType`)
      .set(auth)
      .send({ ...DEFAULT_55, totalSeats: 99999 })
    expect(res.status).toBe(200)
    // Server-derived from the actual layout (13 rows*4 - 2 door + 5 back = 55), never the client value
    expect(res.body.totalSeats).not.toBe(99999)
  })

  it("rejects an out-of-range standardRowsCount rather than persisting it", async () => {
    const res = await request(app)
      .post(`${API_BASE}/busType`)
      .set(auth)
      .send({ ...DEFAULT_55, standardRowsCount: 999999 })
    expect(res.status).toBe(400)
  })

  it("does not reflect a raw object injected into disabledSeatSlots back as an object", async () => {
    const res = await request(app)
      .post(`${API_BASE}/busType`)
      .set(auth)
      .send({ ...DEFAULT_55, disabledSeatSlots: [{ $gt: "" }] })
    // Either rejected, or coerced to a harmless string — never stored/returned as an object
    if (res.status === 200) {
      for (const slot of res.body.disabledSeatSlots) {
        expect(typeof slot).toBe("string")
      }
    } else {
      expect(res.status).toBe(400)
    }
  })
})

describe("BusType -> Bus conversion path (F11)", () => {
  it("POST bus with busTypeId belonging to a soft-deleted BusType -> 404, not silently succeeding", async () => {
    const tour = await makeTour()
    const created = await makeBusType()
    await request(app).delete(`${API_BASE}/busType/${created.id}`).set(auth)

    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(auth)
      .send({ name: "Bus from deleted template", busTypeId: created.id })
    expect(res.status).toBe(404)
  })

  it("POST bus with both seatLayout and busTypeId -> 400 (never a silent merge)", async () => {
    const tour = await makeTour()
    const created = await makeBusType()
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(auth)
      .send({
        name: "Ambiguous bus",
        busTypeId: created.id,
        seatLayout: { positions: ["1", "2"] },
      })
    expect(res.status).toBe(400)
  })

  it("POST bus without admin token -> 401, even when using busTypeId", async () => {
    const tour = await makeTour()
    const created = await makeBusType()
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .send({ name: "No auth bus", busTypeId: created.id })
    expect(res.status).toBe(401)
  })

  it("generated bus never exposes internal Mongo _id/uuid of the source BusType", async () => {
    const tour = await makeTour()
    const created = await makeBusType()
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(auth)
      .send({ name: "Bus from template", busTypeId: created.id })
    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty("busTypeId")
    expect(res.body).not.toHaveProperty("_id")
  })
})

describe("BusType soft delete", () => {
  it("GET /busType excludes a soft-deleted template", async () => {
    const created = await makeBusType()
    await request(app).delete(`${API_BASE}/busType/${created.id}`).set(auth)
    const res = await request(app).get(`${API_BASE}/busType`).set(auth)
    expect(res.status).toBe(200)
    expect(res.body.find((b: { id: string }) => b.id === created.id)).toBeUndefined()
  })

  it("GET /busType/:id on a soft-deleted template -> 404", async () => {
    const created = await makeBusType()
    await request(app).delete(`${API_BASE}/busType/${created.id}`).set(auth)
    const res = await request(app).get(`${API_BASE}/busType/${created.id}`).set(auth)
    expect(res.status).toBe(404)
  })
})
