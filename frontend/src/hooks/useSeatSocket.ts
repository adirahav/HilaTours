import { useEffect } from 'react'
import { socketService } from '../services/socket.service'
import { applyRemoteSeatUpdate } from '../services/seat.service'

// Subscribes to real-time seat-status updates for a bus (admin and
// passenger views both use this, per SeatManagement.tsx / PassengerViewPage.tsx).
// Joins the bus's socket room on mount and leaves it on unmount/bus change,
// so a client only receives broadcasts for the bus it's currently viewing.
export function useSeatSocket(busId: string | undefined): void {
  useEffect(() => {
    if (!busId) return
    socketService.joinBus(busId)
    const unsubscribe = socketService.onSeatUpdate((payload) => {
      if (payload.busId !== busId) return
      applyRemoteSeatUpdate(busId, payload.seats as Parameters<typeof applyRemoteSeatUpdate>[1])
    })
    return () => {
      unsubscribe()
      socketService.leaveBus(busId)
    }
  }, [busId])
}
