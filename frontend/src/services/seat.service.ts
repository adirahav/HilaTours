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
// Exposed for socket-pushed updates (see hooks/useSeatSocket.ts) — the
// payload broadcast by the backend on every seat mutation has the same
// RawMutatedSeat shape as the REST responses, so the merge logic is shared.
export function applyRemoteSeatUpdate(busId: string, updated: RawMutatedSeat[]): void {
  mergeSeatUpdate(busId, updated)
}

// `stripPii` is for the passenger booking response: the REST reply legitimately
// contains the name/pickup the passenger herself just typed, but the shared
// seat-map store has no notion of "this is my own booking" — anything merged
// in renders identically for every viewer of that store slice (e.g. if she
// navigates back to the map after her success screen, before a reload
// re-fetches through the PII-stripped public endpoint). So the passenger
// flow never merges name/pickup at all, matching what every other passenger
// already sees for that seat (SEV-001 / see socket.service.ts's room split).
function mergeSeatUpdate(busId: string, updated: RawMutatedSeat[], stripPii = false): void {
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
      passengerName: stripPii ? undefined : raw.passengerName ?? undefined,
      passengerPhone: stripPii ? undefined : raw.passengerPhone ?? undefined,
      pickupPoint: stripPii ? undefined : raw.pickupPointName ?? undefined,
      notes: stripPii ? undefined : raw.notes ?? undefined,
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
    mergeSeatUpdate(req.busId, seats, true)
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

  // Edits passenger details on a seat that's already pending/taken (optionally
  // toggling between the two) — never touches an available seat, unlike
  // manualAssign. See .doc/glossary.md's `updateOccupant` entry.
  async updateOccupant(
    tourId: string,
    busId: string,
    seatId: string,
    payload: {
      passengerName: string
      passengerPhone?: string
      pickupPoint?: string
      notes?: string
      status: 'taken' | 'pending'
    }
  ): Promise<void> {
    const seats = await httpService.post<RawMutatedSeat[]>(
      tourClient,
      `${base(tourId, busId)}/update-occupant`,
      { seatId, ...payload }
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
