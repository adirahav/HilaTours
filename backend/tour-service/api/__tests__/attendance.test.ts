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
import { deriveBookingGroupId } from "../attendance/attendance.service"

const app = createApp()
const auth = { Authorization: `Bearer ${adminToken()}` }
const nonAdmin = { Authorization: `Bearer ${userToken()}` }

async function makeTour() {
  const res = await request(app)
    .post(`${API_BASE}/tour`)
    .set(auth)
    .send({ name: "Eilat Weekend", date: "2026-09-01T08:00:00.000Z" })
  return res.body
}

async function makeBus(tourId: string) {
  const res = await request(app)
    .post(`${API_BASE}/tour/${tourId}/buses`)
    .set(auth)
    .send({
      name: "Bus 1",
      seatLayout: { rows: 4, columns: 3 },
      pickupPoints: [
        { name: "Central Station", order: 1 },
        { name: "North Gate", order: 2 },
      ],
    })
  return res.body
}

async function getSeats(tourId: string, busId: string) {
  const res = await request(app)
    .get(`${API_BASE}/tour/${tourId}/buses/${busId}`)
    .set(auth)
  return res.body.seats as any[]
}

/** Books a seat straight to `taken` via the admin manual-assign endpoint. */
async function assign(
  tourId: string,
  busId: string,
  seatId: string,
  passenger: Record<string, unknown>,
) {
  await request(app)
    .post(`${API_BASE}/tour/${tourId}/buses/${busId}/seats/manual-assign`)
    .set(auth)
    .send({ seatId, ...passenger })
    .expect(200)
}

async function reserve(tourId: string, busId: string, seatId: string) {
  await request(app)
    .post(`${API_BASE}/tour/${tourId}/buses/${busId}/seats/toggle-reserve`)
    .set(auth)
    .send({ seatIds: [seatId] })
    .expect(200)
}

/** Returns the supertest chain so callers can assert the status themselves. */
function createSession(tourId: string, busId: string, title = "בדיקת בוקר") {
  return request(app)
    .post(`${API_BASE}/attendance/session`)
    .set(auth)
    .send({ tourId, busId, title })
}

/**
 * A bus with a realistic mix: a two-person family sharing one phone at Central
 * Station, a lone passenger at North Gate, one untouched `available` seat, and
 * one `pending` (unapproved) request — the last two must NOT be snapshotted.
 */
async function seedBus() {
  const tour = await makeTour()
  const bus = await makeBus(tour.id)
  const seats = await getSeats(tour.id, bus.id)

  await assign(tour.id, bus.id, seats[0].id, {
    passengerName: "כהן דנה",
    passengerPhone: "050-1234567",
    pickupPointName: "Central Station",
  })
  await assign(tour.id, bus.id, seats[1].id, {
    passengerName: "כהן יוסי",
    passengerPhone: "0501234567",
    pickupPointName: "Central Station",
  })
  await assign(tour.id, bus.id, seats[2].id, {
    passengerName: "לוי מיכל",
    passengerPhone: "052-7654321",
    pickupPointName: "North Gate",
  })

  // A pending (unapproved) booking request — a passenger not yet on the bus.
  await request(app)
    .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/bookings`)
    .send({
      seatIds: [seats[3].id],
      passengerName: "ממתין",
      passengerPhone: "0533333333",
      pickupPointName: "North Gate",
    })
    .expect(200)

  return { tour, bus, seats }
}

beforeAll(connectTestDb)
afterAll(closeTestDb)
beforeEach(clearTestDb)

// ---------------------------------------------------------------------------
// Party grouping — the fallback chain the whole "one card per family" UI rests
// on. A regression here silently splits or merges families on the guide's board.
// ---------------------------------------------------------------------------
describe("deriveBookingGroupId", () => {
  it("prefers an explicit bookingGroupId over phone and name", () => {
    expect(
      deriveBookingGroupId({
        bookingGroupId: "grp-1",
        passengerPhone: "0501234567",
        passengerName: "Dana",
      }),
    ).toBe("grp-1")
  })

  it("falls back to the phone, ignoring formatting differences", () => {
    const a = deriveBookingGroupId({ passengerPhone: "050-123-4567", passengerName: "Dana" })
    const b = deriveBookingGroupId({ passengerPhone: "0501234567", passengerName: "Yossi" })
    expect(a).toBe("phone-0501234567")
    // Same household phone, different people -> same party.
    expect(a).toBe(b)
  })

  it("falls back to the name when the phone is absent or too short to be safe", () => {
    expect(deriveBookingGroupId({ passengerPhone: null, passengerName: "Dana" })).toBe("name-Dana")
    expect(deriveBookingGroupId({ passengerPhone: "12345", passengerName: "Dana" })).toBe(
      "name-Dana",
    )
  })

  it("returns null when there is nothing to group on", () => {
    expect(deriveBookingGroupId({ passengerPhone: null, passengerName: "  " })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Session creation / snapshot correctness
// ---------------------------------------------------------------------------
describe("POST /attendance/session", () => {
  it("snapshots only taken/reserved seats that carry a passenger", async () => {
    const { tour, bus, seats } = await seedBus()
    // A reserved-but-empty seat: reserved status, but nobody to check in.
    await reserve(tour.id, bus.id, seats[4].id)

    const res = await createSession(tour.id, bus.id).expect(200)

    expect(res.body.records).toHaveLength(3)
    const names = res.body.records.map((r: any) => r.passengerName).sort()
    expect(names).toEqual(["כהן דנה", "כהן יוסי", "לוי מיכל"].sort())
    // The pending request and the empty reserved/available seats are excluded.
    expect(names).not.toContain("ממתין")
  })

  it("starts every record missing, with the party key resolved from the phone", async () => {
    const { tour, bus } = await seedBus()
    const res = await createSession(tour.id, bus.id).expect(200)

    expect(res.body.records.every((r: any) => r.isPresent === false)).toBe(true)
    expect(res.body.records.every((r: any) => r.checkedInAt === null)).toBe(true)

    const family = res.body.records.filter((r: any) => r.passengerName.startsWith("כהן"))
    expect(family).toHaveLength(2)
    // Both spouses share one phone -> one party card.
    expect(family[0].bookingGroupId).toBe(family[1].bookingGroupId)
    expect(family[0].bookingGroupId).toBe("phone-0501234567")
  })

  it("returns uuids only — no internal _id/__v/uuid leaks", async () => {
    const { tour, bus } = await seedBus()
    const res = await createSession(tour.id, bus.id).expect(200)
    assertNoInternalIds(res.body)
    expect(res.body.id).toMatch(UUID_RE)
    expect(res.body.tourId).toBe(tour.id)
    expect(res.body.busId).toBe(bus.id)
    expect(res.body.records[0].seatId).toMatch(UUID_RE)
  })

  it("never serializes the internal createdBy admin attribution", async () => {
    const { tour, bus } = await seedBus()
    const res = await createSession(tour.id, bus.id).expect(200)
    expect(res.body.createdBy).toBeUndefined()
  })

  it("allows unlimited free-form sessions per bus, with no title uniqueness", async () => {
    const { tour, bus } = await seedBus()
    await createSession(tour.id, bus.id, "יציאה").expect(200)
    await createSession(tour.id, bus.id, "יציאה").expect(200)

    const res = await request(app)
      .get(`${API_BASE}/attendance/session`)
      .query({ tourId: tour.id, busId: bus.id })
      .set(auth)
      .expect(200)
    expect(res.body).toHaveLength(2)
  })

  it("rejects a missing title with 400", async () => {
    const { tour, bus } = await seedBus()
    await createSession(tour.id, bus.id, "   ").expect(400)
  })

  it("404s when the bus belongs to a different tour", async () => {
    const { bus } = await seedBus()
    const otherTour = await makeTour()
    await createSession(otherTour.id, bus.id).expect(404)
  })
})

// ---------------------------------------------------------------------------
// Presence — the single mutation behind individual, party and station gestures
// ---------------------------------------------------------------------------
describe("POST /attendance/session/:sessionId/presence", () => {
  async function sessionWithRecords() {
    const { tour, bus } = await seedBus()
    const res = await createSession(tour.id, bus.id).expect(200)
    return { tour, bus, session: res.body }
  }

  it("checks in a single passenger and stamps checkedInAt", async () => {
    const { session } = await sessionWithRecords()
    const target = session.records[0]

    const res = await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(auth)
      .send({ recordIds: [target.id], isPresent: true })
      .expect(200)

    const updated = res.body.records.find((r: any) => r.id === target.id)
    expect(updated.isPresent).toBe(true)
    expect(updated.checkedInAt).not.toBeNull()
    // Everyone else is untouched.
    expect(res.body.records.filter((r: any) => r.isPresent)).toHaveLength(1)
  })

  it("checks in a whole party in one call", async () => {
    const { session } = await sessionWithRecords()
    const family = session.records.filter((r: any) => r.bookingGroupId === "phone-0501234567")
    expect(family).toHaveLength(2)

    const res = await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(auth)
      .send({ recordIds: family.map((r: any) => r.id), isPresent: true })
      .expect(200)

    expect(res.body.records.filter((r: any) => r.isPresent)).toHaveLength(2)
  })

  it("batch-checks an entire pickup station through the same endpoint", async () => {
    const { session } = await sessionWithRecords()
    const station = session.records.filter((r: any) => r.pickupPointName === "Central Station")

    const res = await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(auth)
      .send({ recordIds: station.map((r: any) => r.id), isPresent: true })
      .expect(200)

    const present = res.body.records.filter((r: any) => r.isPresent)
    expect(present).toHaveLength(2)
    expect(present.every((r: any) => r.pickupPointName === "Central Station")).toBe(true)
  })

  it("un-checks and clears checkedInAt when flipping back to missing", async () => {
    const { session } = await sessionWithRecords()
    const target = session.records[0]
    const url = `${API_BASE}/attendance/session/${session.id}/presence`

    await request(app).post(url).set(auth).send({ recordIds: [target.id], isPresent: true }).expect(200)
    const res = await request(app)
      .post(url)
      .set(auth)
      .send({ recordIds: [target.id], isPresent: false })
      .expect(200)

    const updated = res.body.records.find((r: any) => r.id === target.id)
    expect(updated.isPresent).toBe(false)
    expect(updated.checkedInAt).toBeNull()
  })

  it("rejects an empty or malformed recordIds list", async () => {
    const { session } = await sessionWithRecords()
    const url = `${API_BASE}/attendance/session/${session.id}/presence`
    await request(app).post(url).set(auth).send({ recordIds: [], isPresent: true }).expect(400)
    await request(app).post(url).set(auth).send({ recordIds: ["nope"], isPresent: true }).expect(400)
    await request(app)
      .post(url)
      .set(auth)
      .send({ recordIds: [session.records[0].id], isPresent: "yes" })
      .expect(400)
  })

  it("refuses ids that belong to another session rather than silently skipping them", async () => {
    const { tour, bus, session } = await sessionWithRecords()
    const other = (await createSession(tour.id, bus.id, "חזרה").expect(200)).body

    await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(auth)
      .send({ recordIds: [other.records[0].id], isPresent: true })
      .expect(400)

    // The foreign session is untouched.
    const check = await request(app)
      .get(`${API_BASE}/attendance/session/${other.id}`)
      .set(auth)
      .expect(200)
    expect(check.body.records.every((r: any) => !r.isPresent)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Reset / delete
// ---------------------------------------------------------------------------
describe("reset and delete", () => {
  it("reset clears every presence mark but keeps the snapshot", async () => {
    const { tour, bus } = await seedBus()
    const session = (await createSession(tour.id, bus.id).expect(200)).body

    await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(auth)
      .send({ recordIds: session.records.map((r: any) => r.id), isPresent: true })
      .expect(200)

    const res = await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/reset`)
      .set(auth)
      .expect(200)

    expect(res.body.records).toHaveLength(3)
    expect(res.body.records.every((r: any) => r.isPresent === false)).toBe(true)
    expect(res.body.records.every((r: any) => r.checkedInAt === null)).toBe(true)
  })

  it("delete hard-removes the session and its records, leaving seats intact", async () => {
    const { tour, bus } = await seedBus()
    const session = (await createSession(tour.id, bus.id).expect(200)).body

    await request(app)
      .delete(`${API_BASE}/attendance/session/${session.id}`)
      .set(auth)
      .expect(204)

    await request(app)
      .get(`${API_BASE}/attendance/session/${session.id}`)
      .set(auth)
      .expect(404)

    const list = await request(app)
      .get(`${API_BASE}/attendance/session`)
      .query({ tourId: tour.id, busId: bus.id })
      .set(auth)
      .expect(200)
    expect(list.body).toHaveLength(0)

    // Records only ever point AT seats, never the reverse — nothing is orphaned.
    const seats = await getSeats(tour.id, bus.id)
    expect(seats.filter((s: any) => s.status === "taken")).toHaveLength(3)
  })

  it("404s on an unknown session id", async () => {
    await request(app)
      .post(`${API_BASE}/attendance/session/${randomUUID()}/reset`)
      .set(auth)
      .expect(404)
    await request(app)
      .delete(`${API_BASE}/attendance/session/${randomUUID()}`)
      .set(auth)
      .expect(404)
  })
})

// ---------------------------------------------------------------------------
// Snapshot semantics — a session is a point-in-time copy, deliberately
// ---------------------------------------------------------------------------
describe("snapshot semantics", () => {
  it("does not retroactively change an existing session when a seat is edited", async () => {
    const { tour, bus, seats } = await seedBus()
    const session = (await createSession(tour.id, bus.id).expect(200)).body

    await request(app)
      .post(`${API_BASE}/tour/${tour.id}/buses/${bus.id}/seats/cancel`)
      .set(auth)
      .send({ seatIds: [seats[2].id] })
      .expect(200)

    const res = await request(app)
      .get(`${API_BASE}/attendance/session/${session.id}`)
      .set(auth)
      .expect(200)
    // Still 3 — the cancelled passenger stays on the already-created board.
    expect(res.body.records).toHaveLength(3)
    expect(res.body.records.some((r: any) => r.passengerName === "לוי מיכל")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Authorization — these routes return passenger PII (SEV-001)
// ---------------------------------------------------------------------------
describe("attendance authorization", () => {
  it("rejects every route without a token (401)", async () => {
    const id = randomUUID()
    await request(app).get(`${API_BASE}/attendance/session`).expect(401)
    await request(app).post(`${API_BASE}/attendance/session`).send({}).expect(401)
    await request(app).get(`${API_BASE}/attendance/session/${id}`).expect(401)
    await request(app).delete(`${API_BASE}/attendance/session/${id}`).expect(401)
    await request(app).post(`${API_BASE}/attendance/session/${id}/reset`).expect(401)
    await request(app).post(`${API_BASE}/attendance/session/${id}/presence`).send({}).expect(401)
  })

  it("rejects a validly-signed non-admin token (403)", async () => {
    const { tour, bus } = await seedBus()
    const session = (await createSession(tour.id, bus.id).expect(200)).body

    await request(app)
      .get(`${API_BASE}/attendance/session`)
      .query({ tourId: tour.id, busId: bus.id })
      .set(nonAdmin)
      .expect(403)
    await request(app)
      .post(`${API_BASE}/attendance/session`)
      .set(nonAdmin)
      .send({ tourId: tour.id, busId: bus.id, title: "x" })
      .expect(403)
    await request(app)
      .get(`${API_BASE}/attendance/session/${session.id}`)
      .set(nonAdmin)
      .expect(403)
    await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/reset`)
      .set(nonAdmin)
      .expect(403)
    await request(app)
      .post(`${API_BASE}/attendance/session/${session.id}/presence`)
      .set(nonAdmin)
      .send({ recordIds: [session.records[0].id], isPresent: true })
      .expect(403)
    await request(app)
      .delete(`${API_BASE}/attendance/session/${session.id}`)
      .set(nonAdmin)
      .expect(403)
  })
})
