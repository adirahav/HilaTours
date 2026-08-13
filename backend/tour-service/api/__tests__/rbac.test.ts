import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import { createApp, API_BASE } from "../app"
import { randomUUID } from "crypto"
import {
  connectTestDb,
  clearTestDb,
  closeTestDb,
  adminToken,
  userToken,
  tokenWithRoles,
} from "./helpers"
import { resolvePermissions } from "../auth/permissions"

const app = createApp()
const adminAuth = { Authorization: `Bearer ${adminToken()}` }

beforeAll(connectTestDb)
afterAll(closeTestDb)
beforeEach(clearTestDb)

async function makeTour() {
  const res = await request(app)
    .post(`${API_BASE}/tour`)
    .set(adminAuth)
    .send({ name: "RBAC Tour", date: "2026-09-01T08:00:00.000Z", description: "d" })
  return res.body
}

describe("requirePermission — role-based authorization", () => {
  it("rejects a well-signed roles:['user'] token on POST /tour with 403", async () => {
    const res = await request(app)
      .post(`${API_BASE}/tour`)
      .set({ Authorization: `Bearer ${userToken()}` })
      .send({ name: "X", date: "2026-09-01T08:00:00.000Z" })
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("Forbidden")
  })

  it("still allows a roles:['admin'] token on POST /tour", async () => {
    const res = await request(app)
      .post(`${API_BASE}/tour`)
      .set(adminAuth)
      .send({ name: "X", date: "2026-09-01T08:00:00.000Z" })
    expect(res.status).toBe(200)
  })

  it("still returns 401 (not 403) when the token is missing", async () => {
    const res = await request(app)
      .post(`${API_BASE}/tour`)
      .send({ name: "X", date: "2026-09-01T08:00:00.000Z" })
    expect(res.status).toBe(401)
  })

  it("returns 401 for an invalid/garbage token", async () => {
    const res = await request(app)
      .post(`${API_BASE}/tour`)
      .set({ Authorization: "Bearer not-a-real-token" })
      .send({ name: "X", date: "2026-09-01T08:00:00.000Z" })
    expect(res.status).toBe(401)
  })

  it("fails closed when the roles claim is missing entirely", async () => {
    const res = await request(app)
      .post(`${API_BASE}/tour`)
      .set({ Authorization: `Bearer ${tokenWithRoles(undefined)}` })
      .send({ name: "X", date: "2026-09-01T08:00:00.000Z" })
    expect(res.status).toBe(403)
  })

  it("fails closed for an unknown role name", async () => {
    const res = await request(app)
      .post(`${API_BASE}/tour`)
      .set({ Authorization: `Bearer ${tokenWithRoles(["superuser"])}` })
      .send({ name: "X", date: "2026-09-01T08:00:00.000Z" })
    expect(res.status).toBe(403)
  })

  it("fails closed when roles is not an array", async () => {
    const res = await request(app)
      .post(`${API_BASE}/tour`)
      .set({ Authorization: `Bearer ${tokenWithRoles("admin")}` })
      .send({ name: "X", date: "2026-09-01T08:00:00.000Z" })
    expect(res.status).toBe(403)
  })

  it("blocks a user token on every admin-only route family", async () => {
    const tour = await makeTour()
    const busRes = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(adminAuth)
      .send({
        name: "Bus 1",
        seatLayout: { rows: 2, columns: 2 },
        pickupPoints: [{ name: "Central Station", order: 1 }],
      })
    const bus = busRes.body
    const userAuth = { Authorization: `Bearer ${userToken()}` }
    const seatBase = `${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats`

    const calls = [
      request(app).put(`${API_BASE}/tour/${tour.id}`).set(userAuth).send({ name: "Y" }),
      request(app).delete(`${API_BASE}/tour/${tour.id}`).set(userAuth),
      request(app).post(`${API_BASE}/tour/${tour.id}/buses`).set(userAuth).send({}),
      request(app).get(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`).set(userAuth),
      request(app).put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`).set(userAuth).send({}),
      request(app).delete(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`).set(userAuth),
      request(app).post(`${seatBase}/approve`).set(userAuth).send({}),
      request(app).post(`${seatBase}/cancel`).set(userAuth).send({}),
      request(app).post(`${seatBase}/toggle-reserve`).set(userAuth).send({}),
      request(app).post(`${seatBase}/manual-assign`).set(userAuth).send({}),
      request(app).post(`${seatBase}/swap-move`).set(userAuth).send({}),
      request(app)
        .get(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/manifest`)
        .set(userAuth),
    ]

    const results = await Promise.all(calls)
    for (const res of results) expect(res.status).toBe(403)
  })

  it("leaves public routes reachable without any token", async () => {
    const tour = await makeTour()
    expect((await request(app).get(`${API_BASE}/tour`)).status).toBe(200)
    expect((await request(app).get(`${API_BASE}/tour/${tour.id}`)).status).toBe(200)
    expect((await request(app).get(`${API_BASE}/tour/${tour.id}/buses`)).status).toBe(200)
  })
})

describe("resolvePermissions", () => {
  it("grants every management permission to admin", () => {
    expect(resolvePermissions({ roles: ["admin"] }).has("tour:insert")).toBe(true)
    expect(resolvePermissions({ roles: ["admin"] }).has("seat:swapMove")).toBe(true)
  })

  it("grants nothing to user", () => {
    expect(resolvePermissions({ roles: ["user"] }).size).toBe(0)
  })

  it("fails closed on malformed payloads", () => {
    expect(resolvePermissions(undefined).size).toBe(0)
    expect(resolvePermissions({}).size).toBe(0)
    expect(resolvePermissions({ roles: [null, 3] }).size).toBe(0)
  })

  it("honours an explicit permissions claim, ignoring unknown keys", () => {
    const granted = resolvePermissions({
      roles: ["admin"],
      permissions: ["tour:insert", "made:up"],
    })
    expect([...granted]).toEqual(["tour:insert"])
  })

  it("ignores a random uuid as a role", () => {
    expect(resolvePermissions({ roles: [randomUUID()] }).size).toBe(0)
  })
})
