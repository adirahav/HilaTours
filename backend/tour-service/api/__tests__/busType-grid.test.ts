import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import { createApp, API_BASE } from "../app"
import { connectTestDb, clearTestDb, closeTestDb, adminToken } from "./helpers"
import { seatGridFromBusType, seatPositionsFromBusType } from "../busType/busType.service"

/**
 * Plan 037 — a BusType's mid-row gaps must survive all the way to the rendered
 * seat map.
 *
 * The bug being guarded against: `Bus.seatLayout` only stores a flat
 * `positions: ["1".."N"]`, which cannot express "seat, gap, seat". Anything that
 * re-derives row/col from the seat COUNT packs those seats together and the gap
 * vanishes. The fix keeps a live `Bus.busTypeId` and joins to the current
 * template at read time, so these tests assert on the row/col actually returned
 * by each read path — not on the seat count, which was never wrong.
 */

const app = createApp()
const auth = { Authorization: `Bearer ${adminToken()}` }

/**
 * The admin's reported mini-bus: a 4-seat back bench with the third slot
 * disabled, i.e. seats at cols 1, 2 and 4 with a hole at col 3.
 */
const MINI_BUS_WITH_GAP = {
  name: "מיניבוס עם רווח",
  standardRowsCount: 3,
  doorRow: null as number | null,
  backRowSeatsCount: 4,
  // Back bench is row `standardRowsCount + 1` = row 4.
  disabledSeatSlots: ["4-3"],
  isDefault: false,
}

async function makeBusType(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`${API_BASE}/busType`)
    .set(auth)
    .send({ ...MINI_BUS_WITH_GAP, ...overrides })
  expect(res.status).toBe(200)
  return res.body
}

async function makeTour() {
  const res = await request(app)
    .post(`${API_BASE}/tour`)
    .set(auth)
    .send({ name: "Eilat Weekend", date: "2026-09-01T08:00:00.000Z" })
  return res.body
}

async function makeBus(tourId: string, body: Record<string, unknown>) {
  const res = await request(app)
    .post(`${API_BASE}/tour/${tourId}/buses`)
    .set(auth)
    .send({ name: "אוטובוס 2", ...body })
  expect(res.status).toBe(200)
  return res.body
}

/** The back bench of a returned grid, sorted by column. */
function backRow(grid: any) {
  const backRowIndex = grid.standardRowsCount + 1
  return grid.seats
    .filter((s: any) => s.row === backRowIndex)
    .sort((a: any, b: any) => a.col - b.col)
}

beforeAll(connectTestDb)
afterAll(closeTestDb)
beforeEach(clearTestDb)

// ---------------------------------------------------------------------------
// The shared numbering walk. This is the one algorithm; if it packs the gap,
// every read path below packs it too.
// ---------------------------------------------------------------------------
describe("seatGridFromBusType", () => {
  it("leaves a hole at the disabled column instead of shifting seats left", () => {
    const grid = seatGridFromBusType(MINI_BUS_WITH_GAP)
    const back = grid.filter((s) => s.row === 4)

    expect(back.map((s) => s.col)).toEqual([1, 2, 4])
    expect(back.some((s) => s.col === 3)).toBe(false)
  })

  it("still numbers positions consecutively across the gap", () => {
    // 3 rows x 4 = 12 standard seats, then the 3 surviving bench seats.
    const grid = seatGridFromBusType(MINI_BUS_WITH_GAP)
    expect(grid.map((s) => s.position)).toEqual(
      Array.from({ length: 15 }, (_, i) => String(i + 1)),
    )
    // Seat "15" is the last bench seat, and it sits at col 4 — NOT col 3.
    expect(grid[14]).toEqual({ position: "15", row: 4, col: 4 })
  })

  it("agrees exactly with seatPositionsFromBusType (one algorithm, not two)", () => {
    expect(seatGridFromBusType(MINI_BUS_WITH_GAP).map((s) => s.position)).toEqual(
      seatPositionsFromBusType(MINI_BUS_WITH_GAP),
    )
  })
})

// ---------------------------------------------------------------------------
// All three read paths must carry the same grid.
// ---------------------------------------------------------------------------
describe("busTypeGrid on bus responses", () => {
  it("persists busTypeId and returns the gapped grid from the admin bus read", async () => {
    const busType = await makeBusType()
    const tour = await makeTour()
    const created = await makeBus(tour.id, { busTypeId: busType.id })

    expect(created.busTypeId).toBe(busType.id)

    const res = await request(app)
      .get(`${API_BASE}/tour/${tour.id}/buses/${created.id}`)
      .set(auth)
    expect(res.status).toBe(200)
    expect(res.body.busTypeId).toBe(busType.id)
    expect(backRow(res.body.busTypeGrid).map((s: any) => s.col)).toEqual([1, 2, 4])
    // Every seat document has a grid cell, and vice versa.
    expect(res.body.busTypeGrid.seats.map((s: any) => s.position)).toEqual(
      res.body.seats.map((s: any) => s.position),
    )
  })

  it("returns the gapped grid on the admin bus list", async () => {
    const busType = await makeBusType()
    const tour = await makeTour()
    await makeBus(tour.id, { busTypeId: busType.id })

    const res = await request(app).get(`${API_BASE}/tour/${tour.id}/buses`).set(auth)
    expect(res.status).toBe(200)
    const bus = res.body.find((b: any) => b.busTypeId === busType.id)
    expect(backRow(bus.busTypeGrid).map((s: any) => s.col)).toEqual([1, 2, 4])
  })

  it("returns the gapped grid on the PUBLIC tour read, without leaking PII", async () => {
    const busType = await makeBusType()
    const tour = await makeTour()
    await makeBus(tour.id, { busTypeId: busType.id })

    // No Authorization header — this is the passenger-facing path.
    const res = await request(app).get(`${API_BASE}/tour/${tour.id}`)
    expect(res.status).toBe(200)
    const bus = res.body.buses.find((b: any) => b.busTypeId === busType.id)
    expect(backRow(bus.busTypeGrid).map((s: any) => s.col)).toEqual([1, 2, 4])
    // The grid is structural only — adding it must not widen the public seat
    // projection (SEV-001).
    for (const seat of bus.seats) {
      expect(Object.keys(seat).sort()).toEqual(["id", "position", "status"])
    }
    for (const cell of bus.busTypeGrid.seats) {
      expect(Object.keys(cell).sort()).toEqual(["col", "position", "row"])
    }
  })
})

// ---------------------------------------------------------------------------
// Soft-delete tolerance and live-edit propagation.
// ---------------------------------------------------------------------------
describe("live join semantics", () => {
  it("keeps rendering a bus whose template was soft-deleted", async () => {
    const busType = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, { busTypeId: busType.id })

    const del = await request(app).delete(`${API_BASE}/busType/${busType.id}`).set(auth)
    expect(del.status).toBe(200)

    // Gone from the admin picker...
    const list = await request(app).get(`${API_BASE}/busType`).set(auth)
    expect(list.body.some((t: any) => t.id === busType.id)).toBe(false)
    expect((await request(app).get(`${API_BASE}/busType/${busType.id}`).set(auth)).status).toBe(404)

    // ...but the bus still resolves its grid, gap intact.
    const res = await request(app)
      .get(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(auth)
    expect(res.status).toBe(200)
    expect(backRow(res.body.busTypeGrid).map((s: any) => s.col)).toEqual([1, 2, 4])
  })

  it("reflects a template edit retroactively on an existing bus", async () => {
    const busType = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, { busTypeId: busType.id })

    // Move the gap from col 3 to col 2.
    const edit = await request(app)
      .put(`${API_BASE}/busType/${busType.id}`)
      .set(auth)
      .send({ ...MINI_BUS_WITH_GAP, disabledSeatSlots: ["4-2"] })
    expect(edit.status).toBe(200)

    const res = await request(app)
      .get(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(auth)
    expect(backRow(res.body.busTypeGrid).map((s: any) => s.col)).toEqual([1, 3, 4])
  })
})

// ---------------------------------------------------------------------------
// Regression: manually-configured buses are untouched by all of the above.
// ---------------------------------------------------------------------------
describe("manual buses", () => {
  it("reports busTypeId/busTypeGrid as null so the client keeps its fallback", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id, {
      seatLayout: { positions: ["1", "2", "3", "4"] },
    })

    expect(bus.busTypeId).toBeNull()
    expect(bus.busTypeGrid).toBeNull()

    const res = await request(app)
      .get(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(auth)
    expect(res.body.busTypeId).toBeNull()
    expect(res.body.busTypeGrid).toBeNull()
  })

  it("clears the live reference when a template bus is given a raw seatLayout", async () => {
    const busType = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, { busTypeId: busType.id })

    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(auth)
      .send({ seatLayout: { positions: ["1", "2", "3"] } })
    expect(res.status).toBe(200)
    // Otherwise the stale template grid would keep overriding the hand-made layout.
    expect(res.body.busTypeId).toBeNull()
    expect(res.body.busTypeGrid).toBeNull()
  })
})
