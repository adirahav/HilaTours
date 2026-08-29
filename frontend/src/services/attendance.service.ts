import { httpService, tourClient } from './http.service'
import { useStore } from '../store/store'
import type { AttendanceRecord, AttendanceSession } from '../types/attendance.types'

// Paths are relative to VITE_TOUR_API_URL, whose base already ends in /api
// (see api-contract.tour-service.yaml, `/attendance` paths). Every route is
// admin/guide-only (`attendance:view` / `attendance:manage`); the JWT is
// attached centrally by http.service.
//
// Like the other domain services, this one writes the store itself — callers
// must not re-apply the result.

export interface RawAttendanceRecord {
  id?: string
  _id?: string
  sessionId?: string
  seatId?: string
  seatPosition?: string
  passengerName?: string | null
  passengerPhone?: string | null
  pickupPointName?: string | null
  notes?: string | null
  bookingGroupId?: string | null
  isApproved?: boolean
  isPresent?: boolean
  checkedInAt?: string | null
}

export interface RawAttendanceSession {
  id?: string
  _id?: string
  tourId?: string
  busId?: string
  title?: string
  createdAt?: string
  records?: RawAttendanceRecord[]
}

export function mapAttendanceRecord(raw: RawAttendanceRecord): AttendanceRecord {
  return {
    id: raw.id ?? raw._id ?? '',
    sessionId: raw.sessionId ?? '',
    seatId: raw.seatId ?? '',
    seatPosition: raw.seatPosition ?? '',
    passengerName: raw.passengerName ?? '',
    passengerPhone: raw.passengerPhone ?? undefined,
    // The backend uses `pickupPointName` (matching the Seat schema); the
    // grouping code and the prototype both call it `pickupPoint`.
    pickupPoint: raw.pickupPointName ?? '',
    notes: raw.notes ?? undefined,
    bookingGroupId: raw.bookingGroupId ?? undefined,
    isApproved: raw.isApproved ?? true,
    isPresent: raw.isPresent ?? false,
    checkedInAt: raw.checkedInAt ?? null
  }
}

export function mapAttendanceSession(raw: RawAttendanceSession): AttendanceSession {
  return {
    id: raw.id ?? raw._id ?? '',
    tourId: raw.tourId ?? '',
    busId: raw.busId ?? '',
    title: raw.title ?? '',
    createdAt: raw.createdAt ?? '',
    records: (raw.records ?? []).map(mapAttendanceRecord)
  }
}

/**
 * Merges a session pushed over the `attendance:update` socket event into the
 * store. Exported for hooks/useAttendanceSocket.ts — the broadcast payload has
 * the same shape as the REST responses, so the mapping is shared (mirrors
 * `applyRemoteSeatUpdate` in seat.service.ts).
 */
export function applyRemoteAttendanceUpdate(raw: RawAttendanceSession): void {
  useStore.getState().upsertAttendanceSession(mapAttendanceSession(raw))
}

/** A session deleted on another device must disappear here too. */
export function applyRemoteAttendanceDelete(sessionId: string): void {
  useStore.getState().removeAttendanceSession(sessionId)
}

export const attendanceService = {
  async query(tourId: string, busId: string): Promise<AttendanceSession[]> {
    const raw = await httpService.get<RawAttendanceSession[]>(
      tourClient,
      `/attendance/session?tourId=${encodeURIComponent(tourId)}&busId=${encodeURIComponent(busId)}`
    )
    const sessions = (raw ?? []).map(mapAttendanceSession)
    useStore.getState().setAttendanceSessions(sessions)
    return sessions
  },

  // Creating a session snapshots every taken/reserved seat that currently has
  // a passenger on this bus — server-side, so two guides creating at once
  // still each get a consistent snapshot.
  async create(tourId: string, busId: string, title: string): Promise<AttendanceSession> {
    const raw = await httpService.post<RawAttendanceSession>(tourClient, '/attendance/session', {
      tourId,
      busId,
      title
    })
    const session = mapAttendanceSession(raw)
    useStore.getState().upsertAttendanceSession(session)
    useStore.getState().setSelectedAttendanceSessionId(session.id)
    return session
  },

  /**
   * The single presence mutation, used for all three UI gestures: an
   * individual toggle, a whole-party toggle-all card, and the per-station
   * batch check/uncheck. The caller resolves which records the gesture covers
   * — there is no separate per-station endpoint.
   *
   * Last-write-wins: two guides toggling the same party near-simultaneously
   * do not merge, they overwrite. Acceptable for an idempotent boolean set.
   */
  async setPresence(
    sessionId: string,
    recordIds: string[],
    isPresent: boolean
  ): Promise<AttendanceSession> {
    const raw = await httpService.post<RawAttendanceSession>(
      tourClient,
      `/attendance/session/${sessionId}/presence`,
      { recordIds, isPresent }
    )
    const session = mapAttendanceSession(raw)
    useStore.getState().upsertAttendanceSession(session)
    return session
  },

  async reset(sessionId: string): Promise<AttendanceSession> {
    const raw = await httpService.post<RawAttendanceSession>(
      tourClient,
      `/attendance/session/${sessionId}/reset`
    )
    const session = mapAttendanceSession(raw)
    useStore.getState().upsertAttendanceSession(session)
    return session
  },

  // Hard delete (session + its records) — attendance sessions are disposable
  // working documents, not audited records, so there is no soft-delete here.
  async remove(sessionId: string): Promise<void> {
    await httpService.del(tourClient, `/attendance/session/${sessionId}`)
    useStore.getState().removeAttendanceSession(sessionId)
  }
}
