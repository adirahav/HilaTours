// Reusable bus layout template (F11), stored in its own `busType` collection
// by tour-service — independent of any tour/bus instance. A Bus instantiated
// from a BusType keeps a permanent `busTypeId` reference, and its rendered
// seat grid is joined LIVE to this template at read time — so editing a
// template DOES retroactively change the seat map of every bus built from it
// (2026-08-22, plan 036/037). The admin is warned about that before saving,
// never blocked; `busCount` below is what the warning counts.
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
  /**
   * How many non-deleted buses currently reference this template. Server-
   * computed and read-only. Because the render join is live, every one of
   * those buses re-renders against whatever this template says after a save —
   * which is what the editor warns about. Defaults to 0 when the backend
   * doesn't supply it, so the warning simply stays hidden rather than
   * claiming a wrong count.
   */
  busCount: number
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
