import { io, type Socket } from 'socket.io-client'
import { useStore } from '../store/store'

// Single socket.io connection to the tour-service, shared by the admin and
// passenger views. Components join/leave a per-bus room while mounted so
// seat mutations broadcast from seat.controller.ts (see backend
// api/lib/socket.ts) reach every client currently looking at that bus.
let socket: Socket | undefined

// Bus rooms this tab currently wants live updates for. Room membership is
// per-connection server-side state — it is NOT preserved across a reconnect
// (a network blip, the backend restarting/sleeping, a phone locking its
// screen). Without rejoining on 'connect', a still-mounted component keeps
// listening but silently stops receiving broadcasts until something else
// (e.g. remounting) forces a fresh `bus:join` — seat/passenger changes then
// only "catch up" whenever a full REST refetch happens to run, not live.
const activeBusIds = new Set<string>()

// VITE_TOUR_API_URL includes the REST API path (e.g. ".../tour-service/api")
// — passing that whole string to io() makes socket.io treat the path as a
// namespace instead of connecting to the default "/" namespace the server
// listens on, so the connection silently lands nowhere. Only the origin is
// relevant for the socket.io handshake.
function socketOrigin(): string {
  const url = import.meta.env.VITE_TOUR_API_URL ?? ''
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

function getSocket(): Socket {
  if (!socket) {
    socket = io(socketOrigin(), {
      autoConnect: true,
      transports: ['websocket', 'polling']
    })
    socket.on('connect', () => {
      const token = useStore.getState().authToken
      activeBusIds.forEach((busId) => socket!.emit('bus:join', { busId, token }))
    })
  }
  return socket
}

export interface SeatUpdatePayload {
  busId: string
  seats: unknown[]
}

// Attendance broadcasts carry passenger PII (name/phone/pickup point) in
// `session.records`, so the backend emits them to the ADMIN room only — never
// to the public, PII-stripped room (SEV-001). `deletedSessionId` is set
// instead of `session` when a session was removed on another device.
export interface AttendanceUpdatePayload {
  busId: string
  session?: unknown
  deletedSessionId?: string
}

export const socketService = {
  // The server only puts the socket in the PII-bearing admin room if this
  // token verifies and grants "bus:view" (see backend api/lib/socket.ts) —
  // an anonymous passenger simply has no token here and lands in the public,
  // PII-stripped room instead.
  joinBus(busId: string): void {
    activeBusIds.add(busId)
    const token = useStore.getState().authToken
    getSocket().emit('bus:join', { busId, token })
  },
  leaveBus(busId: string): void {
    activeBusIds.delete(busId)
    getSocket().emit('bus:leave', busId)
  },
  onSeatUpdate(handler: (payload: SeatUpdatePayload) => void): () => void {
    const s = getSocket()
    s.on('seat:update', handler)
    return () => s.off('seat:update', handler)
  },
  // Reuses the same per-bus room membership established by joinBus() — a
  // client that never got into the admin room simply never receives these.
  onAttendanceUpdate(handler: (payload: AttendanceUpdatePayload) => void): () => void {
    const s = getSocket()
    s.on('attendance:update', handler)
    return () => s.off('attendance:update', handler)
  }
}
