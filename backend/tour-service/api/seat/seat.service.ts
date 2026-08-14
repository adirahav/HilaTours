import { Types } from "mongoose"
import { Seat, SeatDoc } from "../models/seat.model"
import { Bus } from "../models/bus.model"
import { HttpError } from "../lib/http"
import { toClientSeat, isUuid } from "../lib/clientShape"
import { resolveDoc } from "../lib/resolveId"
import { comparePosition } from "../lib/position"

export interface BookingInput {
  seatIds?: string[]
  passengerName?: string
  passengerPhone?: string
  pickupPointName?: string
  notes?: string
}

/** Max seats allowed in a single passenger booking request (see plan Q4). */
export const MAX_SEATS_PER_BOOKING = 4

/**
 * uuid identity layer (plan 028).
 *
 * `:busId` and every client-supplied seat id (`seatIds[]`, `fromSeatId`,
 * `toSeatId`) arrive as public uuids. They are resolved to internal `_id`s
 * here, once, before any query runs.
 *
 * CRITICAL: resolution is a lookup only. Every status write below still uses
 * its original condition-checked `findOneAndUpdate({ _id, status }, ...)`, so
 * the atomicity guarantees are unchanged — the resolution step never replaces
 * a status guard, it only supplies the `_id` to filter on.
 */
interface BusContext {
  busId: Types.ObjectId
  busUuid: string
}

/** Resolves the bus uuid from the route to its internal `_id`. */
export async function resolveBus(busUuid: string): Promise<BusContext> {
  const bus = await resolveDoc(Bus, busUuid, "Bus not found", { deletedAt: null })
  return { busId: bus._id as Types.ObjectId, busUuid: bus.uuid as string }
}

/** A seat addressed by the client: its public uuid plus its internal `_id`. */
interface SeatRef {
  uuid: string
  id: Types.ObjectId
}

/**
 * Resolves a client-supplied `seatIds` array (uuids) to seat refs, preserving
 * request order. Seats are scoped to the bus so a uuid from another bus can
 * never be addressed through this route.
 */
async function resolveSeatRefs(busId: Types.ObjectId, ids: unknown): Promise<SeatRef[]> {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new HttpError(400, "seatIds is required and must be a non-empty array")
  }
  const clean = ids.map(String)
  if (clean.some((id) => !isUuid(id))) {
    throw new HttpError(400, "One or more seatIds are invalid")
  }

  const seats = await Seat.find({ uuid: { $in: clean }, busId }).select("_id uuid").lean()
  const byUuid = new Map(seats.map((s: any) => [s.uuid as string, s._id as Types.ObjectId]))

  return clean.map((uuid) => {
    const id = byUuid.get(uuid)
    if (!id) throw new HttpError(404, "Seat not found")
    return { uuid, id }
  })
}

/** Client-facing shape for a list of seat documents. */
function toClientSeats(seats: any[], busUuid: string) {
  return seats.map((s) => toClientSeat(s, busUuid))
}

/**
 * Passenger booking request: atomic available -> pending, per seat.
 * If ANY requested seat is no longer available, the whole request fails (409)
 * and any seats already flipped in this call are rolled back to available.
 */
export async function requestBookings(busUuid: string, input: BookingInput) {
  const { busId, busUuid: uuid } = await resolveBus(busUuid)
  const seatRefs = await resolveSeatRefs(busId, input.seatIds)
  if (!input.passengerName) {
    throw new HttpError(400, "passengerName is required")
  }
  if (seatRefs.length > MAX_SEATS_PER_BOOKING) {
    throw new HttpError(400, `A single booking may request at most ${MAX_SEATS_PER_BOOKING} seats`)
  }
  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null

  const now = new Date()
  const acquired: SeatDoc[] = []

  for (const ref of seatRefs) {
    const seat = await Seat.findOneAndUpdate(
      { _id: ref.id, busId, status: "available" },
      {
        $set: {
          status: "pending",
          passengerName: input.passengerName,
          passengerPhone: input.passengerPhone || null,
          pickupPointName: input.pickupPointName || null,
          notes,
          requestedAt: now,
          approvedAt: null,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    )

    if (!seat) {
      // Conflict — release everything we grabbed in this request.
      await rollbackToAvailable(acquired)
      throw new HttpError(409, "One or more requested seats are no longer available")
    }
    acquired.push(seat)
  }

  return toClientSeats(acquired, uuid)
}

async function rollbackToAvailable(seats: SeatDoc[]): Promise<void> {
  const now = new Date()
  await Promise.all(
    seats.map((s) =>
      Seat.updateOne(
        { _id: s._id },
        {
          $set: {
            status: "available",
            passengerName: null,
            passengerPhone: null,
            pickupPointName: null,
            notes: null,
            requestedAt: null,
            approvedAt: null,
            updatedAt: now,
          },
        },
      ),
    ),
  )
}

/** Admin approve: pending -> taken (atomic, condition-checked). */
export async function approveSeats(busUuid: string, seatIdsRaw: unknown, adminUuid: string) {
  const { busId, busUuid: uuid } = await resolveBus(busUuid)
  const seatRefs = await resolveSeatRefs(busId, seatIdsRaw)
  const now = new Date()
  const results: SeatDoc[] = []
  for (const ref of seatRefs) {
    const seat = await Seat.findOneAndUpdate(
      { _id: ref.id, busId, status: "pending" },
      { $set: { status: "taken", approvedAt: now, assignedBy: adminUuid, updatedAt: now } },
      { returnDocument: "after" },
    )
    if (!seat) throw new HttpError(400, `Seat ${ref.uuid} is not currently pending`)
    results.push(seat)
  }
  return toClientSeats(results, uuid)
}

/** Admin cancel: pending|taken -> available (atomic, condition-checked). */
export async function cancelSeats(busUuid: string, seatIdsRaw: unknown) {
  const { busId, busUuid: uuid } = await resolveBus(busUuid)
  const seatRefs = await resolveSeatRefs(busId, seatIdsRaw)
  const now = new Date()
  const results: SeatDoc[] = []
  for (const ref of seatRefs) {
    const seat = await Seat.findOneAndUpdate(
      { _id: ref.id, busId, status: { $in: ["pending", "taken"] } },
      {
        $set: {
          status: "available",
          passengerName: null,
          passengerPhone: null,
          pickupPointName: null,
          notes: null,
          requestedAt: null,
          approvedAt: null,
          assignedBy: null,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    )
    if (!seat) throw new HttpError(400, `Seat ${ref.uuid} cannot be cancelled`)
    results.push(seat)
  }
  return toClientSeats(results, uuid)
}

/** Admin toggle-reserve: available <-> reserved (atomic, condition-checked). */
export async function toggleReserve(busUuid: string, seatIdsRaw: unknown, adminUuid: string) {
  const { busId, busUuid: uuid } = await resolveBus(busUuid)
  const seatRefs = await resolveSeatRefs(busId, seatIdsRaw)
  const now = new Date()
  const results: SeatDoc[] = []
  for (const ref of seatRefs) {
    // available -> reserved
    let seat = await Seat.findOneAndUpdate(
      { _id: ref.id, busId, status: "available" },
      { $set: { status: "reserved", assignedBy: adminUuid, updatedAt: now } },
      { returnDocument: "after" },
    )
    if (!seat) {
      // reserved -> available
      seat = await Seat.findOneAndUpdate(
        { _id: ref.id, busId, status: "reserved" },
        { $set: { status: "available", assignedBy: null, updatedAt: now } },
        { returnDocument: "after" },
      )
    }
    if (!seat) throw new HttpError(400, `Seat ${ref.uuid} must be available or reserved to toggle`)
    results.push(seat)
  }
  return toClientSeats(results, uuid)
}

export interface ManualAssignInput {
  seatId?: string
  seatNumbers?: number[]
  passengerName?: string
  passengerPhone?: string
  pickupPointName?: string
  pickupPoint?: string
  notes?: string
  status?: "taken" | "pending"
}

/**
 * Resolves a 1-based seat number to a seat `_id`, mapping the number onto the
 * bus's seats in position order (see api-contract SeatManualAssignRequest /
 * SeatSwapMoveRequest, which both address seats by number rather than id).
 */
async function resolveSeatIdByNumber(
  busId: Types.ObjectId,
  seatNumberRaw: unknown,
): Promise<Types.ObjectId> {
  const seatNumber = Number(seatNumberRaw)
  if (!Number.isInteger(seatNumber) || seatNumber < 1) {
    throw new HttpError(400, "Seat number must be a positive integer")
  }
  // Sort in-app with the same numeric-aware comparator the frontend uses to
  // derive seatNumber — Mongo's `.sort({ position: 1 })` is a string sort and
  // would resolve to the wrong physical seat (e.g. "10" before "2").
  const seats = await Seat.find({ busId }).select("_id position").lean()
  seats.sort((a: any, b: any) => comparePosition(a.position, b.position))
  const target = seats[seatNumber - 1]
  if (!target) throw new HttpError(404, "Seat not found")
  return (target as any)._id as Types.ObjectId
}

/**
 * Resolves the target seat `_id` for a manual-assign request. Accepts either an
 * explicit `seatId` (public uuid) or the frontend `seatNumbers` shape (1-based
 * seat number mapped to the bus's seats in position order).
 */
async function resolveManualAssignSeatId(
  busId: Types.ObjectId,
  input: ManualAssignInput,
): Promise<Types.ObjectId> {
  if (input.seatId) {
    const [ref] = await resolveSeatRefs(busId, [input.seatId])
    return ref.id
  }
  if (Array.isArray(input.seatNumbers) && input.seatNumbers.length > 0) {
    return resolveSeatIdByNumber(busId, input.seatNumbers[0])
  }
  throw new HttpError(400, "A valid seatId or seatNumbers is required")
}

/**
 * Admin manual-assign: available -> taken|pending (atomic, condition-checked).
 * The target status is server-derived from the optional `status` field
 * (defaults to `taken`; only `taken`/`pending` are honored — plan 016 Q6).
 * Returns the bus's fresh seat list so the client can re-sync the seat map.
 */
export async function manualAssign(busUuid: string, input: ManualAssignInput, adminUuid: string) {
  const { busId, busUuid: uuid } = await resolveBus(busUuid)
  const seatId = await resolveManualAssignSeatId(busId, input)
  const pickup = input.pickupPointName ?? input.pickupPoint
  if (!input.passengerName) {
    throw new HttpError(400, "passengerName is required")
  }
  const targetStatus: "taken" | "pending" = input.status === "pending" ? "pending" : "taken"
  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null
  const now = new Date()

  const seat = await Seat.findOneAndUpdate(
    { _id: seatId, busId, status: "available" },
    {
      $set: {
        status: targetStatus,
        passengerName: input.passengerName,
        passengerPhone: input.passengerPhone || null,
        pickupPointName: pickup || null,
        notes,
        requestedAt: targetStatus === "pending" ? now : null,
        approvedAt: targetStatus === "taken" ? now : null,
        assignedBy: adminUuid,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  )
  if (!seat) throw new HttpError(400, "Seat is not available for assignment")

  const seats = await Seat.find({ busId }).lean()
  seats.sort((a: any, b: any) => comparePosition(a.position, b.position))
  return toClientSeats(seats, uuid)
}

export interface UpdateOccupantInput {
  passengerName?: string
  passengerPhone?: string
  pickupPointName?: string
  pickupPoint?: string
  notes?: string
  status?: "taken" | "pending"
}

/**
 * Admin update-occupant: edits the passenger details on a seat that is
 * already `pending` or `taken` — optionally toggling between those two
 * statuses in the same call — without ever touching an `available` seat
 * (that's `manualAssign`'s job, and only its job; see plan 016 Q6 /
 * .doc/architecture.md's "manual-assign skips pending" note).
 *
 * Atomic, condition-checked on the seat currently being pending|taken, same
 * as every other single-seat transition here. Two admins editing the same
 * seat at once is last-write-wins (acceptable — it's an admin-only edit, not
 * a passenger-facing availability race).
 */
export async function updateOccupant(
  busUuid: string,
  seatIdRaw: string,
  input: UpdateOccupantInput,
  adminUuid: string,
) {
  const { busId, busUuid: uuid } = await resolveBus(busUuid)
  const [{ id: seatId }] = await resolveSeatRefs(busId, [seatIdRaw])
  if (!input.passengerName) {
    throw new HttpError(400, "passengerName is required")
  }
  const pickup = input.pickupPointName ?? input.pickupPoint
  const targetStatus: "taken" | "pending" = input.status === "pending" ? "pending" : "taken"
  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null
  const now = new Date()

  const seat = await Seat.findOneAndUpdate(
    { _id: seatId, busId, status: { $in: ["pending", "taken"] } },
    {
      $set: {
        status: targetStatus,
        passengerName: input.passengerName,
        passengerPhone: input.passengerPhone || null,
        pickupPointName: pickup || null,
        notes,
        requestedAt: targetStatus === "pending" ? now : null,
        approvedAt: targetStatus === "taken" ? now : null,
        assignedBy: adminUuid,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  )
  if (!seat) throw new HttpError(400, "Seat must be pending or taken to update its occupant")

  return toClientSeats([seat], uuid)
}

export interface SwapMoveInput {
  /** Contract shape (SeatSwapMoveRequest): 1-based seat numbers. */
  fromSeat?: number
  toSeat?: number
  /** Alternative shape: explicit seat uuids. */
  fromSeatId?: string
  toSeatId?: string
}

/** Snapshot of the passenger-bearing fields of a seat. */
function passengerOf(seat: SeatDoc) {
  return {
    passengerName: seat.passengerName,
    passengerPhone: seat.passengerPhone,
    pickupPointName: seat.pickupPointName,
    notes: seat.notes,
    status: seat.status,
    requestedAt: seat.requestedAt,
    approvedAt: seat.approvedAt,
  }
}

const VACANT = {
  status: "available" as const,
  passengerName: null,
  passengerPhone: null,
  pickupPointName: null,
  notes: null,
  requestedAt: null,
  approvedAt: null,
  assignedBy: null,
}

/**
 * Resolves the two endpoints of a swap-move request. Accepts the contract's
 * `fromSeat`/`toSeat` seat numbers or explicit `fromSeatId`/`toSeatId` uuids.
 */
async function resolveSwapMoveIds(
  busId: Types.ObjectId,
  input: SwapMoveInput,
): Promise<[Types.ObjectId, Types.ObjectId]> {
  const byId = input.fromSeatId !== undefined || input.toSeatId !== undefined
  if (byId) {
    const { fromSeatId, toSeatId } = input
    if (!fromSeatId || !toSeatId || !isUuid(fromSeatId) || !isUuid(toSeatId)) {
      throw new HttpError(400, "Valid fromSeatId and toSeatId are required")
    }
    const [from, to] = await resolveSeatRefs(busId, [fromSeatId, toSeatId])
    return [from.id, to.id]
  }
  if (input.fromSeat === undefined || input.toSeat === undefined) {
    throw new HttpError(400, "fromSeat and toSeat are required")
  }
  return [
    await resolveSeatIdByNumber(busId, input.fromSeat),
    await resolveSeatIdByNumber(busId, input.toSeat),
  ]
}

/**
 * Admin swap-move: move a passenger from fromSeat to toSeat.
 * Re-validates both seats server-side. If toSeat is available -> move
 * (fromSeat becomes available). If toSeat is occupied -> swap the two.
 *
 * Every write is condition-checked on the status observed when the decision
 * was made, so a concurrent booking/cancel on either seat causes this request
 * to fail (and roll back) rather than clobber the newer state.
 */
export async function swapMove(busUuid: string, input: SwapMoveInput, adminUuid: string) {
  const { busId, busUuid: uuid } = await resolveBus(busUuid)
  const [fromSeatId, toSeatId] = await resolveSwapMoveIds(busId, input)
  if (String(fromSeatId) === String(toSeatId)) {
    throw new HttpError(400, "fromSeat and toSeat must differ")
  }

  const now = new Date()
  const from = await Seat.findOne({ _id: fromSeatId, busId })
  const to = await Seat.findOne({ _id: toSeatId, busId })
  if (!from || !to) throw new HttpError(404, "Seat not found")
  if (!["pending", "taken"].includes(from.status)) {
    throw new HttpError(400, "fromSeat has no passenger to move")
  }

  const fromPassenger = passengerOf(from)

  if (to.status === "available") {
    // Move: claim the destination atomically, then vacate the source —
    // also condition-checked, in case the source changed underneath us.
    const moved = await Seat.findOneAndUpdate(
      { _id: toSeatId, busId, status: "available" },
      { $set: { ...fromPassenger, assignedBy: adminUuid, updatedAt: now } },
      { returnDocument: "after" },
    )
    if (!moved) throw new HttpError(409, "Destination seat is no longer available")

    const vacated = await Seat.findOneAndUpdate(
      { _id: fromSeatId, busId, status: from.status },
      { $set: { ...VACANT, updatedAt: now } },
      { returnDocument: "after" },
    )
    if (!vacated) {
      // Source changed under us — undo the destination claim.
      await Seat.updateOne({ _id: toSeatId, busId }, { $set: { ...VACANT, updatedAt: now } })
      throw new HttpError(409, "Source seat changed during the move")
    }
    return toClientSeats([vacated, moved], uuid)
  }

  if (["pending", "taken"].includes(to.status)) {
    // Swap two occupied seats — each write asserts the status we read.
    const toPassenger = passengerOf(to)

    const newFrom = await Seat.findOneAndUpdate(
      { _id: fromSeatId, busId, status: from.status },
      { $set: { ...toPassenger, assignedBy: adminUuid, updatedAt: now } },
      { returnDocument: "after" },
    )
    if (!newFrom) throw new HttpError(409, "Source seat changed during the swap")

    const newTo = await Seat.findOneAndUpdate(
      { _id: toSeatId, busId, status: to.status },
      { $set: { ...fromPassenger, assignedBy: adminUuid, updatedAt: now } },
      { returnDocument: "after" },
    )
    if (!newTo) {
      // Restore the source seat, then report the conflict.
      await Seat.updateOne(
        { _id: fromSeatId, busId },
        { $set: { ...fromPassenger, assignedBy: from.assignedBy, updatedAt: now } },
      )
      throw new HttpError(409, "Destination seat changed during the swap")
    }
    return toClientSeats([newFrom, newTo], uuid)
  }

  throw new HttpError(400, "Destination seat must be available or occupied to swap/move")
}
