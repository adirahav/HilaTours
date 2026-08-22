import { Types } from "mongoose"
import { Bus, PickupPoint } from "../models/bus.model"
import { Tour } from "../models/tour.model"
import { Seat } from "../models/seat.model"
import { HttpError } from "../lib/http"
import { toClientBus, toClientSeat, toPublicSeat } from "../lib/clientShape"
import { resolveDoc, resolveObjectId } from "../lib/resolveId"
import { comparePosition } from "../lib/position"
import {
  busTypeGridForBus,
  resolveBusTypeObjectId,
  seatLayoutForBusTypeUuid,
} from "../busType/busType.service"

export interface BusInput {
  name?: string
  seatLayout?: Record<string, unknown>
  pickupPoints?: PickupPoint[]
  /**
   * Public uuid of a BusType template to build this bus's seatLayout from
   * (PRD F11). Mutually exclusive with `seatLayout` on create — see createBus.
   *
   * On update (plan 035) it is NOT ignored: sending `busTypeId` re-generates
   * the bus's seatLayout from the template and reseeds its seats *by
   * position* — seats whose position exists in both the old and new layout
   * keep their occupant and full state untouched, positions new to the layout
   * are created `available`, and positions that no longer exist are
   * hard-deleted (losing their occupant, if any — the only, intentional data
   * loss). On update `busTypeId` takes precedence over `seatLayout`, which is
   * then silently ignored.
   */
  busTypeId?: string | null
}

/**
 * Derives the list of seat positions from a seatLayout definition.
 * Supported shapes:
 *  - { positions: string[] } | { seats: string[] } — explicit list
 *  - { rows: number, columns: number|string[] }   — grid; columns default A,B,C...
 */
export function seatPositionsFromLayout(seatLayout: Record<string, unknown>): string[] {
  if (!seatLayout || typeof seatLayout !== "object") {
    throw new HttpError(400, "seatLayout is required")
  }
  const explicit = (seatLayout.positions || seatLayout.seats) as unknown
  if (Array.isArray(explicit)) {
    return explicit.map((p) => String(p))
  }

  const rows = Number(seatLayout.rows)
  if (Number.isInteger(rows) && rows > 0) {
    let columns: string[]
    if (Array.isArray(seatLayout.columns)) {
      columns = (seatLayout.columns as unknown[]).map((c) => String(c))
    } else {
      const colCount = Number(seatLayout.columns)
      if (!Number.isInteger(colCount) || colCount <= 0) {
        throw new HttpError(400, "Invalid seatLayout: columns must be a positive integer or list")
      }
      columns = Array.from({ length: colCount }, (_, i) => String.fromCharCode(65 + i))
    }
    const positions: string[] = []
    for (let r = 1; r <= rows; r++) {
      for (const c of columns) positions.push(`${r}${c}`)
    }
    return positions
  }

  throw new HttpError(400, "Invalid seatLayout: expected { positions:[] } or { rows, columns }")
}

/**
 * `:tourId`/`:busId` are public uuids (plan 028). These two helpers are the
 * only place uuid → `_id` translation happens for bus routes; nothing below
 * ever accepts or returns a Mongo `_id`.
 */
export async function resolveTourId(tourUuid: string, message = "Tour not found") {
  return resolveObjectId(Tour, tourUuid, message, { deletedAt: null })
}

async function resolveBusDoc(tourUuid: string, busUuid: string, message = "Bus not found") {
  const tourId = await resolveTourId(tourUuid, message)
  return resolveDoc(Bus, busUuid, message, { tourId, deletedAt: null })
}

export async function listBuses(tourUuid: string) {
  // Resolve the tour regardless of its soft-delete state (`deletedAt` present
  // in the filter opts out of the model's auto `deletedAt: null` scope): a
  // soft-deleted tour's buses are all soft-deleted too, so this still returns
  // an empty list rather than a 404 — preserving the documented list
  // semantics for GET /tour/{tourId}/buses.
  const tourId = await resolveObjectId(Tour, tourUuid, "Tour not found", {
    deletedAt: { $exists: true },
  })
  const buses = await Bus.find({ tourId, deletedAt: null }).lean()
  return Promise.all(
    buses.map(async (bus: any) =>
      toClientBus(bus, tourUuid, await busTypeGridForBus(bus.busTypeId)),
    ),
  )
}

/**
 * PII-safe seat projection for UNAUTHENTICATED responses (see SEV-001 and the
 * PublicSeat schema in the API contract). Only identity/position/status are
 * exposed — never passengerName, passengerPhone, notes, pickupPointName,
 * requestedAt, approvedAt or assignedBy. `uuid` (projected as `id`) replaces
 * `_id` here — the internal key is never part of a public projection.
 */
export const PUBLIC_SEAT_FIELDS = "uuid position status" as const

export { toPublicSeat }

/**
 * Buses of a tour, each with its seats in the PII-safe projection.
 * Takes the tour's internal `_id` (for the query) plus its uuid (for the
 * response), since callers have already resolved the tour.
 *
 * NOTE: this fans out one Seat query per bus (N+1). Acceptable at current
 * scale (dozens of tours, single-digit buses each); revisit with an
 * aggregation/$lookup if tour or bus counts grow substantially.
 */
export async function listBusesWithPublicSeats(tourId: Types.ObjectId, tourUuid: string) {
  const buses = await Bus.find({ tourId, deletedAt: null }).lean()
  return Promise.all(
    buses.map(async (bus: any) => {
      const seats = await Seat.find({ busId: bus._id }).select(PUBLIC_SEAT_FIELDS).lean()
      seats.sort((a: any, b: any) => comparePosition(a.position, b.position))
      // The grid is structural (row/col only) — adding it here does NOT widen
      // PUBLIC_SEAT_FIELDS and carries no passenger data (SEV-001).
      return {
        ...toClientBus(bus, tourUuid, await busTypeGridForBus(bus.busTypeId)),
        totalSeats: seats.length,
        seats: seats.map(toPublicSeat),
      }
    }),
  )
}

export async function getBusWithSeats(tourUuid: string, busUuid: string) {
  const bus = await resolveBusDoc(tourUuid, busUuid)
  const seats = await Seat.find({ busId: bus._id }).lean()
  seats.sort((a: any, b: any) => comparePosition(a.position, b.position))
  return {
    ...toClientBus(bus, tourUuid, await busTypeGridForBus(bus.busTypeId as any)),
    seats: seats.map((s: any) => toClientSeat(s, bus.uuid)),
  }
}

async function insertBus(
  tourId: Types.ObjectId,
  name: string,
  seatLayout: Record<string, unknown>,
  pickupPoints: PickupPoint[],
  isDefault: boolean,
  busTypeId: Types.ObjectId | null = null,
) {
  const positions = seatPositionsFromLayout(seatLayout)
  if (positions.length === 0) {
    throw new HttpError(400, "seatLayout produced no seats")
  }

  // `busTypeId` is written explicitly (as `null` for a manual bus) rather than
  // omitted, so "built from no template" is never ambiguous with "field absent".
  const bus = await Bus.create({
    tourId,
    name,
    seatLayout,
    busTypeId,
    pickupPoints,
    isDefault,
  })

  // Seats reference the bus by internal `_id` — refs stay internal, only the
  // client-facing projection changes. Each seat gets its own uuid by default.
  await Seat.insertMany(
    positions.map((position) => ({ busId: bus._id, position, status: "available" })),
  )

  return bus
}

export async function createBus(tourUuid: string, input: BusInput) {
  const tourId = await resolveTourId(tourUuid)
  if (!input.name) {
    throw new HttpError(400, "name is required")
  }

  // `seatLayout` and `busTypeId` are mutually exclusive (PRD F11): supplying
  // both is a 400, not a "busTypeId wins" merge, so a caller can never be
  // unsure which layout was actually used.
  const hasSeatLayout = input.seatLayout !== undefined && input.seatLayout !== null
  const hasBusTypeId = input.busTypeId !== undefined && input.busTypeId !== null
  if (hasSeatLayout && hasBusTypeId) {
    throw new HttpError(400, "Supply either seatLayout or busTypeId, not both")
  }
  if (!hasSeatLayout && !hasBusTypeId) {
    throw new HttpError(400, "name and either seatLayout or busTypeId are required")
  }

  // Building from a template also persists a LIVE reference to it (plan 037):
  // `seatLayout` still holds the flat position list the seats are seeded from,
  // but the rendered grid — row/col, gaps included — is re-derived from the
  // current BusType on every read. Editing the template therefore does change
  // this bus's seat map afterwards; that is the intended, admin-warned
  // behaviour, and it is what keeps mid-row gaps from being lost.
  const busTypeId = hasBusTypeId ? await resolveBusTypeObjectId(input.busTypeId) : null
  const seatLayout = hasBusTypeId
    ? await seatLayoutForBusTypeUuid(input.busTypeId)
    : (input.seatLayout as Record<string, unknown>)

  // isDefault is never accepted from client input (see BusInput) — only
  // createDefaultBus below can set it.
  const bus = await insertBus(
    tourId,
    input.name,
    seatLayout,
    input.pickupPoints ?? [],
    false,
    busTypeId,
  )
  return toClientBus(bus.toObject(), tourUuid, await busTypeGridForBus(busTypeId))
}

const DEFAULT_BUS_SEAT_COUNT = 55

/**
 * Auto-created alongside every new tour (see tour.service.createTour) so a
 * tour is never left with zero buses. Deletion-protected — see
 * softDeleteBus below. Not reachable via any client-facing route/input.
 */
export async function createDefaultBus(tourId: Types.ObjectId) {
  const seatLayout = {
    positions: Array.from({ length: DEFAULT_BUS_SEAT_COUNT }, (_, i) => String(i + 1)),
  }
  return insertBus(tourId, "אוטובוס 1", seatLayout, [], true)
}

/**
 * Reconciles a bus's actual seat documents to a new seatLayout, by diffing
 * position sets — additions get new `available` seats, removals delete
 * theirs. In practice the frontend always sends a plain "1".."N" list, so
 * this only ever grows/shrinks the tail, but the diff is general (works for
 * any position set, not just a size change).
 *
 * Never destroys occupied state: if any seat slated for removal is not
 * `available`, the whole resize is rejected (400) rather than silently
 * losing a booking — mirrors the frontend's own "can't shrink below the
 * highest occupied seat" guard, enforced here since the client can't be
 * trusted alone.
 */
async function resizeSeats(busId: Types.ObjectId, seatLayout: Record<string, unknown>): Promise<void> {
  const targetPositions = seatPositionsFromLayout(seatLayout)
  if (targetPositions.length === 0) {
    throw new HttpError(400, "seatLayout produced no seats")
  }
  const targetSet = new Set(targetPositions)

  const existingSeats = await Seat.find({ busId }).select("position status").lean()
  const existingSet = new Set(existingSeats.map((s: any) => s.position as string))

  const toRemove = existingSeats.filter((s: any) => !targetSet.has(s.position))
  const toAdd = targetPositions.filter((p) => !existingSet.has(p))

  if (toRemove.length > 0) {
    if (toRemove.some((s: any) => s.status !== "available")) {
      throw new HttpError(400, "Cannot shrink the bus below an occupied or reserved seat")
    }
    await Seat.deleteMany({ busId, position: { $in: toRemove.map((s: any) => s.position) } })
  }

  if (toAdd.length > 0) {
    await Seat.insertMany(toAdd.map((position) => ({ busId, position, status: "available" })))
  }
}

/**
 * Reseeds a bus's seats to a new seatLayout generated from a BusType template
 * (plan 035), matching old and new seats *by position*:
 *  - a position present in both layouts keeps its existing Seat document
 *    untouched — status, passenger name/phone, pickup point, notes and all
 *    timestamps survive the bus-type change;
 *  - a position new to the layout gets a fresh `available` Seat;
 *  - a position that no longer exists is hard-deleted, together with whatever
 *    occupied it. That is the only data loss here, and it is intentional and
 *    product-approved: there is nowhere in the new layout to put that
 *    passenger. The admin UI gates this behind an explicit confirmation, so
 *    unlike resizeSeats this path never rejects on occupied seats.
 *
 * Deliberately unlike softDeleteBus's soft-delete: a position that is gone
 * from the layout no longer exists at all, so there is no state to preserve
 * (same reasoning as resizeSeats' hard delete).
 */
async function reseedSeatsByPosition(
  busId: Types.ObjectId,
  seatLayout: Record<string, unknown>,
): Promise<void> {
  const newPositions = seatPositionsFromLayout(seatLayout)
  if (newPositions.length === 0) {
    throw new HttpError(400, "seatLayout produced no seats")
  }
  const newSet = new Set(newPositions)

  const existingSeats = await Seat.find({ busId }).select("position").lean()
  const existingSet = new Set(existingSeats.map((s: any) => s.position as string))

  // Delete first, insert second: the busId+position unique index would reject
  // an insert that collides with a stale seat if the order were reversed.
  const toRemove = existingSeats
    .filter((s: any) => !newSet.has(s.position as string))
    .map((s: any) => s.position as string)
  if (toRemove.length > 0) {
    await Seat.deleteMany({ busId, position: { $in: toRemove } })
  }

  // Exact string matching only — a fuzzy comparison here would silently drop
  // an occupied seat that the new layout does still contain.
  const toAdd = newPositions.filter((p) => !existingSet.has(p))
  if (toAdd.length > 0) {
    await Seat.insertMany(toAdd.map((position) => ({ busId, position, status: "available" })))
  }
}

export async function updateBus(tourUuid: string, busUuid: string, input: BusInput) {
  const existing = await resolveBusDoc(tourUuid, busUuid)

  const update: Record<string, unknown> = {}
  if (input.name !== undefined) update.name = input.name
  if (input.pickupPoints !== undefined) update.pickupPoints = input.pickupPoints

  // `busTypeId` wins over a raw `seatLayout` sent in the same body (unlike
  // createBus, which 400s on both): the frontend always sends busTypeId on
  // update, so precedence keeps that the single source of truth.
  const hasBusTypeId = input.busTypeId !== undefined && input.busTypeId !== null
  if (hasBusTypeId) {
    // Resolve the template first — an unknown/soft-deleted busTypeId must 404
    // before any seat is touched.
    const seatLayout = await seatLayoutForBusTypeUuid(input.busTypeId)
    update.seatLayout = seatLayout
    // Re-point the live reference too, so the render join follows the bus to
    // its new template rather than staying on the previous one.
    update.busTypeId = await resolveBusTypeObjectId(input.busTypeId)
    await reseedSeatsByPosition(existing._id as Types.ObjectId, seatLayout)
  } else if (input.seatLayout !== undefined) {
    update.seatLayout = input.seatLayout
    // A raw seatLayout replaces the template outright, so the live reference
    // must be cleared — leaving it would let the old template's grid keep
    // overriding the layout the admin just hand-configured.
    update.busTypeId = null
    await resizeSeats(existing._id as Types.ObjectId, input.seatLayout)
  }

  const bus = await Bus.findOneAndUpdate(
    { _id: existing._id, deletedAt: null },
    { $set: update },
    { returnDocument: "after" },
  ).lean()
  if (!bus) throw new HttpError(404, "Bus not found")
  return toClientBus(bus, tourUuid, await busTypeGridForBus((bus as any).busTypeId))
}

export async function softDeleteBus(tourUuid: string, busUuid: string) {
  const message = "Bus not found or already deleted"
  const existing = await resolveBusDoc(tourUuid, busUuid, message)

  if (existing.isDefault) {
    throw new HttpError(400, "The tour's default bus cannot be deleted")
  }

  const now = new Date()
  const bus = await Bus.findOneAndUpdate(
    { _id: existing._id, deletedAt: null },
    { $set: { deletedAt: now } },
    { returnDocument: "after" },
  ).lean()
  if (!bus) throw new HttpError(404, message)
  await Seat.updateMany({ busId: existing._id, deletedAt: null }, { $set: { deletedAt: now } })
  return toClientBus(bus, tourUuid)
}
