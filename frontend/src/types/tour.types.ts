import type { Bus } from './bus.types'

export interface Tour {
  id: string
  title: string // e.g. "טיול יומיים לגולן - אוגוסט 2026"
  date: string // ISO date, e.g. "2026-08-15"
  description: string
  buses: Bus[]
  createdAt: string
}

// Admin manual-assign payload (F7, SeatManualAssignRequest) — seatNumbers/
// pickupPoint are the contract's explicitly-accepted alternate field names
// for this endpoint only (see api-contract.tour-service.yaml). Not used for
// the passenger booking request — that's SeatBookingRequest below, which the
// contract requires seatIds/pickupPointName for instead.
export interface BookingRequest {
  tourId: string
  busId: string
  seatNumbers: number[]
  passengerName: string
  passengerPhone: string
  pickupPoint: string
  notes?: string
  // Optional target status for admin manual-assign (F7).
  status?: 'taken' | 'pending'
}

// Passenger seat-booking request (SeatBookingRequest) — POST .../seats/bookings.
// Addresses seats by uuid (`seatIds`), not seatNumber, and requires
// `pickupPointName` (no `pickupPoint` alternate accepted here, unlike
// manual-assign).
export interface SeatBookingRequest {
  tourId: string
  busId: string
  seatIds: string[]
  passengerName: string
  passengerPhone: string
  pickupPointName: string
  notes?: string
}