import { Bus } from "../models/bus.model"
import { Seat, SeatStatus } from "../models/seat.model"
import { Tour } from "../models/tour.model"
import { resolveDoc, resolveObjectId } from "../lib/resolveId"
import { comparePosition } from "../lib/position"

export interface ManifestEntry {
  pickupPointName: string
  passengers: {
    /** Public uuid of the seat this row was built from — never Mongo `_id`. */
    id: string
    seatPosition: string
    passengerName: string | null
    passengerPhone: string | null
    status: SeatStatus
  }[]
}

export interface ManifestFilters {
  pickupPointName?: string
  status?: SeatStatus
}

/**
 * Builds the manifest for a bus, grouped by pickup point.
 * Only seats with an assigned passenger (pending/taken) are included,
 * unless a specific status filter is supplied.
 */
export async function getManifest(
  tourUuid: string,
  busUuid: string,
  filters: ManifestFilters,
): Promise<ManifestEntry[]> {
  // `:tourId`/`:busId` are public uuids (plan 028) — resolve before querying.
  const tourId = await resolveObjectId(Tour, tourUuid, "Bus not found", { deletedAt: null })
  const bus = await resolveDoc(Bus, busUuid, "Bus not found", { tourId, deletedAt: null })

  const query: Record<string, unknown> = { busId: bus._id }
  if (filters.status) {
    query.status = filters.status
  } else {
    query.status = { $in: ["pending", "taken"] }
  }
  if (filters.pickupPointName) {
    query.pickupPointName = filters.pickupPointName
  }

  const seats = await Seat.find(query).lean()
  seats.sort((a: any, b: any) => comparePosition(a.position, b.position))

  const groups = new Map<string, ManifestEntry>()
  for (const seat of seats as any[]) {
    const key = seat.pickupPointName || "Unassigned"
    if (!groups.has(key)) groups.set(key, { pickupPointName: key, passengers: [] })
    // Rows are read with `.lean()` (Mongoose transforms don't run), so the
    // uuid → id projection is applied explicitly here.
    groups.get(key)!.passengers.push({
      id: seat.uuid,
      seatPosition: seat.position,
      passengerName: seat.passengerName,
      passengerPhone: seat.passengerPhone,
      status: seat.status,
    })
  }

  // Order groups by the bus's declared pickup-point order when available.
  const order = new Map<string, number>()
  ;(bus.pickupPoints || []).forEach((p: any, i: number) =>
    order.set(p.name, typeof p.order === "number" ? p.order : i),
  )

  return Array.from(groups.values()).sort(
    (a, b) =>
      (order.get(a.pickupPointName) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.pickupPointName) ?? Number.MAX_SAFE_INTEGER),
  )
}
