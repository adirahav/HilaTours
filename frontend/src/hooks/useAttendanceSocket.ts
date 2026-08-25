import { useEffect } from 'react'
import { socketService } from '../services/socket.service'
import {
  applyRemoteAttendanceDelete,
  applyRemoteAttendanceUpdate,
  type RawAttendanceSession
} from '../services/attendance.service'

// Real-time attendance sync (F12): the guide at the door and the office both
// watch the same bus, so a check-in on one device must land on the other
// without a refresh. This replaces the prototype's `localStorage` + `storage`
// tab-sync, which only ever reached other tabs of the same browser.
//
// Joins the bus's socket room on mount and leaves it on unmount/bus change,
// exactly like useSeatSocket — the server only admits an authenticated admin
// socket to the PII-bearing room, so attendance payloads never reach a
// passenger client.
export function useAttendanceSocket(busId: string | undefined): void {
  useEffect(() => {
    if (!busId) return
    socketService.joinBus(busId)
    const unsubscribe = socketService.onAttendanceUpdate(payload => {
      if (payload.busId !== busId) return
      if (payload.deletedSessionId) {
        applyRemoteAttendanceDelete(payload.deletedSessionId)
        return
      }
      if (payload.session) {
        applyRemoteAttendanceUpdate(payload.session as RawAttendanceSession)
      }
    })
    return () => {
      unsubscribe()
      socketService.leaveBus(busId)
    }
  }, [busId])
}
