import type { Tour } from '../types/tour.types'
import type { Bus, BusGrid, DriverSide, DoorPosition } from '../types/bus.types'
import type { Seat, SeatStatus } from '../types/seat.types'
import { generateBusSeats } from './busLayoutHelper'

// Maps the raw tour-service response shape (`id`, string `position`,
// `status`) onto the frontend domain types (`id`, `seatNumber`/`row`/`col`,
// `seatStatus`) that BusMap and PassengerViewPage already expect.
//
// IDENTITY: as of the uuid identity layer, every entity's public identity is
// `id` — a server-generated uuid. Mongo's `_id` is internal to the backend and
// is stripped from every response (including embedded buses/seats) by the
// models' toJSON transform, the same way `Admin.passwordHash` already is.
// The `raw._id` fallbacks below are deliberately retained as defensive
// backward-compat for a partially-migrated backend, but `id` now takes
// precedence: if a response ever carried both, the uuid must win, never the
// ObjectId. See plan 028 Open Question 4 — removing the fallback entirely is
// a follow-up cleanup.
//
// GET /tour and GET /tour/:tourId are PUBLIC, unauthenticated routes. Their
// embedded seats carry only the PII-safe projection (id, position, status) —
// mirroring the SEV-001 decision that locked the admin single-bus route behind
// requireAdmin precisely because it returns passengerName/passengerPhone/notes.
// This mapper deliberately copies ONLY the public fields, so even if the
// backend ever over-returns, no passenger PII reaches the store or the UI.

export interface RawSeat {
  /** Public uuid identity. */
  id?: string
  /** @deprecated Legacy Mongo id — no longer emitted by the backend. */
  _id?: string
  position?: string
  status?: string
  seatStatus?: string
  // Optional: if the backend ever emits an explicit seat number, it wins over
  // the position-order derivation below.
  seatNumber?: number
  // Grid coordinates resolved SERVER-side from the bus's live BusType (see
  // `RawBus.busTypeGrid`). Present only for template-derived buses. When both
  // are present they win over the generic `generateBusSeats` derivation —
  // that generic layout knows nothing about the template's disabled slots, so
  // it silently packs gaps out of existence (the bug this fixes).
  //
  // Structural only (a coordinate pair), so copying these onto the public
  // seat shape does not widen the PII surface — see SEV-001 note above.
  row?: number
  col?: number
  // PII fields — only ever present on the authenticated single-bus response
  // (GET /tour/:tourId/buses/:busId, toClientSeat). Never present on the
  // public GET /tour(/:tourId) response (toPublicSeat). `mapSeats` below
  // never reads these — only `mapAdminSeats` does, and only that function is
  // ever wired to the authenticated fetch. Keep it that way (SEV-001).
  pickupPointName?: string | null
  passengerName?: string | null
  passengerPhone?: string | null
  notes?: string | null
}

/** Raw shape of the server-resolved live BusType grid on a bus response. */
export interface RawBusTypeGrid {
  standardRowsCount?: number
  doorRow?: number | null
  backRowSeatsCount?: number
  disabledSeatSlots?: string[]
}

export interface RawPickupPoint {
  name?: string
  order?: number
}

export interface RawBus {
  /** Public uuid identity. */
  id?: string
  /** @deprecated Legacy Mongo id — no longer emitted by the backend. */
  _id?: string
  tourId?: string
  name?: string
  busName?: string
  description?: string
  pickupPoints?: (string | RawPickupPoint)[]
  totalSeats?: number
  driverSide?: string
  doorPosition?: string
  isDefault?: boolean
  busTypeId?: string | null
  busTypeGrid?: RawBusTypeGrid | null
  seats?: RawSeat[]
}

export interface RawTour {
  /** Public uuid identity. */
  id?: string
  /** @deprecated Legacy Mongo id — no longer emitted by the backend. */
  _id?: string
  name?: string
  title?: string
  date?: string
  description?: string
  createdAt?: string
  buses?: RawBus[]
}

const SEAT_STATUSES: SeatStatus[] = ['available', 'pending', 'taken', 'reserved']
const DRIVER_SIDES: DriverSide[] = ['left', 'right']
const DOOR_POSITIONS: DoorPosition[] = ['front', 'middle', 'rear']

export function toSeatStatus(value: unknown): SeatStatus {
  return SEAT_STATUSES.includes(value as SeatStatus) ? (value as SeatStatus) : 'available'
}

/**
 * Natural ordering for free-form `position` strings such as "1A", "10B":
 * leading digits compared numerically, trailing letters compared
 * lexicographically. A plain lexicographic sort would place "10A" before "2A".
 */
function comparePosition(a: string, b: string): number {
  const parse = (pos: string): [number, string] => {
    const match = /^(\d*)(.*)$/.exec(pos.trim())
    const digits = match?.[1] ?? ''
    return [digits === '' ? Number.MAX_SAFE_INTEGER : Number(digits), match?.[2] ?? '']
  }
  const [aNum, aRest] = parse(a)
  const [bNum, bRest] = parse(b)
  if (aNum !== bNum) return aNum - bNum
  return aRest.localeCompare(bRest)
}

/**
 * Maps the public seat projection onto frontend `Seat`s.
 *
 * `seatNumber` is the interchange key used by every seat mutation endpoint
 * (approve/cancel/toggle-reserve/swap-move all take a seatNumber), and the
 * backend resolves it as the 1-based index into the bus's seats sorted by
 * `position` — so the same ordering is reproduced here.
 *
 * `row`/`col` come from the server when the bus was built from a BusType (the
 * live-joined template grid, gaps included). Otherwise they fall back to the
 * app's generic layout (`generateBusSeats`), which is the same convention
 * BusMap and SeatManagement already render against — no second layout
 * convention is introduced, and no numbering is ever re-derived client-side
 * for a template-derived bus.
 */
export function mapSeats(rawSeats: RawSeat[] | undefined, totalSeats: number): Seat[] {
  return mapSeatsInternal(rawSeats, totalSeats, false)
}

/**
 * Same mapping as `mapSeats`, plus passenger PII (name/phone/pickup/notes).
 * Only ever call this against the authenticated single-bus response
 * (GET /tour/:tourId/buses/:busId) — never against the public GET /tour(/:id)
 * response, which doesn't carry these fields anyway (SEV-001).
 */
export function mapAdminSeats(rawSeats: RawSeat[] | undefined, totalSeats: number): Seat[] {
  return mapSeatsInternal(rawSeats, totalSeats, true)
}

/**
 * True when the backend resolved this seat's grid cell for us. Both
 * coordinates must be present and finite — a half-supplied pair would place
 * the seat at a plausible-looking but wrong cell, so it falls back instead.
 */
function hasServerCell(raw: RawSeat): boolean {
  return Number.isFinite(raw.row) && Number.isFinite(raw.col)
}

function mapSeatsInternal(
  rawSeats: RawSeat[] | undefined,
  totalSeats: number,
  includePii: boolean
): Seat[] {
  if (!rawSeats || rawSeats.length === 0) return []

  // Only build the generic fallback layout when at least one seat lacks
  // server-supplied coordinates — for a template-derived bus it is both
  // unused and wrong (it packs the template's gaps out of existence).
  const needsFallbackLayout = rawSeats.some((raw) => !hasServerCell(raw))
  const layout = new Map<number, { row: number; col: number }>()
  if (needsFallbackLayout) {
    generateBusSeats(totalSeats).forEach((s) => layout.set(s.seatNumber, { row: s.row, col: s.col }))
  }

  return [...rawSeats]
    .sort((a, b) => comparePosition(a.position ?? '', b.position ?? ''))
    .map((raw, index) => {
      const seatNumber = raw.seatNumber ?? index + 1
      const cell = hasServerCell(raw)
        ? { row: raw.row as number, col: raw.col as number }
        : layout.get(seatNumber)
      return {
        id: raw.id ?? raw._id ?? `seat-${seatNumber}`,
        seatNumber,
        row: cell?.row ?? 1,
        col: cell?.col ?? 1,
        seatStatus: toSeatStatus(raw.status ?? raw.seatStatus),
        ...(includePii
          ? {
              passengerName: raw.passengerName ?? undefined,
              passengerPhone: raw.passengerPhone ?? undefined,
              pickupPoint: raw.pickupPointName ?? undefined,
              notes: raw.notes ?? undefined
            }
          : {})
      }
    })
}

function mapPickupPoints(raw: RawBus['pickupPoints']): string[] {
  if (!raw) return []
  return raw
    .map((p) => (typeof p === 'string' ? p : (p?.name ?? '')))
    .filter((name) => name.length > 0)
}

/**
 * Maps the server-resolved live BusType grid, or null when the bus has no
 * template (manual `seatLayout`) or the backend hasn't been rolled out yet.
 * A grid missing its row/bench counts is treated as absent rather than as a
 * zero-row bus — a partial response must degrade to the generic layout, not
 * render an empty seat map.
 */
function mapBusTypeGrid(raw: RawBus['busTypeGrid']): BusGrid | null {
  if (!raw) return null
  const standardRowsCount = raw.standardRowsCount
  const backRowSeatsCount = raw.backRowSeatsCount
  if (!Number.isFinite(standardRowsCount) || !Number.isFinite(backRowSeatsCount)) return null

  return {
    standardRowsCount: standardRowsCount as number,
    backRowSeatsCount: backRowSeatsCount as number,
    doorRow: Number.isFinite(raw.doorRow) ? (raw.doorRow as number) : null,
    disabledSeatSlots: raw.disabledSeatSlots ?? []
  }
}

export function mapBus(raw: RawBus): Bus {
  // totalSeats drives the row/col layout, so fall back to the actual seat
  // count when the backend omits it rather than defaulting to a wrong size.
  const totalSeats = raw.totalSeats ?? raw.seats?.length ?? 0

  return {
    id: raw.id ?? raw._id ?? '',
    tourId: raw.tourId ?? '',
    busName: raw.busName ?? raw.name ?? '',
    description: raw.description ?? '',
    pickupPoints: mapPickupPoints(raw.pickupPoints),
    totalSeats,
    driverSide: DRIVER_SIDES.includes(raw.driverSide as DriverSide)
      ? (raw.driverSide as DriverSide)
      : 'left',
    doorPosition: DOOR_POSITIONS.includes(raw.doorPosition as DoorPosition)
      ? (raw.doorPosition as DoorPosition)
      : 'front',
    isDefault: raw.isDefault ?? false,
    busTypeId: raw.busTypeId ?? null,
    grid: mapBusTypeGrid(raw.busTypeGrid),
    seats: mapSeats(raw.seats, totalSeats)
  }
}

/**
 * Same as `mapBus`, but maps seats with `mapAdminSeats` (PII included). Only
 * ever call this against the authenticated single-bus response.
 */
export function mapAdminBus(raw: RawBus): Bus {
  const totalSeats = raw.totalSeats ?? raw.seats?.length ?? 0
  return { ...mapBus(raw), seats: mapAdminSeats(raw.seats, totalSeats) }
}

export function mapTour(raw: RawTour): Tour {
  return {
    id: raw.id ?? raw._id ?? '',
    title: raw.title ?? raw.name ?? '',
    date: raw.date ?? '',
    description: raw.description ?? '',
    // `buses` is embedded by GET /tour and GET /tour/:tourId; older responses
    // omitted it entirely, so an empty list is the safe fallback.
    buses: (raw.buses ?? []).map(mapBus),
    createdAt: raw.createdAt ?? ''
  }
}

export function mapTours(raw: RawTour[] | undefined): Tour[] {
  return (raw ?? []).map(mapTour)
}
