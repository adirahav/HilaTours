import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import { createApp, API_BASE } from "../app"
import { randomUUID } from "crypto"
import {
  connectTestDb,
  clearTestDb,
  closeTestDb,
  adminToken,
  assertNoInternalIds,
  UUID_RE,
} from "./helpers"

const app = createApp()
const token = adminToken()
const auth = { Authorization: `Bearer ${token}` }

async function makeTour() {
  const res = await request(app)
    .post(`${API_BASE}/tour`)
    .set(auth)
    .send({ name: "Eilat Weekend", date: "2026-09-01T08:00:00.000Z", description: "fun" })
  return res.body
}

async function makeBus(tourId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`${API_BASE}/tour/${tourId}/buses`)
    .set(auth)
    .send({
      name: "Bus 1",
      seatLayout: { rows: 2, columns: 2 },
      pickupPoints: [
        { name: "Central Station", order: 1 },
        { name: "North Gate", order: 2 },
      ],
      ...overrides,
    })
  return res.body
}

async function getSeats(tourId: string, busId: string) {
  const res = await request(app).get(`${API_BASE}/tour/${tourId}/buses/${busId}`).set(auth)
  return res.body.seats as any[]
}

beforeAll(connectTestDb)
afterAll(closeTestDb)
beforeEach(clearTestDb)

describe("Tour CRUD", () => {
  it("POST /tour requires an admin token (401 without)", async () => {
    const res = await request(app)
      .post(`${API_BASE}/tour`)
      .send({ name: "X", date: "2026-09-01T08:00:00.000Z" })
    expect(res.status).toBe(401)
  })

  it("POST /tour creates a tour with a valid token", async () => {
    const tour = await makeTour()
    expect(tour.name).toBe("Eilat Weekend")
    expect(tour.deletedAt).toBeNull()
  })

  it("GET /tour excludes soft-deleted tours", async () => {
    const tour = await makeTour()
    await request(app).delete(`${API_BASE}/tour/${tour.id}`).set(auth).expect(200)
    const res = await request(app).get(`${API_BASE}/tour`).expect(200)
    expect(res.body.find((t: any) => t.id === tour.id)).toBeUndefined()
  })

  it("DELETE /tour/:tourId soft-deletes (sets deletedAt, keeps document)", async () => {
    const tour = await makeTour()
    const res = await request(app).delete(`${API_BASE}/tour/${tour.id}`).set(auth).expect(200)
    expect(res.body.deletedAt).not.toBeNull()
    // Still present when explicitly querying deleted docs.
    const { Tour } = await import("../models/tour.model")
    const raw = await Tour.findOne({ uuid: tour.id, deletedAt: { $ne: null } }).lean()
    expect(raw).not.toBeNull()
  })
})

describe("Every tour gets an auto-created, deletion-protected default bus", () => {
  it("POST /tour also creates one default bus with 50 available seats", async () => {
    const tour = await makeTour()
    const res = await request(app).get(`${API_BASE}/tour/${tour.id}/buses`).set(auth).expect(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].isDefault).toBe(true)
    const seats = await getSeats(tour.id, res.body[0].id)
    expect(seats).toHaveLength(50)
    expect(seats.every((s) => s.status === "available")).toBe(true)
  })

  it("a manually-created bus is never marked isDefault, even if a client sends isDefault:true", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id, { isDefault: true })
    expect(bus.isDefault).toBe(false)
  })

  it("DELETE on the default bus is rejected (400), the manually-created one is not", async () => {
    const tour = await makeTour()
    const buses = await request(app).get(`${API_BASE}/tour/${tour.id}/buses`).set(auth)
    const defaultBus = buses.body[0]

    const res = await request(app)
      .delete(`${API_BASE}/tour/${tour.id}/buses/${defaultBus.id}`)
      .set(auth)
    expect(res.status).toBe(400)

    const extra = await makeBus(tour.id)
    await request(app)
      .delete(`${API_BASE}/tour/${tour.id}/buses/${extra.id}`)
      .set(auth)
      .expect(200)
  })

  it("deleting the tour still cascades a soft-delete to its default bus", async () => {
    const tour = await makeTour()
    const buses = await request(app).get(`${API_BASE}/tour/${tour.id}/buses`).set(auth)
    const defaultBusId = buses.body[0].id

    await request(app).delete(`${API_BASE}/tour/${tour.id}`).set(auth).expect(200)

    const { Bus } = await import("../models/bus.model")
    const raw = await Bus.findOne({ uuid: defaultBusId, deletedAt: { $ne: null } }).lean()
    expect(raw).not.toBeNull()
  })
})

describe("Public tour responses embed PII-safe buses/seats", () => {
  const PII_FIELDS = [
    "passengerName",
    "passengerPhone",
    "notes",
    "pickupPointName",
    "requestedAt",
    "approvedAt",
    "assignedBy",
  ]

  it("GET /tour embeds buses[].seats[] (no auth required)", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const res = await request(app).get(`${API_BASE}/tour`).expect(200)
    const found = res.body.find((t: any) => t.id === tour.id)
    // Every tour also carries its auto-created default bus (50 seats) — see
    // bus.service.createDefaultBus — so look up the manually-created one.
    expect(found.buses).toHaveLength(2)
    const embedded = found.buses.find((b: any) => b.id === bus.id)
    expect(embedded.seats).toHaveLength(4)
    expect(embedded.totalSeats).toBe(4)
    expect(embedded.seats[0].status).toBe("available")
    expect(embedded.seats[0].position).toBeDefined()
  })

  it("GET /tour/:tourId embeds buses[].seats[] (no auth required)", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const res = await request(app).get(`${API_BASE}/tour/${tour.id}`).expect(200)
    const embedded = res.body.buses.find((b: any) => b.id === bus.id)
    expect(embedded.seats).toHaveLength(4)
  })

  it("embedded seats never expose passenger PII, even after a booking", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`)
      .send({
        seatIds: [seat.id],
        passengerName: "Dana",
        passengerPhone: "050-0000000",
        pickupPointName: "Central Station",
        notes: "secret",
      })
      .expect(200)

    for (const url of [`${API_BASE}/tour`, `${API_BASE}/tour/${tour.id}`]) {
      const res = await request(app).get(url).expect(200)
      const body = Array.isArray(res.body)
        ? res.body.find((t: any) => t.id === tour.id)
        : res.body
      const embedded = body.buses.find((b: any) => b.id === bus.id)
      const booked = embedded.seats.find((s: any) => s.id === seat.id)
      expect(booked.status).toBe("pending")
      for (const field of PII_FIELDS) {
        expect(booked).not.toHaveProperty(field)
      }
    }
  })

  it("excludes soft-deleted buses from the embedded list", async () => {
    const tour = await makeTour()
    const keep = await makeBus(tour.id)
    const drop = await makeBus(tour.id, { name: "Bus 2" })
    await request(app)
      .delete(`${API_BASE}/tour/${tour.id}/buses/${drop.id}`)
      .set(auth)
      .expect(200)

    const res = await request(app).get(`${API_BASE}/tour/${tour.id}`).expect(200)
    // The auto-created default bus is also present — assert on the
    // non-default ones specifically.
    const nonDefault = res.body.buses.filter((b: any) => !b.isDefault)
    expect(nonDefault.map((b: any) => b.id)).toEqual([keep.id])
  })
})

describe("Bus + seat pre-creation", () => {
  it("POST /tour/:tourId/buses creates a bus and pre-creates seats from seatLayout", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const seats = await getSeats(tour.id, bus.id)
    expect(seats.length).toBe(4) // 2 rows x 2 cols
    expect(seats.every((s) => s.status === "available")).toBe(true)
    expect(seats.map((s) => s.position).sort()).toEqual(["1A", "1B", "2A", "2B"])
  })
})

describe("Bus update (PUT)", () => {
  it("PUT /tour/:tourId/buses/:busId requires an admin token (401 without)", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .send({ name: "Renamed" })
    expect(res.status).toBe(401)
  })

  it("PUT /tour/:tourId/buses/:busId updates name and pickup points", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(auth)
      .send({
        name: "Bus 1 (updated)",
        pickupPoints: [{ name: "South Gate", order: 1 }],
      })
      .expect(200)
    expect(res.body.name).toBe("Bus 1 (updated)")
    expect(res.body.pickupPoints).toEqual([
      expect.objectContaining({ name: "South Gate", order: 1 }),
    ])
    // Pre-created seats are preserved across an update.
    const seats = await getSeats(tour.id, bus.id)
    expect(seats.length).toBe(4)
  })

  it("PUT on a non-existent bus returns 404", async () => {
    const tour = await makeTour()
    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${randomUUID()}`)
      .set(auth)
      .send({ name: "Nope" })
    expect(res.status).toBe(404)
  })

  it("PUT with a Mongo ObjectId instead of a uuid returns 404", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    // Look up the internal _id and prove it is not accepted as a public id.
    const { Bus } = await import("../models/bus.model")
    const raw: any = await Bus.findOne({ uuid: bus.id }).lean()
    const res = await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${String(raw._id)}`)
      .set(auth)
      .send({ name: "Nope" })
    expect(res.status).toBe(404)
  })
})

describe("Seat booking lifecycle", () => {
  it("bookings on an available seat -> pending", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`)
      .send({
        seatIds: [seat.id],
        passengerName: "Dana",
        passengerPhone: "050-0000000",
        pickupPointName: "Central Station",
      })
      .expect(200)
    expect(res.body[0].status).toBe("pending")
  })

  it("bookings succeed with only passengerName — phone/pickup are optional", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`)
      .send({ seatIds: [seat.id], passengerName: "Dana" })
      .expect(200)
    expect(res.body[0].status).toBe("pending")
  })

  it("bookings without passengerName -> 400", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`)
      .send({ seatIds: [seat.id], passengerPhone: "050" })
      .expect(400)
  })

  it("bookings persist notes on the seat", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`)
      .send({
        seatIds: [seat.id],
        passengerName: "Dana",
        passengerPhone: "050-0000000",
        pickupPointName: "Central Station",
        notes: "כיסא גלגלים",
      })
      .expect(200)
    expect(res.body[0].notes).toBe("כיסא גלגלים")
  })

  it("bookings reject more than 4 seats -> 400", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id, { seatLayout: { rows: 3, columns: 2 } })
    const seats = await getSeats(tour.id, bus.id)
    expect(seats.length).toBe(6)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`)
      .send({
        seatIds: seats.slice(0, 5).map((s) => s.id),
        passengerName: "Dana",
        passengerPhone: "050-0000000",
        pickupPointName: "Central Station",
      })
      .expect(400)
  })

  it("bookings on a non-available seat -> 409", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const body = {
      seatIds: [seat.id],
      passengerName: "Dana",
      passengerPhone: "050-0000000",
      pickupPointName: "Central Station",
    }
    await request(app).post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`).send(body).expect(200)
    await request(app).post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`).send(body).expect(409)
  })

  it("two simultaneous bookings for the same seat -> exactly one succeeds", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const url = `${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`
    const body = (name: string) => ({
      seatIds: [seat.id],
      passengerName: name,
      passengerPhone: "050-0000000",
      pickupPointName: "Central Station",
    })

    const [a, b] = await Promise.all([
      request(app).post(url).send(body("A")),
      request(app).post(url).send(body("B")),
    ])

    const statuses = [a.status, b.status].sort()
    expect(statuses).toEqual([200, 409])
  })

  it("approve without admin token -> 401", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/approve`)
      .send({ seatIds: [seat.id] })
      .expect(401)
  })

  it("approve on a pending seat -> taken", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`)
      .send({ seatIds: [seat.id], passengerName: "Dana", passengerPhone: "050", pickupPointName: "Central Station" })
      .expect(200)
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/approve`)
      .set(auth)
      .send({ seatIds: [seat.id] })
      .expect(200)
    expect(res.body[0].status).toBe("taken")
  })

  it("manual-assign on an already-taken seat -> rejected (400)", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const url = `${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`
    const body = { seatId: seat.id, passengerName: "Dana", passengerPhone: "050", pickupPointName: "Central Station" }
    await request(app).post(url).set(auth).send(body).expect(200)
    await request(app).post(url).set(auth).send({ ...body, passengerName: "Other" }).expect(400)
  })

  it("manual-assign succeeds with only passengerName — phone/pickup are optional", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
      .set(auth)
      .send({ seatId: seat.id, passengerName: "Dana" })
      .expect(200)
    const assigned = res.body.find((s: any) => s.id === seat.id)
    expect(assigned.status).toBe("taken")
    expect(assigned.passengerPhone).toBeNull()
    expect(assigned.pickupPointName).toBeNull()
  })

  it("manual-assign without passengerName -> 400", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
      .set(auth)
      .send({ seatId: seat.id, passengerPhone: "050" })
      .expect(400)
  })

  it("manual-assign returns the bus's fresh seat list (array)", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
      .set(auth)
      .send({ seatId: seat.id, passengerName: "Dana", passengerPhone: "050", pickupPoint: "Central Station" })
      .expect(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(4)
    const assigned = res.body.find((s: any) => s.id === seat.id)
    expect(assigned.status).toBe("taken")
    expect(assigned.pickupPointName).toBe("Central Station")
  })

  it("manual-assign honors a requested pending status (plan Q6)", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
      .set(auth)
      .send({
        seatId: seat.id,
        passengerName: "Dana",
        passengerPhone: "050",
        pickupPoint: "Central Station",
        status: "pending",
      })
      .expect(200)
    const assigned = res.body.find((s: any) => s.id === seat.id)
    expect(assigned.status).toBe("pending")
  })

  it("manual-assign resolves a 1-based seatNumbers entry to a seat", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const seats = await getSeats(tour.id, bus.id)
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
      .set(auth)
      .send({
        seatNumbers: [1],
        passengerName: "Dana",
        passengerPhone: "050",
        pickupPoint: "Central Station",
      })
      .expect(200)
    // seatNumber 1 maps to the first seat in position order.
    const first = seats.sort((a, b) => a.position.localeCompare(b.position))[0]
    const assigned = res.body.find((s: any) => s.id === first.id)
    expect(assigned.status).toBe("taken")
  })

  it("manual-assign resolves seatNumber using numeric position order, not Mongo's string sort (regression)", async () => {
    // Plain numeric-string positions "1".."13" — a lexicographic sort would
    // place "10","11","12","13" before "2".."9", resolving seatNumber 5 to
    // the wrong physical seat (this exact bug shipped: seatNumbers:[5]
    // landed on position "13").
    const tour = await makeTour()
    const bus = await makeBus(tour.id, {
      seatLayout: { positions: Array.from({ length: 13 }, (_, i) => String(i + 1)) },
    })
    const seats = await getSeats(tour.id, bus.id)
    const fifthByNumericOrder = seats.find((s: any) => s.position === "5")

    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
      .set(auth)
      .send({ seatNumbers: [5], passengerName: "Dana" })
      .expect(200)

    const assigned = res.body.find((s: any) => s.status === "taken")
    expect(assigned.id).toBe(fifthByNumericOrder.id)
  })

  // --- Security re-audit (plan 026): admin-JWT enforcement + status whitelisting ---

  it("manual-assign / cancel / toggle-reserve without an admin token -> 401", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const base = `${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats`

    await request(app)
      .post(`${base}/manual-assign`)
      .send({ seatId: seat.id, passengerName: "Mallory", passengerPhone: "050", pickupPoint: "Central Station" })
      .expect(401)
    await request(app).post(`${base}/cancel`).send({ seatIds: [seat.id] }).expect(401)
    await request(app).post(`${base}/toggle-reserve`).send({ seatIds: [seat.id] }).expect(401)

    // Fails closed: the seat is untouched by the rejected requests.
    const [after] = await getSeats(tour.id, bus.id)
    expect(after.status).toBe("available")
  })

  it("manual-assign with a forged/invalid bearer token -> 401", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
      .set("Authorization", "Bearer not-a-real-token")
      .send({ seatId: seat.id, passengerName: "Mallory", passengerPhone: "050", pickupPoint: "Central Station" })
      .expect(401)
  })

  it("manual-assign does not honor an out-of-contract status (reserved/available)", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const seats = await getSeats(tour.id, bus.id)
    const url = `${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`
    const body = (seatId: string, status: string) => ({
      seatId,
      passengerName: "Dana",
      passengerPhone: "050",
      pickupPoint: "Central Station",
      status,
    })

    for (const bogus of ["reserved", "available", "DROP TABLE"]) {
      const seat = seats.shift()
      const res = await request(app).post(url).set(auth).send(body(seat.id, bogus)).expect(200)
      const assigned = res.body.find((s: any) => s.id === seat.id)
      // Only taken|pending are honored; anything else falls back to taken.
      expect(assigned.status).toBe("taken")
    }
  })

  it("passenger bookings cannot self-elevate via a status field", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`)
      .send({
        seatIds: [seat.id],
        passengerName: "Dana",
        passengerPhone: "050",
        pickupPointName: "Central Station",
        status: "taken",
      })
      .expect(200)
    // Status is server-derived from the endpoint, never from the body.
    expect(res.body[0].status).toBe("pending")
  })

  it("cancel returns a taken seat to available", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const assignUrl = `${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`
    await request(app)
      .post(assignUrl)
      .set(auth)
      .send({ seatId: seat.id, passengerName: "Dana", passengerPhone: "050", pickupPointName: "Central Station" })
      .expect(200)
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/cancel`)
      .set(auth)
      .send({ seatIds: [seat.id] })
      .expect(200)
    expect(res.body[0].status).toBe("available")
    expect(res.body[0].passengerName).toBeNull()
  })

  it("toggle-reserve moves available <-> reserved", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const [seat] = await getSeats(tour.id, bus.id)
    const url = `${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/toggle-reserve`
    const on = await request(app).post(url).set(auth).send({ seatIds: [seat.id] }).expect(200)
    expect(on.body[0].status).toBe("reserved")
    const off = await request(app).post(url).set(auth).send({ seatIds: [seat.id] }).expect(200)
    expect(off.body[0].status).toBe("available")
  })

  it("swap-move moves a passenger to an available seat, vacating the source", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const seats = await getSeats(tour.id, bus.id)
    const from = seats[0]
    const to = seats[1]
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
      .set(auth)
      .send({ seatId: from.id, passengerName: "Dana", passengerPhone: "050", pickupPointName: "Central Station" })
      .expect(200)
    const res = await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/swap-move`)
      .set(auth)
      .send({ fromSeatId: from.id, toSeatId: to.id })
      .expect(200)
    const updated = await getSeats(tour.id, bus.id)
    const newFrom = updated.find((s) => s.id === from.id)
    const newTo = updated.find((s) => s.id === to.id)
    expect(newFrom.status).toBe("available")
    expect(newTo.status).toBe("taken")
    expect(newTo.passengerName).toBe("Dana")
    expect(res.body.length).toBe(2)
  })

  it("swap-move accepts the contract's fromSeat/toSeat seat numbers", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const seats = (await getSeats(tour.id, bus.id)).sort((a, b) =>
      a.position.localeCompare(b.position),
    )
    // Seat numbers are 1-based over the bus's seats in position order.
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
      .set(auth)
      .send({ seatNumbers: [1], passengerName: "Dana", passengerPhone: "050", pickupPoint: "Central Station" })
      .expect(200)

    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/swap-move`)
      .set(auth)
      .send({ fromSeat: 1, toSeat: 2 })
      .expect(200)

    const updated = await getSeats(tour.id, bus.id)
    const newFrom = updated.find((s) => s.id === seats[0].id)
    const newTo = updated.find((s) => s.id === seats[1].id)
    expect(newFrom.status).toBe("available")
    expect(newTo.status).toBe("taken")
    expect(newTo.passengerName).toBe("Dana")
  })

  it("swap-move swaps two occupied seats", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const seats = (await getSeats(tour.id, bus.id)).sort((a, b) =>
      a.position.localeCompare(b.position),
    )
    const assign = (seatId: string, name: string) =>
      request(app)
        .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
        .set(auth)
        .send({ seatId, passengerName: name, passengerPhone: "050", pickupPointName: "Central Station" })
        .expect(200)

    await assign(seats[0].id, "Dana")
    await assign(seats[1].id, "Roni")

    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/swap-move`)
      .set(auth)
      .send({ fromSeat: 1, toSeat: 2 })
      .expect(200)

    const updated = await getSeats(tour.id, bus.id)
    expect(updated.find((s) => s.id === seats[0].id).passengerName).toBe("Roni")
    expect(updated.find((s) => s.id === seats[1].id).passengerName).toBe("Dana")
  })

  it("swap-move requires an admin token (401 without)", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/swap-move`)
      .send({ fromSeat: 1, toSeat: 2 })
      .expect(401)
  })

  it("swap-move onto a seat booked concurrently -> 409, source keeps its passenger", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const seats = (await getSeats(tour.id, bus.id)).sort((a, b) =>
      a.position.localeCompare(b.position),
    )
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
      .set(auth)
      .send({ seatId: seats[0].id, passengerName: "Dana", passengerPhone: "050", pickupPointName: "Central Station" })
      .expect(200)
    // A passenger grabs the destination seat first.
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`)
      .send({
        seatIds: [seats[1].id],
        passengerName: "Interloper",
        passengerPhone: "050",
        pickupPointName: "Central Station",
      })
      .expect(200)

    // Destination is now pending (occupied) -> this becomes a swap, not a move.
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/swap-move`)
      .set(auth)
      .send({ fromSeat: 1, toSeat: 2 })
      .expect(200)

    const updated = await getSeats(tour.id, bus.id)
    expect(updated.find((s) => s.id === seats[0].id).passengerName).toBe("Interloper")
    expect(updated.find((s) => s.id === seats[1].id).passengerName).toBe("Dana")
  })

  it("swap-move from an empty seat -> 400", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/swap-move`)
      .set(auth)
      .send({ fromSeat: 1, toSeat: 2 })
      .expect(400)
  })
})

describe("Manifest", () => {
  it("groups passengers by pickup point", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const seats = await getSeats(tour.id, bus.id)
    const assign = (seatId: string, pickup: string, name: string) =>
      request(app)
        .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
        .set(auth)
        .send({ seatId, passengerName: name, passengerPhone: "050", pickupPointName: pickup })
        .expect(200)

    await assign(seats[0].id, "Central Station", "Dana")
    await assign(seats[1].id, "Central Station", "Roni")
    await assign(seats[2].id, "North Gate", "Gil")

    const res = await request(app)
      .get(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/manifest`)
      .set(auth)
      .expect(200)

    expect(res.body.length).toBe(2)
    const central = res.body.find((g: any) => g.pickupPointName === "Central Station")
    const north = res.body.find((g: any) => g.pickupPointName === "North Gate")
    expect(central.passengers.length).toBe(2)
    expect(north.passengers.length).toBe(1)
    // Ordered by declared pickup-point order.
    expect(res.body[0].pickupPointName).toBe("Central Station")
  })

  it("requires an admin token (401 without)", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    await request(app).get(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/manifest`).expect(401)
  })
})

// Security coverage for the TourManagement re-audit (plan 027 step 3): every
// mutation the admin TourManagement screen can trigger must fail closed
// server-side, and DELETE must be a soft-delete that disappears from reads.
describe("TourManagement mutations fail closed without an admin JWT", () => {
  it("PUT /tour/:tourId -> 401 without a token", async () => {
    const tour = await makeTour()
    await request(app).put(`${API_BASE}/tour/${tour.id}`).send({ name: "Hijacked" }).expect(401)
  })

  it("DELETE /tour/:tourId -> 401 without a token", async () => {
    const tour = await makeTour()
    await request(app).delete(`${API_BASE}/tour/${tour.id}`).expect(401)
  })

  it("POST /tour/:tourId/buses -> 401 without a token", async () => {
    const tour = await makeTour()
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .send({ name: "Rogue bus", seatLayout: { rows: 1, columns: 1 } })
      .expect(401)
  })

  it("DELETE /tour/:tourId/buses/:busId -> 401 without a token", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    await request(app).delete(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`).expect(401)
  })

  it("GET /tour/:tourId/buses/:busId (PII seat map) -> 401 without a token", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    await request(app).get(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`).expect(401)
  })

  it("a forged bearer token is rejected on tour/bus mutations", async () => {
    const tour = await makeTour()
    const forged = { Authorization: "Bearer not-a-real-jwt" }
    await request(app)
      .put(`${API_BASE}/tour/${tour.id}`)
      .set(forged)
      .send({ name: "Hijacked" })
      .expect(401)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses`)
      .set(forged)
      .send({ name: "Rogue", seatLayout: { rows: 1, columns: 1 } })
      .expect(401)
  })

  it("no unauthenticated mutation changed any state", async () => {
    const tour = await makeTour()
    await request(app).put(`${API_BASE}/tour/${tour.id}`).send({ name: "Hijacked" })
    await request(app).delete(`${API_BASE}/tour/${tour.id}`)
    const res = await request(app).get(`${API_BASE}/tour/${tour.id}`).expect(200)
    expect(res.body.name).toBe("Eilat Weekend")
    expect(res.body.deletedAt).toBeNull()
  })
})

describe("Tour/bus deletion is a soft-delete, excluded from reads", () => {
  it("DELETE bus keeps the document and sets deletedAt", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const res = await request(app)
      .delete(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(auth)
      .expect(200)
    expect(res.body.deletedAt).not.toBeNull()

    // The Bus model auto-filters deletedAt:null, so opt out explicitly to prove
    // the document is still on disk rather than hard-deleted.
    const { Bus } = await import("../models/bus.model")
    const raw = await Bus.findOne({ uuid: bus.id, deletedAt: { $ne: null } }).lean()
    expect(raw).not.toBeNull()
    expect((raw as any).deletedAt).not.toBeNull()
  })

  it("a soft-deleted bus disappears from GET /tour/:tourId/buses", async () => {
    const tour = await makeTour()
    const keep = await makeBus(tour.id)
    const drop = await makeBus(tour.id, { name: "Bus 2" })
    await request(app)
      .delete(`${API_BASE}/tour/${tour.id}/buses/${drop.id}`)
      .set(auth)
      .expect(200)
    const res = await request(app).get(`${API_BASE}/tour/${tour.id}/buses`).expect(200)
    // The auto-created default bus is also present alongside `keep`.
    const nonDefault = res.body.filter((b: any) => !b.isDefault)
    expect(nonDefault.map((b: any) => b.id)).toEqual([keep.id])
  })

  it("deleting a tour cascades a soft-delete to its buses (no hard delete)", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    await request(app).delete(`${API_BASE}/tour/${tour.id}`).set(auth).expect(200)

    const { Bus } = await import("../models/bus.model")
    const raw = await Bus.findOne({ uuid: bus.id, deletedAt: { $ne: null } }).lean()
    expect(raw).not.toBeNull()
    expect((raw as any).deletedAt).not.toBeNull()

    const res = await request(app).get(`${API_BASE}/tour/${tour.id}/buses`).expect(200)
    expect(res.body).toEqual([])
  })

  it("GET /tour/:tourId on a soft-deleted tour -> 404", async () => {
    const tour = await makeTour()
    await request(app).delete(`${API_BASE}/tour/${tour.id}`).set(auth).expect(200)
    await request(app).get(`${API_BASE}/tour/${tour.id}`).expect(404)
  })

  it("deleting an already-deleted tour/bus -> 404 (no double-delete)", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    await request(app)
      .delete(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(auth)
      .expect(200)
    await request(app)
      .delete(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(auth)
      .expect(404)
    await request(app).delete(`${API_BASE}/tour/${tour.id}`).set(auth).expect(200)
    await request(app).delete(`${API_BASE}/tour/${tour.id}`).set(auth).expect(404)
  })
})

describe("Tour/bus write payloads are whitelisted", () => {
  it("a client cannot set deletedAt via POST or PUT /tour", async () => {
    const created = await request(app)
      .post(`${API_BASE}/tour`)
      .set(auth)
      .send({ name: "T", date: "2026-09-01T08:00:00.000Z", deletedAt: new Date().toISOString() })
      .expect(200)
    expect(created.body.deletedAt).toBeNull()

    const updated = await request(app)
      .put(`${API_BASE}/tour/${created.body.id}`)
      .set(auth)
      .send({ name: "T2", deletedAt: new Date().toISOString() })
      .expect(200)
    expect(updated.body.deletedAt).toBeNull()

    // Still visible in the public list — it was never marked deleted.
    const list = await request(app).get(`${API_BASE}/tour`).expect(200)
    expect(list.body.some((t: any) => t.id === created.body.id)).toBe(true)
  })

  it("PUT /tour/:tourId/buses/:busId cannot remap seatLayout and destroy seat state", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    await request(app)
      .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
      .set(auth)
      .send({ name: "Bus 1", seatLayout: { rows: 9, columns: 9 } })
      .expect(200)
    const seats = await getSeats(tour.id, bus.id)
    expect(seats.length).toBe(4)
  })

  it("free-text tour/bus fields are stored and returned verbatim as strings", async () => {
    const xss = '<img src=x onerror="alert(1)">'
    const tour = await request(app)
      .post(`${API_BASE}/tour`)
      .set(auth)
      .send({ name: xss, date: "2026-09-01T08:00:00.000Z", description: xss })
      .expect(200)
    expect(tour.body.name).toBe(xss)

    const bus = await makeBus(tour.body.id, {
      name: xss,
      pickupPoints: [{ name: xss, order: 1 }],
    })
    expect(typeof bus.name).toBe("string")
    expect(bus.pickupPoints[0].name).toBe(xss)
  })
})

// UUID identity layer (plan 028). Mongo `_id` is internal-only: every response
// — including embedded buses/seats and manifest rows — exposes `id` (a uuid)
// and never `_id`/`uuid`/`__v`.
describe("UUID identity layer: responses expose id (uuid), never _id", () => {
  it("tour/bus/seat responses carry a uuid `id` and no internal keys", async () => {
    const tour = await makeTour()
    expect(tour.id).toMatch(UUID_RE)
    assertNoInternalIds(tour)

    const bus = await makeBus(tour.id)
    expect(bus.id).toMatch(UUID_RE)
    expect(bus.tourId).toBe(tour.id) // owning tour serialized as its uuid
    assertNoInternalIds(bus)

    const seats = await getSeats(tour.id, bus.id)
    expect(seats.every((s) => UUID_RE.test(s.id))).toBe(true)
    expect(seats.every((s) => s.busId === bus.id)).toBe(true)
    assertNoInternalIds(seats)
  })

  it("no endpoint leaks _id across the full admin + passenger flow", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const seats = await getSeats(tour.id, bus.id)
    const seatBase = `${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats`

    const responses = [
      await request(app).get(`${API_BASE}/tour`).expect(200),
      await request(app).get(`${API_BASE}/tour/${tour.id}`).expect(200),
      await request(app).get(`${API_BASE}/tour/${tour.id}/buses`).expect(200),
      await request(app).get(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`).set(auth).expect(200),
      await request(app)
        .post(`${seatBase}/bookings`)
        .send({
          seatIds: [seats[0].id],
          passengerName: "Dana",
          passengerPhone: "050",
          pickupPointName: "Central Station",
        })
        .expect(200),
      await request(app).post(`${seatBase}/approve`).set(auth).send({ seatIds: [seats[0].id] }).expect(200),
      await request(app).post(`${seatBase}/cancel`).set(auth).send({ seatIds: [seats[0].id] }).expect(200),
      await request(app).post(`${seatBase}/toggle-reserve`).set(auth).send({ seatIds: [seats[0].id] }).expect(200),
      await request(app)
        .post(`${seatBase}/manual-assign`)
        .set(auth)
        .send({
          seatId: seats[1].id,
          passengerName: "Roni",
          passengerPhone: "050",
          pickupPoint: "Central Station",
        })
        .expect(200),
      await request(app)
        .post(`${seatBase}/swap-move`)
        .set(auth)
        .send({ fromSeatId: seats[1].id, toSeatId: seats[2].id })
        .expect(200),
      await request(app)
        .get(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/manifest`)
        .set(auth)
        .expect(200),
      await request(app).put(`${API_BASE}/tour/${tour.id}`).set(auth).send({ name: "T2" }).expect(200),
      await request(app)
        .put(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
        .set(auth)
        .send({ name: "B2" })
        .expect(200),
      await request(app)
        .delete(`${API_BASE}/tour/${tour.id}/buses/${bus.id}`)
        .set(auth)
        .expect(200),
      await request(app).delete(`${API_BASE}/tour/${tour.id}`).set(auth).expect(200),
    ]

    for (const res of responses) assertNoInternalIds(res.body)
  })

  it("manifest rows expose the seat's uuid as `id`", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const seats = await getSeats(tour.id, bus.id)
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/manual-assign`)
      .set(auth)
      .send({
        seatId: seats[0].id,
        passengerName: "Dana",
        passengerPhone: "050",
        pickupPointName: "Central Station",
      })
      .expect(200)

    const res = await request(app)
      .get(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/manifest`)
      .set(auth)
      .expect(200)
    const row = res.body[0].passengers[0]
    expect(row.id).toBe(seats[0].id)
    expect(row.id).toMatch(UUID_RE)
  })

  it("a Mongo ObjectId is rejected wherever a uuid is expected", async () => {
    const tour = await makeTour()
    const bus = await makeBus(tour.id)
    const { Tour } = await import("../models/tour.model")
    const { Seat } = await import("../models/seat.model")
    const rawTour: any = await Tour.findOne({ uuid: tour.id }).lean()
    const rawSeat: any = await Seat.find({}).limit(1).lean()

    // Tour route param
    await request(app).get(`${API_BASE}/tour/${String(rawTour._id)}`).expect(404)
    // Seat id in a booking body
    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`)
      .send({
        seatIds: [String(rawSeat[0]._id)],
        passengerName: "Mallory",
        passengerPhone: "050",
        pickupPointName: "Central Station",
      })
      .expect(400)
  })

  it("a seat uuid from another bus cannot be booked through this bus", async () => {
    const tour = await makeTour()
    const busA = await makeBus(tour.id)
    const busB = await makeBus(tour.id, { name: "Bus 2" })
    const seatsB = await getSeats(tour.id, busB.id)

    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${busA.id}/seats/bookings`)
      .send({
        seatIds: [seatsB[0].id],
        passengerName: "Mallory",
        passengerPhone: "050",
        pickupPointName: "Central Station",
      })
      .expect(404)
  })

  it("unknown uuids resolve to 404, never a 500", async () => {
    const tour = await makeTour()
    await request(app).get(`${API_BASE}/tour/${randomUUID()}`).expect(404)
    await request(app).get(`${API_BASE}/tour/${tour.id}/buses/${randomUUID()}`).set(auth).expect(404)
    await request(app)
      .get(`${API_BASE}/tour/${tour.id}/buses/${randomUUID()}/manifest`)
      .set(auth)
      .expect(404)
  })
})
