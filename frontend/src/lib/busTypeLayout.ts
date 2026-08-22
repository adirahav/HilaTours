import type { BusType, BusTypeInput } from '../types/busType.types'

// Pure layout math for BusType templates (F11). Kept separate from
// `busLayoutHelper.ts`, which describes the *fixed* fleet layout of a concrete
// Bus (back door at row 8, 5-seat bench); a BusType is free-form by design.
//
// The server owns the authoritative translation of a template into a Bus
// `seatLayout` (`seatLayoutFromBusType`) — everything here is display-only:
// the live preview grid and the derived seat count shown while editing.
// Numbering must therefore match the server's: row by row, col 1→4, then the
// back bench, skipping the door slot and any disabled slot.

export const MIN_STANDARD_ROWS = 2
export const MAX_STANDARD_ROWS = 18
export const MIN_DOOR_ROW = 2

/** Columns 3-4 of the door row are the doorway, never seats. */
function isDoorwaySlot(row: number, col: number, doorRow: number | null): boolean {
  return doorRow !== null && row === doorRow && (col === 3 || col === 4)
}

/**
 * Back-bench slots were historically keyed `back-<col>`; current templates key
 * them `<standardRowsCount + 1>-<col>`. Both are honoured when reading so old
 * templates keep rendering, but only the row-col form is ever written.
 */
function isBackSlotDisabled(disabled: Set<string>, backRowIndex: number, col: number): boolean {
  return disabled.has(`${backRowIndex}-${col}`) || disabled.has(`back-${col}`)
}

/** Total bookable seats for a layout configuration. */
export function calculateTotalSeatsFromLayout(
  standardRowsCount: number,
  backRowSeatsCount: number,
  disabledSeatSlots: string[] = [],
  doorRow: number | null = null
): number {
  const disabled = new Set(disabledSeatSlots)
  let total = 0

  for (let row = 1; row <= standardRowsCount; row++) {
    for (let col = 1; col <= 4; col++) {
      if (isDoorwaySlot(row, col, doorRow)) continue
      if (!disabled.has(`${row}-${col}`)) total++
    }
  }

  const backRowIndex = standardRowsCount + 1
  for (let col = 1; col <= backRowSeatsCount; col++) {
    if (!isBackSlotDisabled(disabled, backRowIndex, col)) total++
  }

  return total
}

export interface GridSlot {
  number?: number
  active: boolean
}

export interface GridRow {
  row: number
  col1: GridSlot
  col2: GridSlot
  col3: GridSlot
  col4: GridSlot
  hasDoor: boolean
}

export interface BackRowSlot {
  col: number
  number?: number
  active: boolean
}

/** Numbered preview grid for the visual builder. */
export function buildNumberedGrid(
  standardRowsCount: number,
  backRowSeatsCount: number,
  disabledSeatSlots: string[],
  doorRow: number | null
): { standardGrid: GridRow[]; backRow: BackRowSlot[] } {
  const disabled = new Set(disabledSeatSlots)
  let seatNumber = 1

  const slot = (row: number, col: number): GridSlot => {
    const active = !isDoorwaySlot(row, col, doorRow) && !disabled.has(`${row}-${col}`)
    return { active, number: active ? seatNumber++ : undefined }
  }

  const standardGrid: GridRow[] = []
  for (let row = 1; row <= standardRowsCount; row++) {
    standardGrid.push({
      row,
      col1: slot(row, 1),
      col2: slot(row, 2),
      col3: slot(row, 3),
      col4: slot(row, 4),
      hasDoor: doorRow !== null && row === doorRow
    })
  }

  const backRowIndex = standardRowsCount + 1
  const backRow: BackRowSlot[] = []
  for (let col = 1; col <= backRowSeatsCount; col++) {
    const active = !isBackSlotDisabled(disabled, backRowIndex, col)
    backRow.push({ col, active, number: active ? seatNumber++ : undefined })
  }

  return { standardGrid, backRow }
}

/**
 * The "add new bus type" starting point: the standard 55-seat Israeli tourism
 * layout (13 rows, middle door at row 7, 5-seat bench). Returned as a
 * `BusTypeInput` — the server assigns id/totalSeats/createdAt.
 */
export function createDefault55BusTypeInput(name: string): BusTypeInput {
  return {
    name,
    description: 'מבנה 55 מושבים קלאסי: 13 שורות עם דלת אמצעית בשורה 7 וספסל 5 מושבים',
    standardRowsCount: 13,
    doorRow: 7,
    backRowSeatsCount: 5,
    disabledSeatSlots: [],
    isDefault: false
  }
}

/** Editor state of an existing template, ready to PUT back. */
export function toBusTypeInput(busType: BusType): BusTypeInput {
  return {
    name: busType.name,
    description: busType.description,
    standardRowsCount: busType.standardRowsCount,
    doorRow: busType.doorRow,
    backRowSeatsCount: busType.backRowSeatsCount,
    disabledSeatSlots: [...busType.disabledSeatSlots],
    isDefault: busType.isDefault
  }
}
