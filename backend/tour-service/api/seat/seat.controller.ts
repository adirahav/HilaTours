import { Response } from "express"
import { AuthedRequest } from "../auth/auth.middleware"
import * as seatService from "./seat.service"
import { emitSeatUpdate } from "../lib/socket"
import { sendBookingNotification } from "./bookingNotification"

export async function bookings(req: AuthedRequest, res: Response) {
  const seats = await seatService.requestBookings(String(req.params.busId), req.body)
  emitSeatUpdate(String(req.params.busId), seats)
  res.status(200).json(seats)

  // Fire-and-forget: the email is a notification, not part of the booking's
  // contract, so it runs after the response is already sent and a failure
  // here must never affect (or delay) the passenger's booking outcome.
  sendBookingNotification(
    String(req.params.tourId),
    String(req.params.busId),
    seats,
    {
      name: String(req.body?.passengerName || ""),
      phone: req.body?.passengerPhone,
      pickupPointName: req.body?.pickupPointName,
      notes: req.body?.notes,
    },
  ).catch((err) => console.log("[seat.controller] booking notification email failed", err))
}

export async function approve(req: AuthedRequest, res: Response) {
  const seats = await seatService.approveSeats(String(req.params.busId), req.body?.seatIds, req.adminId as string)
  emitSeatUpdate(String(req.params.busId), seats)
  res.status(200).json(seats)
}

export async function cancel(req: AuthedRequest, res: Response) {
  const seats = await seatService.cancelSeats(String(req.params.busId), req.body?.seatIds)
  emitSeatUpdate(String(req.params.busId), seats)
  res.status(200).json(seats)
}

export async function toggleReserve(req: AuthedRequest, res: Response) {
  const seats = await seatService.toggleReserve(String(req.params.busId), req.body?.seatIds, req.adminId as string)
  emitSeatUpdate(String(req.params.busId), seats)
  res.status(200).json(seats)
}

export async function manualAssign(req: AuthedRequest, res: Response) {
  const seats = await seatService.manualAssign(String(req.params.busId), req.body, req.adminId as string)
  emitSeatUpdate(String(req.params.busId), seats)
  res.status(200).json(seats)
}

export async function updateOccupant(req: AuthedRequest, res: Response) {
  const seats = await seatService.updateOccupant(
    String(req.params.busId),
    String(req.body?.seatId),
    req.body,
    req.adminId as string,
  )
  emitSeatUpdate(String(req.params.busId), seats)
  res.status(200).json(seats)
}

export async function swapMove(req: AuthedRequest, res: Response) {
  const seats = await seatService.swapMove(String(req.params.busId), req.body, req.adminId as string)
  emitSeatUpdate(String(req.params.busId), seats)
  res.status(200).json(seats)
}
