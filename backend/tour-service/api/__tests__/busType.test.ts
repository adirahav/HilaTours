import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import { randomUUID } from "crypto"
import { createApp, API_BASE } from "../app"
import {
  connectTestDb,
  clearTestDb,
  closeTestDb,
  adminToken,
  userToken,
  assertNoInternalIds,
  UUID_RE,
} from "./helpers"
import {
  seatPositionsFromBusType,
  totalSeatsFromBusType,
  seatLayoutFromBusType,
} from "../busType/busType.service"
import { BusType } from "../models/busType.model"

const app = createApp()
const auth = { Authorization: `Bearer ${adminToken()}` }
const nonAdmin = { Authorization: `Bearer ${userToken()}` }

/** The classic 55-seat Israeli tourism layout the UI starts a new type from. */
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

beforeAll(connectTestDb)
afterAll(closeTestDb)
beforeEach(clearTestDb)

// ---------------------------------------------------------------------------
// Pure layout math — the riskiest part of F11 (a numbering off-by-one here
// silently produces a wrong-sized seat map on every bus built from a template).
// ---------------------------------------------------------------------------
describe("seatLayoutFromBusType", () => {
  it("produces 55 seats for the standard 13-row / door-7 / 5-bench layout", () => {
    // 13 rows x 4 = 52, minus the 2 doorway slots in row 7, plus the 5-bench.
    expect(totalSeatsFromBusType(DEFAULT_55)).toBe(55)
  })

  it("numbers positions 1..N with no gaps", () => {
    const positions = seatPositionsFromBusType(DEFAULT_55)
    expect(positions[0]).toBe("1")
    expect(positions[positions.length - 1]).toBe("55")
    expect(new Set(positions).size).toBe(55)
  })

  it("counts all four columns on every row when there is no door row", () => {
    expect(
      totalSeatsFromBusType({
        standardRowsCount: 13,
        doorRow: null,
        backRowSeatsCount: 5,
        disabledSeatSlots: [],
      }),
    ).toBe(57)
  })

  it("removes exactly the two doorway slots (cols 3-4) of the door row", () => {
    const withDoor = totalSeatsFromBusType(DEFAULT_55)
    const withoutDoor = totalSeatsFromBusType({ ...DEFAULT_55, doorRow: null })
    expect(withoutDoor - withDoor).toBe(2)
  })

  it("skips individually disabled slots", () => {
    expect(
      totalSeatsFromBusType({ ...DEFAULT_55, disabledSeatSlots: ["1-1", "3-2", "12-4"] }),
    ).toBe(52)
  })

  it("does not double-subtract a disabled slot that is also a doorway slot", () => {
    // "7-3" is already the doorway — disabling it must not remove a seat twice.
    expect(totalSeatsFromBusType({ ...DEFAULT_55, disabledSeatSlots: ["7-3"] })).toBe(55)
  })

  it("honours both back-bench slot key forms", () => {
    // Current UI writes `<standardRowsCount + 1>-<col>`; older templates used
    // `back-<col>`. Both must disable the same bench seat.
    expect(totalSeatsFromBusType({ ...DEFAULT_55, disabledSeatSlots: ["14-2"] })).toBe(54)
    expect(totalSeatsFromBusType({ ...DEFAULT_55, disabledSeatSlots: ["back-2"] })).toBe(54)
  })

  it("emits a seatLayout in the { positions } shape bus.service already parses", () => {
    const layout = seatLayoutFromBusType(DEFAULT_55) as { positions: string[] }
    expect(Array.isArray(layout.positions)).toBe(true)
    expect(layout.positions).toHaveLength(55)
  })
})

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
describe("busType CRUD", () => {
  it("POST /busType creates a template with a server-derived totalSeats", async () => {
    const res = await request(app).post(`${API_BASE}/busType`).set(auth).send(DEFAULT_55)
    expect(res.status).toBe(200)
    expect(res.body.id).toMatch(UUID_RE)
    expect(res.body.totalSeats).toBe(55)
    expect(res.body.deletedAt).toBeNull()
    assertNoInternalIds(res.body)
  })

  it("never trusts a client-supplied totalSeats", async () => {
    const body = await makeBusType({ totalSeats: 9999 })
    expect(body.totalSeats).toBe(55)
  })

  it("POST /busType rejects a missing name", async () => {
    const res = await request(app)
      .post(`${API_BASE}/busType`)
      .set(auth)
      .send({ ...DEFAULT_55, name: "  " })
    expect(res.status).toBe(400)
  })

  it("POST /busType rejects a doorRow outside the standard rows", async () => {
    const res = await request(app)
      .post(`${API_BASE}/busType`)
      .set(auth)
      .send({ ...DEFAULT_55, doorRow: 99 })
    expect(res.status).toBe(400)
  })

  it("GET /busType lists templates and excludes soft-deleted ones", async () => {
    const keep = await makeBusType({ name: "keep" })
    const drop = await makeBusType({ name: "drop" })
    await request(app).delete(`${API_BASE}/busType/${drop.id}`).set(auth).expect(200)

    const res = await request(app).get(`${API_BASE}/busType`).set(auth)
    expect(res.status).toBe(200)
    expect(res.body.map((b: any) => b.id)).toEqual([keep.id])
    assertNoInternalIds(res.body)
  })

  it("PUT /busType/:id updates the layout and recomputes totalSeats", async () => {
    const created = await makeBusType()
    const res = await request(app)
      .put(`${API_BASE}/busType/${created.id}`)
      .set(auth)
      .send({ ...DEFAULT_55, name: "renamed", standardRowsCount: 10, doorRow: 5 })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("renamed")
    // 10 x 4 = 40, minus 2 doorway slots, plus the 5-seat bench.
    expect(res.body.totalSeats).toBe(43)
  })

  it("PUT /busType/:id returns 404 for an unknown id", async () => {
    const res = await request(app)
      .put(`${API_BASE}/busType/${randomUUID()}`)
      .set(auth)
      .send(DEFAULT_55)
    expect(res.status).toBe(404)
  })

  it("DELETE /busType/:id soft-deletes — the document is not removed", async () => {
    const created = await makeBusType()
    const res = await request(app).delete(`${API_BASE}/busType/${created.id}`).set(auth)
    expect(res.status).toBe(200)
    expect(res.body.deletedAt).not.toBeNull()

    // Opting out of the model's auto `deletedAt: null` scope proves it is still there.
    const raw = await BusType.findOne({ uuid: created.id, deletedAt: { $exists: true } }).lean()
    expect(raw).not.toBeNull()
    expect((raw as any).deletedAt).toBeInstanceOf(Date)
  })

  it("DELETE /busType/:id twice returns 404 the second time", async () => {
    const created = await makeBusType()
    await request(app).delete(`${API_BASE}/busType/${created.id}`).set(auth).expect(200)
    await request(app).delete(`${API_BASE}/busType/${created.id}`).set(auth).expect(404)
  })

  it("keeps at most one template marked default", async () => {
    const first = await makeBusType({ name: "first", isDefault: true })
    const second = await makeBusType({ name: "second", isDefault: true })

    const res = await request(app).get(`${API_BASE}/busType`).set(auth)
    const defaults = res.body.filter((b: any) => b.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].id).toBe(second.id)
    expect(res.body.find((b: any) => b.id === first.id).isDefault).toBe(false)
  })

  it("moves the default flag on update, leaving exactly one default", async () => {
    const first = await makeBusType({ name: "first", isDefault: true })
    const second = await makeBusType({ name: "second" })

    await request(app)
      .put(`${API_BASE}/busType/${second.id}`)
      .set(auth)
      .send({ ...DEFAULT_55, name: "second", isDefault: true })
      .expect(200)

    const res = await request(app).get(`${API_BASE}/busType`).set(auth)
    expect(res.body.filter((b: any) => b.isDefault).map((b: any) => b.id)).toEqual([second.id])
    expect(res.body.find((b: any) => b.id === first.id).isDefault).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Auth — templates are shared across every tour, so no unprivileged mutation.
// ---------------------------------------------------------------------------
describe("busType authorization", () => {
  it("requires a token on every route", async () => {
    await request(app).get(`${API_BASE}/busType`).expect(401)
    await request(app).post(`${API_BASE}/busType`).send(DEFAULT_55).expect(401)
    await request(app).put(`${API_BASE}/busType/${randomUUID()}`).send(DEFAULT_55).expect(401)
    await request(app).delete(`${API_BASE}/busType/${randomUUID()}`).expect(401)
  })

  it("rejects a validly-signed non-admin token with 403", async () => {
    await request(app).get(`${API_BASE}/busType`).set(nonAdmin).expect(403)
    await request(app).post(`${API_BASE}/busType`).set(nonAdmin).send(DEFAULT_55).expect(403)
    await request(app)
      .put(`${API_BASE}/busType/${randomUUID()}`)
      .set(nonAdmin)
      .send(DEFAULT_55)
      .expect(403)
    await request(app).delete(`${API_BASE}/busType/${randomUUID()}`).set(nonAdmin).expect(403)
  })
})

// ---------------------------------------------------------------------------
// Bus creation from a template (F11)
// ---------------------------------------------------------------------------
describe("POST /tour/:tourId/buses with busTypeId", () => {
  it("generates the seatLayout and pre-creates the seats server-side", async () => {
    const tour = await makeTour()
    const busType = await makeBusType()

    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(auth)
      .send({ name: "Bus from template", busTypeId: busType.id })
    expect(res.status).toBe(200)
    expect(res.body.seatLayout.positions).toHaveLength(55)

    const full = await request(app)
      .get(`${API_BASE}/tour/${tour.id}/buses/${res.body.id}`)
      .set(auth)
    expect(full.body.seats).toHaveLength(55)
    expect(full.body.seats.every((s: any) => s.status === "available")).toBe(true)
  })

  it("rejects supplying both seatLayout and busTypeId (400)", async () => {
    const tour = await makeTour()
    const busType = await makeBusType()
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(auth)
      .send({ name: "Both", busTypeId: busType.id, seatLayout: { rows: 2, columns: 2 } })
    expect(res.status).toBe(400)
  })

  it("rejects supplying neither seatLayout nor busTypeId (400)", async () => {
    const tour = await makeTour()
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(auth)
      .send({ name: "Neither" })
    expect(res.status).toBe(400)
  })

  it("still accepts an explicit seatLayout unchanged", async () => {
    const tour = await makeTour()
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(auth)
      .send({ name: "Manual", seatLayout: { rows: 2, columns: 2 } })
    expect(res.status).toBe(200)
    expect(res.body.seatLayout).toEqual({ rows: 2, columns: 2 })
  })

  it("returns 404 for an unknown or soft-deleted busTypeId", async () => {
    const tour = await makeTour()
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(auth)
      .send({ name: "Ghost", busTypeId: randomUUID() })
      .expect(404)

    const busType = await makeBusType()
    await request(app).delete(`${API_BASE}/busType/${busType.id}`).set(auth).expect(200)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(auth)
      .send({ name: "Deleted template", busTypeId: busType.id })
      .expect(404)
  })

  it("does not remap an existing bus when its template is edited afterwards", async () => {
    const tour = await makeTour()
    const busType = await makeBusType()
    const bus = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(auth)
      .send({ name: "Snapshot", busTypeId: busType.id })

    await request(app)
      .put(`${API_BASE}/busType/${busType.id}`)
      .set(auth)
      .send({ ...DEFAULT_55, standardRowsCount: 4, doorRow: 3 })
      .expect(200)

    const after = await request(app)
      .get(`${API_BASE}/tour/${tour.id}/buses/${bus.body.id}`)
      .set(auth)
    expect(after.body.seats).toHaveLength(55)
  })
})
