// Attendance domain types (F12 / AC-12..14): the guide's day-of-tour
// passenger check-in tool.
//
// Unlike the AI-studio prototype — which kept sessions in `localStorage` and
// synced tabs via the `storage` event — sessions and records are persisted
// SERVER-side by tour-service and pushed to every admin device watching the
// same bus over the existing socket.io channel. Two phones checking in the
// same bus therefore stay in sync in real time.
//
// A session is a POINT-IN-TIME SNAPSHOT: creating it copies every
// taken/reserved seat that has a passenger into immutable records. Editing a
// seat's passenger afterwards does NOT retroactively change an existing
// session (plan 038, Assumptions).
//
// Contract: docs/api-contract/api-contract.tour-service.yaml
// (`AttendanceSession` / `AttendanceRecord`).

export interface AttendanceRecord {
  id: string
  sessionId: string
  /** Seat this record was snapshotted from (uuid). */
  seatId: string
  /** Seat label as shown on the map, e.g. "3A". Snapshotted, never re-resolved. */
  seatPosition: string
  passengerName: string
  passengerPhone?: string
  pickupPoint: string
  notes?: string
  /**
   * Shared booking-party id, when the seat carries one. `Seat` has no such
   * field in production yet, so this is normally absent and the party
   * grouping degrades to phone-then-name (see `groupAttendanceByStation`).
   */
  bookingGroupId?: string
  isPresent: boolean
  checkedInAt: string | null
}

export interface AttendanceSession {
  id: string
  tourId: string
  busId: string
  title: string
  createdAt: string
  records: AttendanceRecord[]
}

/** A family / booking party: one toggle-all card in the UI. */
export interface AttendanceParty {
  /** Stable key within a station — `"<pickupPoint>-<partyKey>"`. */
  id: string
  primaryName: string
  passengerNames: string[]
  passengerPhone?: string
  pickupPoint: string
  notes?: string
  partySize: number
  seatPositions: string[]
  recordIds: string[]
  records: AttendanceRecord[]
  /** True only when every member of the party is checked in. */
  isPresent: boolean
  presentCount: number
}

/** One pickup point, with its parties and per-station progress. */
export interface AttendanceStation {
  pickupPoint: string
  parties: AttendanceParty[]
  totalPassengers: number
  presentPassengers: number
}

export interface AttendanceStats {
  total: number
  present: number
  missing: number
  percent: number
}
