// Reusable bus layout template (F11), stored in its own `busType` collection
// by tour-service — independent of any tour/bus instance. Instantiating a Bus
// from a BusType converts it into a concrete `seatLayout` server-side; editing
// the template afterwards never retroactively changes existing buses.
// Contract: docs/api-contract/api-contract.tour-service.yaml (`BusType`).

export interface BusType {
  id: string
  name: string
  description: string
  /** Derived from the layout fields; recomputed server-side on every write. */
  totalSeats: number
  /** Number of standard 4-seat rows (2 seats each side of the aisle). */
  standardRowsCount: number
  /** 1-based row where the middle door replaces the cols 3-4 pair. Null = no door. */
  doorRow: number | null
  /** Seats in the final bench row (no aisle). */
  backRowSeatsCount: number
  /** `"row-col"` keys (e.g. `"3-2"`) for slots with no seat. */
  disabledSeatSlots: string[]
  isDefault: boolean
  createdAt: string
}

/** Payload shape of `BusTypeInput` — what POST/PUT /busType accepts. */
export interface BusTypeInput {
  name: string
  description?: string
  standardRowsCount: number
  doorRow: number | null
  backRowSeatsCount: number
  disabledSeatSlots: string[]
  isDefault?: boolean
}
