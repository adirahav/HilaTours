import { httpService, tourClient } from './http.service'
import { useStore } from '../store/store'
import type { Seat } from '../types/seat.types'
import type { BookingRequest, SeatBookingRequest } from '../types/tour.types'
import { toSeatStatus } from '../lib/tourMapper'

// The backend shape every seat-mutation endpoint actually returns
// (toClientSeat in tour-service/api/lib/clientShape.ts) — NOT the frontend
// Seat shape. It has no seatNumber/row/col (those are a frontend-only
// derived layout concept) and uses `status`/`pickupPointName`, not
// `seatStatus`/`pickupPoint`.
interface RawMutatedSeat {
  id: string
  position?: string
  status?: string
  pickupPointName?: string | null
  passengerName?: string | null
  passengerPhone?: string | null
  notes?: string | null
  updatedAt?: string
}

// approve/cancel/toggle-reserve/swap-move/bookings return only the seat(s)
// they touched; manual-assign returns the bus's full seat list — but never
// the frontend-only seatNumber/row/col fields either way. Always merge by id
// into the already-loaded seats (never blind-replace), keeping the existing
// seat's layout fields and overlaying the mutated ones.
function mergeSeatUpdate(busId: string, updated: RawMutatedSeat[]): void {
  const tours = useStore.getState().tours
  const bus = tours.flatMap((t) => t.buses).find((b) => b.id === busId)
  const existing = bus?.seats ?? []
  const byId = new Map(updated.map((s) => [s.id, s]))

  const merged = existing.map((seat): Seat => {
    const raw = byId.get(seat.id)
    if (!raw) return seat
    return {
      ...seat,
      seatStatus: toSeatStatus(raw.status),
      passengerName: raw.passengerName ?? undefined,
      passengerPhone: raw.passengerPhone ?? undefined,
      pickupPoint: raw.pickupPointName ?? undefined,
      notes: raw.notes ?? undefined,
      updatedAt: raw.updatedAt ?? seat.updatedAt
    }
  })
  useStore.getState().applySeatUpdate(busId, merged)
}

// All seat mutations return updated seats so the caller can re-sync the seat
// map. A 409 from any of these is an expected seat-conflict.
function base(tourId: string, busId: string): string {
  return `/tour/${tourId}/buses/${busId}/seats`
}

export const seatService = {
  // SeatBookingRequest (api-contract) addresses seats by uuid — seatIds, not
  // seatNumber — and requires pickupPointName (no pickupPoint alternate).
  async request(req: SeatBookingRequest): Promise<void> {
    const seats = await httpService.post<RawMutatedSeat[]>(
      tourClient,
      `${base(req.tourId, req.busId)}/bookings`,
      {
        seatIds: req.seatIds,
        passengerName: req.passengerName,
        passengerPhone: req.passengerPhone,
        pickupPointName: req.pickupPointName,
        notes: req.notes
      }
    )
    mergeSeatUpdate(req.busId, seats)
  },

  // approve/cancel/toggle-reserve (SeatApproveRequest etc.) all take
  // `seatIds: string[]` (uuids) — never a seatNumber.
  async approve(tourId: string, busId: string, seatId: string): Promise<void> {
    const seats = await httpService.post<RawMutatedSeat[]>(
      tourClient,
      `${base(tourId, busId)}/approve`,
      { seatIds: [seatId] }
    )
    mergeSeatUpdate(busId, seats)
  },

  async cancel(tourId: string, busId: string, seatId: string): Promise<void> {
    const seats = await httpService.post<RawMutatedSeat[]>(
      tourClient,
      `${base(tourId, busId)}/cancel`,
      { seatIds: [seatId] }
    )
    mergeSeatUpdate(busId, seats)
  },

  async toggleReserve(tourId: string, busId: string, seatId: string): Promise<void> {
    const seats = await httpService.post<RawMutatedSeat[]>(
      tourClient,
      `${base(tourId, busId)}/toggle-reserve`,
      { seatIds: [seatId] }
    )
    mergeSeatUpdate(busId, seats)
  },

  async manualAssign(tourId: string, busId: string, payload: BookingRequest): Promise<void> {
    const seats = await httpService.post<RawMutatedSeat[]>(
      tourClient,
      `${base(tourId, busId)}/manual-assign`,
      payload
    )
    mergeSeatUpdate(busId, seats)
  },

  // swap-move also returns only the two touched seats (vacated/moved, or
  // the swapped pair), not the full bus list.
  async swapMove(tourId: string, busId: string, fromSeat: number, toSeat: number): Promise<void> {
    const seats = await httpService.post<RawMutatedSeat[]>(
      tourClient,
      `${base(tourId, busId)}/swap-move`,
      { fromSeat, toSeat }
    )
    mergeSeatUpdate(busId, seats)
  }
}
