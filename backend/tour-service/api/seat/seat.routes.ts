import { Router } from "express"
import { requirePermission } from "../auth/auth.middleware"
import { asyncHandler } from "../lib/http"
import * as seat from "./seat.controller"

export const seatRouter = Router()

const base = "/tour/:tourId/buses/:busId/seats"

// Passenger booking — no auth.
seatRouter.post(`${base}/bookings`, asyncHandler(seat.bookings))

// Admin-only seat management — each gated on its own permission key.
seatRouter.post(`${base}/approve`, requirePermission("seat:approve"), asyncHandler(seat.approve))
seatRouter.post(`${base}/cancel`, requirePermission("seat:cancel"), asyncHandler(seat.cancel))
seatRouter.post(
  `${base}/toggle-reserve`,
  requirePermission("seat:toggleReserve"),
  asyncHandler(seat.toggleReserve),
)
seatRouter.post(
  `${base}/manual-assign`,
  requirePermission("seat:manualAssign"),
  asyncHandler(seat.manualAssign),
)
seatRouter.post(
  `${base}/swap-move`,
  requirePermission("seat:swapMove"),
  asyncHandler(seat.swapMove),
)
