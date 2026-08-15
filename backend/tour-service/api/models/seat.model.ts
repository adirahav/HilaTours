import mongoose, { Schema, Document, Types } from "mongoose"
import { applyUuidIdentity } from "../lib/clientShape"

export type SeatStatus = "available" | "pending" | "taken" | "reserved"

export const SEAT_STATUSES: SeatStatus[] = ["available", "pending", "taken", "reserved"]

export interface SeatDoc extends Document {
  /** Public identity (plan 028). `_id` is internal-only and never serialized. */
  uuid: string
  /** Internal ObjectId ref — serialized to clients as the bus's uuid. */
  busId: Types.ObjectId
  position: string
  status: SeatStatus
  pickupPointName: string | null
  passengerName: string | null
  passengerPhone: string | null
  notes: string | null
  requestedAt: Date | null
  approvedAt: Date | null
  assignedBy: string | null
  updatedAt: Date
  deletedAt: Date | null
}

const seatSchema = new Schema<SeatDoc>({
  busId: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
  position: { type: String, required: true },
  status: {
    type: String,
    required: true,
    enum: SEAT_STATUSES,
    default: "available",
  },
  pickupPointName: { type: String, default: null },
  passengerName: { type: String, default: null },
  passengerPhone: { type: String, default: null },
  notes: { type: String, default: null },
  requestedAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
  // Admin attribution. Stored as the admin's *uuid* string, not an ObjectId
  // ref: Admin lives in user-management-service, so tour-service has no local
  // collection to resolve a uuid against (plan 028 step 4 design fork).
  // Internal-only — never serialized to clients (it is admin PII-adjacent).
  assignedBy: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
  // Set when the owning bus/tour is soft-deleted (see tour.service.softDeleteTour
  // and bus.service.softDeleteBus) — seats themselves are never hard-deleted by
  // that path anymore, matching Tour/Bus. Still hard-deleted by
  // bus.service.resizeSeats when a layout genuinely shrinks (a removed seat
  // position isn't "soft" state, it no longer exists in the layout).
  deletedAt: { type: Date, default: null },
})

applyUuidIdentity(seatSchema)

// Exclude soft-deleted seats automatically, same pattern as Tour/Bus.
seatSchema.pre(/^find/, function (this: any) {
  if (!("deletedAt" in this.getFilter())) {
    this.where({ deletedAt: null })
  }
})

// Unique seat position per bus + fast seat-map queries by status.
seatSchema.index({ busId: 1, position: 1 }, { unique: true })
seatSchema.index({ busId: 1, status: 1 })

export const Seat =
  mongoose.models.Seat || mongoose.model<SeatDoc>("Seat", seatSchema, "seat")
