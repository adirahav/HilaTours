import { Types } from "mongoose"
import { Bus, PickupPoint } from "../models/bus.model"
import { Tour } from "../models/tour.model"
import { Seat } from "../models/seat.model"
import { HttpError } from "../lib/http"
import { toClientBus, toClientSeat, toPublicSeat } from "../lib/clientShape"
import { resolveDoc, resolveObjectId } from "../lib/resolveId"
import { comparePosition } from "../lib/position"

export interface BusInput {
  name?: string
  seatLayout?: Record<string, unknown>
  pickupPoints?: PickupPoint[]
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
  return buses.map((bus: any) => toClientBus(bus, tourUuid))
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
      return {
        ...toClientBus(bus, tourUuid),
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
    ...toClientBus(bus, tourUuid),
    seats: seats.map((s: any) => toClientSeat(s, bus.uuid)),
  }
}

async function insertBus(
  tourId: Types.ObjectId,
  name: string,
  seatLayout: Record<string, unknown>,
  pickupPoints: PickupPoint[],
  isDefault: boolean,
) {
  const positions = seatPositionsFromLayout(seatLayout)
  if (positions.length === 0) {
    throw new HttpError(400, "seatLayout produced no seats")
  }

  const bus = await Bus.create({ tourId, name, seatLayout, pickupPoints, isDefault })

  // Seats reference the bus by internal `_id` — refs stay internal, only the
  // client-facing projection changes. Each seat gets its own uuid by default.
  await Seat.insertMany(
    positions.map((position) => ({ busId: bus._id, position, status: "available" })),
  )

  return bus
}

export async function createBus(tourUuid: string, input: BusInput) {
  const tourId = await resolveTourId(tourUuid)
  if (!input.name || !input.seatLayout) {
    throw new HttpError(400, "name and seatLayout are required")
  }
  // isDefault is never accepted from client input (see BusInput) — only
  // createDefaultBus below can set it.
  const bus = await insertBus(tourId, input.name, input.seatLayout, input.pickupPoints ?? [], false)
  return toClientBus(bus.toObject(), tourUuid)
}

const DEFAULT_BUS_SEAT_COUNT = 50

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

export async function updateBus(tourUuid: string, busUuid: string, input: BusInput) {
  const existing = await resolveBusDoc(tourUuid, busUuid)

  const update: Record<string, unknown> = {}
  if (input.name !== undefined) update.name = input.name
  if (input.pickupPoints !== undefined) update.pickupPoints = input.pickupPoints
  // seatLayout intentionally not remapped here to avoid destroying seat state.

  const bus = await Bus.findOneAndUpdate(
    { _id: existing._id, deletedAt: null },
    { $set: update },
    { returnDocument: "after" },
  ).lean()
  if (!bus) throw new HttpError(404, "Bus not found")
  return toClientBus(bus, tourUuid)
}

export async function softDeleteBus(tourUuid: string, busUuid: string) {
  const message = "Bus not found or already deleted"
  const existing = await resolveBusDoc(tourUuid, busUuid, message)

  if (existing.isDefault) {
    throw new HttpError(400, "The tour's default bus cannot be deleted")
  }

  const bus = await Bus.findOneAndUpdate(
    { _id: existing._id, deletedAt: null },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  ).lean()
  if (!bus) throw new HttpError(404, message)
  await Seat.deleteMany({ busId: existing._id })
  return toClientBus(bus, tourUuid)
}
