import mongoose, { Schema, Document } from "mongoose"
import { applyUuidIdentity } from "../lib/clientShape"

/**
 * A reusable bus layout template (PRD F11), independent of any tour or bus
 * instance. Instantiating a Bus from a BusType seeds its `Bus.seatLayout` AND
 * stores a live `Bus.busTypeId` reference back here (plan 037).
 *
 * That reference is live, not a snapshot: editing this template DOES
 * retroactively change the rendered seat map of every bus referencing it (the
 * admin UI warns before saving such an edit, it does not block it). This is
 * deliberate — it is the only way a mid-row gap stays representable, since a
 * bus's flat `seatLayout.positions` cannot encode one. Soft-deleting a template
 * hides it from the picker but must never break those buses, so the render join
 * resolves soft-deleted templates too.
 *
 * Design source: raw_from_ai_studio/src/components/BusTypeManagement.tsx.
 */
export interface BusTypeDoc extends Document {
  /** Public identity (plan 028). `_id` is internal-only and never serialized. */
  uuid: string
  name: string
  description: string | null
  /**
   * Derived from the layout fields on every write (see
   * busType.service.totalSeatsFromLayout) — never accepted from client input.
   */
  totalSeats: number
  /** Number of standard rows; each has 4 slots (cols 1-2 | aisle | cols 3-4). */
  standardRowsCount: number
  /** 1-based row whose cols 3-4 are the middle doorway. Null = no middle door. */
  doorRow: number | null
  /** Seats in the final bench row (no aisle). */
  backRowSeatsCount: number
  /** `"row-col"` keys for slots with no seat (e.g. `"3-2"`). */
  disabledSeatSlots: string[]
  /** UI default-selection hint only; at most one template has it (service-enforced). */
  isDefault: boolean
  createdAt: Date
  deletedAt: Date | null
}

const busTypeSchema = new Schema<BusTypeDoc>({
  name: { type: String, required: true },
  description: { type: String, default: null },
  totalSeats: { type: Number, required: true },
  standardRowsCount: { type: Number, required: true },
  doorRow: { type: Number, default: null },
  backRowSeatsCount: { type: Number, required: true },
  disabledSeatSlots: { type: [String], default: [] },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
})

applyUuidIdentity(busTypeSchema)

// Soft-delete scoping, identical to bus.model.ts: every find is implicitly
// limited to live documents unless the caller opts out by naming `deletedAt`.
busTypeSchema.pre(/^find/, function (this: any) {
  if (!("deletedAt" in this.getFilter())) {
    this.where({ deletedAt: null })
  }
})

export const BusType =
  mongoose.models.BusType || mongoose.model<BusTypeDoc>("BusType", busTypeSchema, "busType")
