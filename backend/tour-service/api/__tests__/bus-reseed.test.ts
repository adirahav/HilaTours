import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import { randomUUID } from "crypto"
import { createApp, API_BASE } from "../app"
import { connectTestDb, clearTestDb, closeTestDb, adminToken } from "./helpers"
import { Bus } from "../models/bus.model"
import { Seat } from "../models/seat.model"

/**
 * Plan 035 — PUT /tour/:tourId/buses/:busId with `busTypeId` regenerates the
 * seatLayout from the template and reseeds seats BY POSITION: positions common
 * to both layouts keep their occupant untouched, new positions are added
 * `available`, and positions that no longer exist are hard-deleted.
 */

const app = createApp()
const auth = { Authorization: `Bearer ${adminToken()}` }

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
    .set(auth)
    .send({ ...BASE_TYPE, name: `type-${randomUUID()}`, ...overrides })
  expect(res.status).toBe(200)
  return res.body
}

async function makeTour() {
  const res = await request(app)
    .post(`${API_BASE}/tour`)
    .set(auth)
    .send({ name: "Eilat Weekend", date: "2026-09-01T08:00:00.000Z" })
  expect(res.status).toBe(200)
  return res.body
}

async function makeBus(tourId: string, busTypeId: string) {
  const res = await request(app)
    .post(`${API_BASE}/tour/${tourId}/buses`)
    .set(auth)
    .send({ name: "אוטובוס א", busTypeId })
  expect(res.status).toBe(200)
  return res.body
}

/** Internal `_id` of a bus, for direct Seat assertions. */
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

async function putBus(tourId: string, busId: string, body: Record<string, unknown>) {
  return request(app).put(`${API_BASE}/tour/${tourId}/buses/${busId}`).set(auth).send(body)
}

beforeAll(connectTestDb)
afterAll(closeTestDb)
beforeEach(clearTestDb)

describe("PUT /tour/:tourId/buses/:busId with busTypeId — reseed by position", () => {
  it("preserves occupants at positions the bigger template still contains", async () => {
    const small = await makeBusType({ standardRowsCount: 13 }) // 55 seats
    const big = await makeBusType({ standardRowsCount: 16 }) // 3 extra rows
    const tour = await makeTour()
    const bus = await makeBus(tour.id, small.id)

    await occupy(bus.id, "1", {
      status: "taken",
      passengerName: "עדי",
      passengerPhone: "0501234567",
    })

    const res = await putBus(tour.id, bus.id, { name: "אוטובוס א", busTypeId: big.id })
    expect(res.status).toBe(200)

    const seat1 = await seatAt(bus.id, "1")
    expect(seat1.status).toBe("taken")
    expect(seat1.passengerName).toBe("עדי")
    expect(seat1.passengerPhone).toBe("0501234567")

    const total = await seatCount(bus.id)
    expect(total).toBe(55 + 12) // 3 extra standard rows x 4 seats
    const added = await seatAt(bus.id, String(total))
    expect(added.status).toBe("available")
  })

  it("hard-deletes occupied seats at positions the smaller template no longer has", async () => {
    const big = await makeBusType({ standardRowsCount: 13 }) // 55 seats
    const small = await makeBusType({ standardRowsCount: 10 }) // 43 seats
    const tour = await makeTour()
    const bus = await makeBus(tour.id, big.id)

    await occupy(bus.id, "55", { status: "taken", passengerName: "נעלם" })
    await occupy(bus.id, "2", { status: "taken", passengerName: "נשאר" })

    const res = await putBus(tour.id, bus.id, { busTypeId: small.id })
    expect(res.status).toBe(200)

    expect(await seatAt(bus.id, "55")).toBeNull()
    const kept = await seatAt(bus.id, "2")
    expect(kept.status).toBe("taken")
    expect(kept.passengerName).toBe("נשאר")
    expect(await seatCount(bus.id)).toBe(43)
  })

  it("preserves every seat status and PII at common positions", async () => {
    const a = await makeBusType({ standardRowsCount: 13 })
    const b = await makeBusType({ standardRowsCount: 14 })
    const tour = await makeTour()
    const bus = await makeBus(tour.id, a.id)

    await occupy(bus.id, "1", { status: "pending", passengerName: "ממתין", notes: "n1" })
    await occupy(bus.id, "2", { status: "taken", passengerName: "מאושר", notes: "n2" })
    await occupy(bus.id, "3", { status: "reserved" })

    expect((await putBus(tour.id, bus.id, { busTypeId: b.id })).status).toBe(200)

    expect((await seatAt(bus.id, "1")).status).toBe("pending")
    expect((await seatAt(bus.id, "1")).notes).toBe("n1")
    expect((await seatAt(bus.id, "2")).status).toBe("taken")
    expect((await seatAt(bus.id, "2")).passengerName).toBe("מאושר")
    expect((await seatAt(bus.id, "3")).status).toBe("reserved")
    expect((await seatAt(bus.id, "4")).status).toBe("available")
  })

  it("404s on an unknown busTypeId and touches no seats", async () => {
    const type = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, type.id)
    await occupy(bus.id, "1", { status: "taken", passengerName: "עדי" })

    const res = await putBus(tour.id, bus.id, { busTypeId: randomUUID() })
    expect(res.status).toBe(404)

    expect(await seatCount(bus.id)).toBe(55)
    expect((await seatAt(bus.id, "1")).passengerName).toBe("עדי")
  })

  it("lets busTypeId win and silently ignores a raw seatLayout in the same body", async () => {
    const a = await makeBusType({ standardRowsCount: 13 })
    const b = await makeBusType({ standardRowsCount: 14 })
    const tour = await makeTour()
    const bus = await makeBus(tour.id, a.id)

    const res = await putBus(tour.id, bus.id, {
      busTypeId: b.id,
      seatLayout: { positions: ["X1", "X2"] },
    })
    expect(res.status).toBe(200)

    expect(await seatAt(bus.id, "X1")).toBeNull()
    expect(await seatCount(bus.id)).toBe(59)
  })

  it("leaves seats untouched when only name/pickupPoints are sent", async () => {
    const type = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, type.id)
    await occupy(bus.id, "1", { status: "taken", passengerName: "עדי" })
    const before = await seatAt(bus.id, "1")

    const res = await putBus(tour.id, bus.id, {
      name: "אוטובוס ב",
      pickupPoints: [{ name: "תל אביב", order: 1 }],
      busTypeId: null,
    })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("אוטובוס ב")

    const after = await seatAt(bus.id, "1")
    expect(String(after._id)).toBe(String(before._id))
    expect(after.passengerName).toBe("עדי")
    expect(await seatCount(bus.id)).toBe(55)
  })

  it("still rejects a raw seatLayout shrink below an occupied seat (resizeSeats regression)", async () => {
    const type = await makeBusType()
    const tour = await makeTour()
    const bus = await makeBus(tour.id, type.id)
    await occupy(bus.id, "55", { status: "taken", passengerName: "עדי" })

    const res = await putBus(tour.id, bus.id, {
      seatLayout: { positions: Array.from({ length: 40 }, (_, i) => String(i + 1)) },
    })
    expect(res.status).toBe(400)
    expect(await seatCount(bus.id)).toBe(55)
  })
})
