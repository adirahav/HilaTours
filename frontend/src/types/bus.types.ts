import type { Seat } from './seat.types'

export type DriverSide = 'left' | 'right'
export type DoorPosition = 'front' | 'middle' | 'rear'

/**
 * The live grid of the BusType this bus was instantiated from, resolved
 * SERVER-side at read time by joining `Bus.busTypeId` back to the current
 * BusType document (never a snapshot taken at creation time — editing the
 * template retroactively changes this). Present only for template-derived
 * buses; `null` for a bus configured with a manual `seatLayout`, which keeps
 * rendering via the generic `generateBusSeats` layout.
 *
 * This is the only thing that can express a *gap* in a row (a disabled slot
 * in the middle of the back bench, say) — a flat `positions: string[]` cannot,
 * which is exactly the bug this shape fixes.
 *
 * Contract: `Bus.busTypeGrid` in api-contract.tour-service.yaml.
 */
export interface BusGrid {
  /** Number of standard 4-column rows, before the back bench. */
  standardRowsCount: number
  /** 1-based row whose cols 3-4 are the middle door, not seats. Null = none. */
  doorRow: number | null
  /** Columns in the final bench row (row `standardRowsCount + 1`). */
  backRowSeatsCount: number
  /** `"row-col"` keys with no seat — the gaps. */
  disabledSeatSlots: string[]
}

export interface Bus {
  id: string
  tourId: string
  busName: string // e.g. "אוטובוס 1 - מרכז"
  description: string
  pickupPoints: string[]
  totalSeats: number // between 50 and 60
  driverSide: DriverSide // side of the bus the driver sits on
  doorPosition: DoorPosition // where the passenger door is located
  // True only for the bus auto-created with its tour. Server-enforced,
  // deletion-protected — never settable by the client.
  isDefault: boolean
  /** The BusType this bus was built from, or null for a manual layout. */
  busTypeId: string | null
  /** Live-joined template grid (see `BusGrid`), or null for a manual layout. */
  grid: BusGrid | null
  seats: Seat[]
}
