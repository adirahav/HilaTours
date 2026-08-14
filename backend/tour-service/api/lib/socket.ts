import type { Server as HttpServer } from "http"
import { Server as SocketIOServer } from "socket.io"
import jwt from "jsonwebtoken"
import { resolvePermissions } from "../auth/permissions"

// Single socket.io server instance for the tour-service. Seat mutations are
// broadcast to per-bus rooms so admin and passenger clients viewing the same
// bus stay in sync without polling.
//
// Mirrors the REST PII split (SEV-001): every socket joins the PUBLIC room
// and gets only {id, position, status}. A socket additionally joins the
// ADMIN room — and gets the full seat record incl. passengerName/pickupPoint
// — only if "bus:join" carries a JWT that verifies and grants "bus:view",
// the same permission the authenticated single-bus REST route requires.
let io: SocketIOServer | undefined

interface ClientSeat {
  id: string
  position?: string
  status?: string
  [key: string]: unknown
}

function isAuthorizedAdmin(token: unknown): boolean {
  if (typeof token !== "string" || !token) return false
  const secret = process.env.JWT_SECRET
  if (!secret) return false
  try {
    const payload = jwt.verify(token, secret)
    return resolvePermissions(payload).has("bus:view")
  } catch {
    return false
  }
}

function toPublicSeat(seat: ClientSeat) {
  return { id: seat.id, position: seat.position, status: seat.status }
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || "http://localhost:5173" },
  })

  io.on("connection", (socket) => {
    socket.on("bus:join", (payload: unknown) => {
      const { busId, token } =
        typeof payload === "string" ? { busId: payload, token: undefined } : ((payload as any) ?? {})
      if (typeof busId !== "string" || !busId) return
      // A socket joins exactly one of the two rooms — never both — so an
      // authorized admin socket is never also a member of the public room
      // and doesn't receive (and overwrite its store with) the stripped
      // broadcast alongside the full one.
      socket.join(isAuthorizedAdmin(token) ? adminRoom(busId) : publicRoom(busId))
    })
    socket.on("bus:leave", (payload: unknown) => {
      const busId = typeof payload === "string" ? payload : (payload as any)?.busId
      if (typeof busId !== "string" || !busId) return
      socket.leave(publicRoom(busId))
      socket.leave(adminRoom(busId))
    })
  })

  return io
}

function publicRoom(busUuid: string): string {
  return `bus:${busUuid}`
}

function adminRoom(busUuid: string): string {
  return `bus:${busUuid}:admin`
}

/**
 * Broadcasts updated seats for a bus. Admin sockets (verified "bus:view" JWT
 * on join) receive the full seat records; every other socket receives only
 * the PII-free projection — never passengerName/passengerPhone/notes/
 * pickupPointName, matching the public REST seat shape.
 */
export function emitSeatUpdate(busUuid: string, seats: ClientSeat[]): void {
  if (!io) return
  io.to(adminRoom(busUuid)).emit("seat:update", { busId: busUuid, seats })
  io.to(publicRoom(busUuid)).emit("seat:update", { busId: busUuid, seats: seats.map(toPublicSeat) })
}
