import mongoose, { Schema, Document, Types } from "mongoose"
import { applyUuidIdentity } from "../lib/clientShape"

/**
 * A day-of-tour passenger check-in board for one bus (PRD F12 / AC-12..14).
 *
 * Creating a session SNAPSHOTS every `taken`/`reserved` seat that currently has
 * a `passengerName` on that bus into immutable `AttendanceRecord`s — later edits
 * to a seat's passenger do NOT retroactively change an existing session.
 *
 * Deliberately NOT soft-deleted, unlike every other collection in this service:
 * sessions are disposable working documents, not audited history, so
 * `deleteSession` removes the session AND its records outright (contract:
 * DELETE /attendance/session/{sessionId} → 204).
 *
 * Design source: raw_from_ai_studio/src/components/AttendanceManagement.tsx —
 * with its localStorage/tab-sync persistence replaced by this collection plus
 * the `attendance:update` admin-room socket broadcast, so two guides' phones
 * watching the same bus stay in sync in real time.
 */
export interface AttendanceSessionDoc extends Document {
  /** Public identity (plan 028). `_id` is internal-only and never serialized. */
  uuid: string
  /** Internal ObjectId ref — serialized to clients as the tour's uuid. */
  tourId: Types.ObjectId
  /** Internal ObjectId ref — serialized to clients as the bus's uuid. */
  busId: Types.ObjectId
  /** Free-form, no uniqueness constraint — multiple sessions per bus are a feature. */
  title: string
  createdAt: Date
  /**
   * Admin attribution, stored as the admin's *uuid* string exactly like
   * `Seat.assignedBy` (Admin lives in user-management-service, so there is no
   * local collection to ref). Internal-only — never serialized to a client.
   */
  createdBy: string | null
}

const attendanceSessionSchema = new Schema<AttendanceSessionDoc>({
  tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true },
  busId: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
  title: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String, default: null },
})

applyUuidIdentity(attendanceSessionSchema)

// The only list query is "all sessions for this tour+bus, newest first".
attendanceSessionSchema.index({ tourId: 1, busId: 1 })

export const AttendanceSession =
  mongoose.models.AttendanceSession ||
  mongoose.model<AttendanceSessionDoc>(
    "AttendanceSession",
    attendanceSessionSchema,
    "attendanceSession",
  )
