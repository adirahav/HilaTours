import { Types } from "mongoose"
import { Tour } from "../models/tour.model"
import { Bus } from "../models/bus.model"
import { Seat } from "../models/seat.model"
import { AttendanceSession } from "../models/attendanceSession.model"
import { AttendanceRecord } from "../models/attendanceRecord.model"
import { HttpError } from "../lib/http"
import { toClientAttendanceRecord, toClientAttendanceSession, isUuid } from "../lib/clientShape"
import { resolveDoc } from "../lib/resolveId"

/**
 * Attendance sessions (PRD F12 / AC-12..14, plan 038).
 *
 * A session is a point-in-time snapshot of everyone booked on one bus, plus a
 * present/missing flag per passenger. Sessions are NOT date-gated server-side:
 * the "only on the tour's own day" rule is a UI tab-visibility convenience
 * (plan 038 Open Question 2), so every route here enforces permissions only.
 *
 * Every mutation returns the FULL updated session, so both the HTTP caller and
 * the `attendance:update` socket broadcast carry one self-contained payload the
 * client can swap in wholesale rather than patching record-by-record.
 */

/** Seat statuses that represent a real, booked passenger worth checking in. */
const SNAPSHOTTED_SEAT_STATUSES = ["taken", "reserved"] as const

/**
 * The session plus the context a caller needs to broadcast it. `busUuid` is
 * returned alongside because the socket room is keyed by bus, not by session.
 */
export interface SessionResult {
  session: ReturnType<typeof toClientAttendanceSession>
  busUuid: string
}

/**
 * The party/family grouping key, copied onto each record at snapshot time.
 *
 * Mirrors the prototype's fallback chain exactly: an explicit booking-group id
 * wins, else the phone number (digits only, ignoring formatting), else the name.
 * `Seat` has no booking-group field today, so in practice this resolves to
 * phone-then-name — the first tier is kept so no rework is needed if real
 * booking-group linkage is added to `Seat` later.
 *
 * Stored rather than derived on read so a session's grouping is as stable as the
 * rest of its snapshot: an admin editing the seat's phone afterwards must not
 * silently re-shuffle an in-progress check-in into different party cards.
 */
export function deriveBookingGroupId(seat: Record<string, any>): string | null {
  const explicit = typeof seat.bookingGroupId === "string" ? seat.bookingGroupId.trim() : ""
  if (explicit) return explicit

  const phoneDigits = String(seat.passengerPhone ?? "").replace(/\D/g, "")
  // Same >= 6 digit floor the prototype uses: shorter fragments are too
  // ambiguous to safely merge two unrelated passengers into one party card.
  if (phoneDigits.length >= 6) return `phone-${phoneDigits}`

  const name = String(seat.passengerName ?? "").trim()
  return name ? `name-${name}` : null
}

/** Loads a session's records and shapes the whole session for a client. */
async function buildSessionResult(
  session: Record<string, any>,
  tourUuid?: string,
  busUuid?: string,
): Promise<SessionResult> {
  const [tour, bus] = await Promise.all([
    tourUuid ? null : Tour.findById(session.tourId).select("uuid").lean(),
    busUuid ? null : Bus.findById(session.busId).select("uuid").lean(),
  ])

  const resolvedTourUuid = tourUuid ?? ((tour as any)?.uuid ?? "")
  const resolvedBusUuid = busUuid ?? ((bus as any)?.uuid ?? "")

  const records = await AttendanceRecord.find({ sessionId: session._id }).lean()
  // Seat positions are numeric strings, so sort numerically — a plain Mongo
  // string sort would order seat "10" before seat "2" on the guide's board.
  records.sort(
    (a: any, b: any) =>
      Number(a.seatPosition) - Number(b.seatPosition) ||
      String(a.seatPosition).localeCompare(String(b.seatPosition)),
  )

  // One lookup for every referenced seat, so `seatId` can be serialized as the
  // seat's public uuid instead of the internal ObjectId ref (plan 028).
  const seatIds = records.map((r: any) => r.seatId).filter(Boolean)
  const seats = seatIds.length
    ? await Seat.find({ _id: { $in: seatIds }, deletedAt: { $exists: true } })
        .select("_id uuid")
        .lean()
    : []
  const seatUuidById = new Map(seats.map((s: any) => [String(s._id), s.uuid as string]))

  return {
    busUuid: resolvedBusUuid,
    session: toClientAttendanceSession(
      session,
      resolvedTourUuid,
      resolvedBusUuid,
      records.map((r: any) =>
        toClientAttendanceRecord(r, session.uuid, seatUuidById.get(String(r.seatId))),
      ),
    ),
  }
}

async function resolveSessionDoc(sessionUuid: unknown) {
  return resolveDoc(AttendanceSession, sessionUuid, "Session not found")
}

/** Resolves the tour+bus pair a session belongs to, rejecting a mismatched pair. */
async function resolveTourAndBus(tourUuid: unknown, busUuid: unknown) {
  const tour = await resolveDoc(Tour, tourUuid, "Tour not found", { deletedAt: null })
  // Scoped to the tour: a bus uuid from a *different* tour must 404 rather than
  // silently produce a session hanging off an unrelated tour.
  const bus = await resolveDoc(Bus, busUuid, "Bus not found", {
    deletedAt: null,
    tourId: tour._id,
  })
  return { tour, bus }
}

export async function listSessions(tourUuid: unknown, busUuid: unknown) {
  const { tour, bus } = await resolveTourAndBus(tourUuid, busUuid)

  const sessions = await AttendanceSession.find({ tourId: tour._id, busId: bus._id })
    .sort({ createdAt: -1 })
    .lean()

  const results = await Promise.all(
    sessions.map((s: any) => buildSessionResult(s, tour.uuid as string, bus.uuid as string)),
  )
  return results.map((r) => r.session)
}

export async function getSession(sessionUuid: unknown): Promise<SessionResult> {
  const session = await resolveSessionDoc(sessionUuid)
  return buildSessionResult(session)
}

/**
 * Creates a session and snapshots the bus's booked passengers into records.
 *
 * Only `taken`/`reserved` seats carrying a `passengerName` are captured:
 * `available` seats have nobody to check in, and a `pending` seat is an
 * unapproved request — the passenger is not yet on the bus, so counting them as
 * "missing" on the guide's board would be wrong.
 *
 * A session with zero records is allowed (nothing booked yet); the UI shows its
 * own empty state rather than the server rejecting the create.
 */
export async function createSession(
  input: { tourId?: unknown; busId?: unknown; title?: unknown },
  adminUuid: string | null,
): Promise<SessionResult> {
  const title = typeof input.title === "string" ? input.title.trim() : ""
  if (!title) throw new HttpError(400, "title is required")

  const { tour, bus } = await resolveTourAndBus(input.tourId, input.busId)

  const session = await AttendanceSession.create({
    tourId: tour._id,
    busId: bus._id,
    title,
    createdBy: adminUuid ?? null,
  })

  const seats = await Seat.find({
    busId: bus._id,
    status: { $in: SNAPSHOTTED_SEAT_STATUSES },
    passengerName: { $nin: [null, ""] },
    deletedAt: null,
  }).lean()

  if (seats.length) {
    await AttendanceRecord.insertMany(
      seats.map((seat: any) => ({
        sessionId: session._id as Types.ObjectId,
        seatId: seat._id as Types.ObjectId,
        seatPosition: seat.position,
        passengerName: seat.passengerName,
        passengerPhone: seat.passengerPhone ?? null,
        pickupPointName: seat.pickupPointName ?? null,
        notes: seat.notes ?? null,
        bookingGroupId: deriveBookingGroupId(seat),
        isPresent: false,
        checkedInAt: null,
      })),
    )
  }

  return buildSessionResult(session.toObject(), tour.uuid as string, bus.uuid as string)
}

/**
 * Clears every presence mark, keeping the session and its passenger snapshot
 * intact — "start the check over", not a delete.
 */
export async function resetSession(sessionUuid: unknown): Promise<SessionResult> {
  const session = await resolveSessionDoc(sessionUuid)
  await AttendanceRecord.updateMany(
    { sessionId: session._id },
    { $set: { isPresent: false, checkedInAt: null } },
  )
  return buildSessionResult(session)
}

/**
 * Hard-deletes the session and its records. Deliberately not a soft-delete (see
 * the model comment): these are disposable working documents. Records only ever
 * point AT seats, never the reverse, so no `Seat` is orphaned by this.
 *
 * Returns the bus uuid so the caller can still broadcast the deletion to the
 * right room after the session document is gone.
 */
export async function deleteSession(sessionUuid: unknown): Promise<{
  busUuid: string
  deletedSessionId: string
}> {
  const session = await resolveSessionDoc(sessionUuid)
  const bus = await Bus.findById(session.busId).select("uuid").lean()

  await AttendanceRecord.deleteMany({ sessionId: session._id })
  await AttendanceSession.deleteOne({ _id: session._id })

  return { busUuid: ((bus as any)?.uuid as string) ?? "", deletedSessionId: session.uuid as string }
}

/**
 * THE presence mutation — the single code path behind all three UI gestures
 * (individual toggle, whole-party toggle, per-station batch check/uncheck).
 * They differ only in the `recordIds` list the caller resolved; there is no
 * separate per-station DB method to drift out of sync with this one.
 *
 * The update filter is scoped to `sessionId`, so ids belonging to another
 * session can never be flipped through this session's endpoint even if the
 * caller sends them — the mismatch is then reported as a 400 below.
 */
export async function setRecordsPresence(
  sessionUuid: unknown,
  recordIdsRaw: unknown,
  isPresentRaw: unknown,
): Promise<SessionResult> {
  const session = await resolveSessionDoc(sessionUuid)

  if (typeof isPresentRaw !== "boolean") {
    throw new HttpError(400, "isPresent must be a boolean")
  }
  if (!Array.isArray(recordIdsRaw) || recordIdsRaw.length === 0) {
    throw new HttpError(400, "recordIds must be a non-empty array of record ids")
  }
  const recordIds = recordIdsRaw.map(String)
  if (recordIds.some((id) => !isUuid(id))) {
    throw new HttpError(400, "recordIds must be a non-empty array of record ids")
  }

  const matched = await AttendanceRecord.find({
    uuid: { $in: recordIds },
    sessionId: session._id,
  })
    .select("_id")
    .lean()

  // Every id must resolve *within this session* — a partial match means the
  // caller's view is stale or the ids are from another session, and silently
  // applying the subset would leave the UI showing a half-applied party toggle.
  if (matched.length !== new Set(recordIds).size) {
    throw new HttpError(400, "One or more recordIds do not belong to this session")
  }

  // Last-write-wins, not a merge: two guides tapping the same party card
  // near-simultaneously both succeed and converge on the later write. Safe here
  // because this is an idempotent boolean set, never an increment.
  await AttendanceRecord.updateMany(
    { uuid: { $in: recordIds }, sessionId: session._id },
    { $set: { isPresent: isPresentRaw, checkedInAt: isPresentRaw ? new Date() : null } },
  )

  return buildSessionResult(session)
}
