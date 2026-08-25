import mongoose, { Schema, Document, Types } from "mongoose"
import { applyUuidIdentity } from "../lib/clientShape"

/**
 * One snapshotted passenger within an AttendanceSession.
 *
 * The passenger fields are a POINT-IN-TIME COPY of the seat as it was when the
 * session was created — not a live join. An admin editing a passenger's name or
 * pickup point on the seat map afterwards does not change an already-created
 * session (PRD: "snapshots ... at that moment"). That is intended, not a bug.
 *
 * CONTAINS PII (`passengerName`/`passengerPhone`/`pickupPointName`), so these
 * records are only ever returned from `attendance:view`-authorized routes and
 * only ever broadcast to the per-bus ADMIN socket room — never the public,
 * PII-stripped room (SEV-001).
 *
 * "Missing" is `isPresent: false`, not a third status value — the UI is strictly
 * present/missing, so a boolean is sufficient.
 */
export interface AttendanceRecordDoc extends Document {
  /** Public identity (plan 028). `_id` is internal-only and never serialized. */
  uuid: string
  /** Internal ObjectId ref — serialized to clients as the session's uuid. */
  sessionId: Types.ObjectId
  /** Internal ObjectId ref — serialized to clients as the seat's uuid. */
  seatId: Types.ObjectId
  /** Seat label at snapshot time (matches `Seat.position`). */
  seatPosition: string
  passengerName: string
  passengerPhone: string | null
  pickupPointName: string | null
  notes: string | null
  /**
   * Shared booking-party id copied from the seat when present. `Seat` carries no
   * such field today, so this is normally null and clients fall back to grouping
   * by phone, then by name. Kept as an explicit tier so no rework is needed if
   * real booking-group linkage is added to `Seat` later.
   */
  bookingGroupId: string | null
  isPresent: boolean
  /** Set when `isPresent` flips true; cleared to null when it flips back or on reset. */
  checkedInAt: Date | null
}

const attendanceRecordSchema = new Schema<AttendanceRecordDoc>({
  sessionId: { type: Schema.Types.ObjectId, ref: "AttendanceSession", required: true },
  seatId: { type: Schema.Types.ObjectId, ref: "Seat", required: true },
  seatPosition: { type: String, required: true },
  passengerName: { type: String, required: true },
  passengerPhone: { type: String, default: null },
  pickupPointName: { type: String, default: null },
  notes: { type: String, default: null },
  bookingGroupId: { type: String, default: null },
  isPresent: { type: Boolean, default: false },
  checkedInAt: { type: Date, default: null },
})

applyUuidIdentity(attendanceRecordSchema)

// Every read and every mutation is scoped to one session.
attendanceRecordSchema.index({ sessionId: 1 })

export const AttendanceRecord =
  mongoose.models.AttendanceRecord ||
  mongoose.model<AttendanceRecordDoc>(
    "AttendanceRecord",
    attendanceRecordSchema,
    "attendanceRecord",
  )
