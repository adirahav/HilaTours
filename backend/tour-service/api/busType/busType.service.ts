import { Types } from "mongoose"
import { BusType } from "../models/busType.model"
import { HttpError } from "../lib/http"
import { toClientBusType } from "../lib/clientShape"
import { resolveDoc } from "../lib/resolveId"

/**
 * BusType templates (PRD F11).
 *
 * The layout math below is the authoritative translation of a template into a
 * concrete `Bus.seatLayout`. The frontend mirrors it in
 * `frontend/src/lib/busTypeLayout.ts` for the live preview only — the two must
 * number seats identically: row by row, col 1 → 4, then the back bench,
 * skipping the doorway slot and any disabled slot.
 */

export interface BusTypeInput {
  name?: string
  description?: string | null
  standardRowsCount?: number
  doorRow?: number | null
  backRowSeatsCount?: number
  disabledSeatSlots?: string[]
  isDefault?: boolean
  // `totalSeats` is deliberately absent — it is derived server-side and never
  // accepted from client input (see the BusType schema in the API contract).
}

/** Columns per standard row: 2 seats | aisle | 2 seats. */
const STANDARD_ROW_COLUMNS = 4

const MIN_STANDARD_ROWS = 2
const MAX_STANDARD_ROWS = 18
const MIN_DOOR_ROW = 2
const MAX_BACK_ROW_SEATS = 8

/** Cols 3-4 of the door row are the doorway, never seats. */
function isDoorwaySlot(row: number, col: number, doorRow: number | null): boolean {
  return doorRow !== null && row === doorRow && (col === 3 || col === 4)
}

/**
 * Back-bench slots were historically keyed `back-<col>`; templates written by
 * the current UI key them `<standardRowsCount + 1>-<col>`. Both forms are
 * honoured on read so older templates keep resolving; only the row-col form is
 * ever written.
 */
function isBackSlotDisabled(disabled: Set<string>, backRowIndex: number, col: number): boolean {
  return disabled.has(`${backRowIndex}-${col}`) || disabled.has(`back-${col}`)
}

export interface BusTypeLayout {
  standardRowsCount: number
  doorRow: number | null
  backRowSeatsCount: number
  disabledSeatSlots: string[]
}

/**
 * The seat positions a template produces, in seat-number order: `"1"`..`"N"`,
 * matching the plain numeric positions every other bus in this service uses
 * (see bus.service.createDefaultBus).
 */
export function seatPositionsFromBusType(busType: BusTypeLayout): string[] {
  const disabled = new Set(busType.disabledSeatSlots ?? [])
  const doorRow = busType.doorRow ?? null
  let count = 0

  for (let row = 1; row <= busType.standardRowsCount; row++) {
    for (let col = 1; col <= STANDARD_ROW_COLUMNS; col++) {
      if (isDoorwaySlot(row, col, doorRow)) continue
      if (!disabled.has(`${row}-${col}`)) count++
    }
  }

  const backRowIndex = busType.standardRowsCount + 1
  for (let col = 1; col <= busType.backRowSeatsCount; col++) {
    if (!isBackSlotDisabled(disabled, backRowIndex, col)) count++
  }

  return Array.from({ length: count }, (_, i) => String(i + 1))
}

/** Total bookable seats a template produces. */
export function totalSeatsFromBusType(busType: BusTypeLayout): number {
  return seatPositionsFromBusType(busType).length
}

/**
 * Template → the `seatLayout` shape `bus.service.seatPositionsFromLayout`
 * already parses. Only `positions` is authoritative; the template fields are
 * carried alongside purely as provenance for the resulting bus, and are
 * ignored by every reader (an explicit `positions` list always wins).
 */
export function seatLayoutFromBusType(busType: BusTypeLayout): Record<string, unknown> {
  return {
    positions: seatPositionsFromBusType(busType),
    standardRowsCount: busType.standardRowsCount,
    doorRow: busType.doorRow ?? null,
    backRowSeatsCount: busType.backRowSeatsCount,
    disabledSeatSlots: busType.disabledSeatSlots ?? [],
  }
}

function requireInt(value: unknown, field: string, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} must be an integer between ${min} and ${max}`)
  }
  return n
}

function normalizeDisabledSlots(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new HttpError(400, "disabledSeatSlots must be an array of \"row-col\" strings")
  }
  return value.map((slot) => String(slot))
}

/**
 * Validates and normalizes a full template payload. Both POST and PUT send the
 * complete BusTypeInput (the contract has no partial-update variant), so this
 * is deliberately a full validation rather than a per-field patch.
 */
function normalizeInput(input: BusTypeInput) {
  const name = typeof input.name === "string" ? input.name.trim() : ""
  if (!name) throw new HttpError(400, "name is required")

  const standardRowsCount = requireInt(
    input.standardRowsCount,
    "standardRowsCount",
    MIN_STANDARD_ROWS,
    MAX_STANDARD_ROWS,
  )
  const backRowSeatsCount = requireInt(
    input.backRowSeatsCount,
    "backRowSeatsCount",
    0,
    MAX_BACK_ROW_SEATS,
  )

  let doorRow: number | null = null
  if (input.doorRow !== undefined && input.doorRow !== null) {
    doorRow = requireInt(input.doorRow, "doorRow", MIN_DOOR_ROW, standardRowsCount)
  }

  const disabledSeatSlots = normalizeDisabledSlots(input.disabledSeatSlots)
  const layout = { standardRowsCount, doorRow, backRowSeatsCount, disabledSeatSlots }
  const totalSeats = totalSeatsFromBusType(layout)
  if (totalSeats === 0) {
    throw new HttpError(400, "This layout produces no seats")
  }

  return {
    name,
    description:
      typeof input.description === "string" ? input.description.trim() || null : null,
    ...layout,
    totalSeats,
    isDefault: input.isDefault === true,
  }
}

async function resolveBusTypeDoc(busTypeUuid: string, message = "Bus type not found") {
  return resolveDoc(BusType, busTypeUuid, message, { deletedAt: null })
}

/**
 * Keeps "at most one default" true. Runs as a single `updateMany` that clears
 * the flag everywhere *except* the winning document, so two concurrent admins
 * marking different templates default converge to exactly one winner (the last
 * write) rather than leaving two flagged.
 */
async function enforceSingleDefault(winnerId: Types.ObjectId): Promise<void> {
  await BusType.updateMany(
    { _id: { $ne: winnerId }, isDefault: true, deletedAt: null },
    { $set: { isDefault: false } },
  )
}

export async function listBusTypes() {
  const busTypes = await BusType.find({ deletedAt: null }).sort({ createdAt: 1 }).lean()
  return busTypes.map((busType: any) => toClientBusType(busType))
}

export async function getBusType(busTypeUuid: string) {
  const busType = await resolveBusTypeDoc(busTypeUuid)
  return toClientBusType(busType)
}

export async function createBusType(input: BusTypeInput) {
  const fields = normalizeInput(input)
  const busType = await BusType.create(fields)
  if (fields.isDefault) {
    await enforceSingleDefault(busType._id as Types.ObjectId)
  }
  return toClientBusType(busType.toObject())
}

export async function updateBusType(busTypeUuid: string, input: BusTypeInput) {
  const existing = await resolveBusTypeDoc(busTypeUuid)
  const fields = normalizeInput(input)

  const busType = await BusType.findOneAndUpdate(
    { _id: existing._id, deletedAt: null },
    { $set: fields },
    { returnDocument: "after" },
  ).lean()
  if (!busType) throw new HttpError(404, "Bus type not found")

  if (fields.isDefault) {
    await enforceSingleDefault(existing._id as Types.ObjectId)
  }
  return toClientBusType(busType)
}

/**
 * Soft-delete only (`deletedAt`). Buses already instantiated from this
 * template are deliberately untouched — conversion is a one-time copy that
 * keeps no live reference back here (plan 034, Open Question 2).
 */
export async function softDeleteBusType(busTypeUuid: string) {
  const message = "Bus type not found or already deleted"
  const existing = await resolveBusTypeDoc(busTypeUuid, message)

  const busType = await BusType.findOneAndUpdate(
    { _id: existing._id, deletedAt: null },
    { $set: { deletedAt: new Date(), isDefault: false } },
    { returnDocument: "after" },
  ).lean()
  if (!busType) throw new HttpError(404, message)
  return toClientBusType(busType)
}

/**
 * Resolves a client-supplied `busTypeId` to the `seatLayout` a new bus should
 * be built with. Lives here (not in bus.service) so the template → layout
 * translation has exactly one home.
 */
export async function seatLayoutForBusTypeUuid(busTypeUuid: unknown) {
  const busType = await resolveDoc(
    BusType,
    busTypeUuid,
    "Bus type not found",
    { deletedAt: null },
  )
  return seatLayoutFromBusType(busType as unknown as BusTypeLayout)
}
