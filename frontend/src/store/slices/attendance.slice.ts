import type { StateCreator } from 'zustand'
import type { AttendanceSession } from '../../types/attendance.types'

// Attendance sessions (F12) are a flat, top-level collection keyed by
// tour+bus — they are NOT embedded in the tour tree, so they never go stale
// when the public tour refetch replaces `tours`. `attendanceService` and the
// `attendance:update` socket listener are the only writers; components read.
export interface AttendanceSlice {
  attendanceSessions: AttendanceSession[]
  selectedAttendanceSessionId: string | null
  setAttendanceSessions: (sessions: AttendanceSession[]) => void
  setSelectedAttendanceSessionId: (sessionId: string | null) => void
  upsertAttendanceSession: (session: AttendanceSession) => void
  removeAttendanceSession: (sessionId: string) => void
}

export const createAttendanceSlice: StateCreator<AttendanceSlice> = set => ({
  attendanceSessions: [],
  selectedAttendanceSessionId: null,
  setAttendanceSessions: attendanceSessions => set({ attendanceSessions }),
  setSelectedAttendanceSessionId: selectedAttendanceSessionId =>
    set({ selectedAttendanceSessionId }),
  upsertAttendanceSession: session =>
    set(state => {
      const exists = state.attendanceSessions.some(s => s.id === session.id)
      return {
        attendanceSessions: exists
          ? state.attendanceSessions.map(s => (s.id === session.id ? session : s))
          : [...state.attendanceSessions, session]
      }
    }),
  removeAttendanceSession: sessionId =>
    set(state => ({
      attendanceSessions: state.attendanceSessions.filter(s => s.id !== sessionId),
      // Dropping the selection here (rather than in the component) keeps a
      // socket-driven delete from another device from leaving this one
      // pointing at a session that no longer exists.
      selectedAttendanceSessionId:
        state.selectedAttendanceSessionId === sessionId
          ? null
          : state.selectedAttendanceSessionId
    }))
})
