import { describe, it, expect } from 'vitest'
import { mapSeats, mapAdminSeats, mapBus, mapAdminBus, mapTour, mapTours, type RawTour } from './tourMapper'
import { generateBusSeats } from './busLayoutHelper'

// Realistically-shaped GET /tour response under the uuid identity layer:
// every entity is identified by `id` (a server-generated uuid), never by a
// Mongo `_id` — the backend's toJSON transform strips `_id`/`__v` from every
// response body, including embedded buses and seats.
const TOUR_ID = '1f3b9d2a-6c4e-4a71-9f0c-2b8e5d7a1c33'
const BUS_ID = '7a2c1e40-5b93-4d18-8e6f-0a4d9c3b2e51'
const SEAT_IDS = [
  'c0d4b8f2-31a7-4e65-9b02-6f8a7c1d4e90',
  'd1e5c9a3-42b8-4f76-8c13-7a9b8d2e5f01',
  'e2f6dab4-53c9-4087-9d24-8bac9e3f6012',
  'f3a7ebc5-64da-4198-ae35-9cbdaf407123'
]

const rawTour = (): RawTour => ({
  id: TOUR_ID,
  name: 'טיול לגולן',
  date: '2026-08-15',
  description: 'סוף שבוע בצפון',
  createdAt: '2026-08-01T00:00:00.000Z',
  buses: [
    {
      id: BUS_ID,
      tourId: TOUR_ID,
      name: 'אוטובוס 1',
      totalSeats: 52,
      driverSide: 'left',
      doorPosition: 'front',
      pickupPoints: [
        { name: 'תחנה מרכזית', order: 1 },
        { name: 'צומת גולני', order: 2 }
      ],
      seats: [
        { id: SEAT_IDS[0], position: '1A', status: 'available' },
        { id: SEAT_IDS[1], position: '1B', status: 'pending' },
        { id: SEAT_IDS[2], position: '1C', status: 'taken' },
        { id: SEAT_IDS[3], position: '1D', status: 'reserved' }
      ]
    }
  ]
})

describe('tourMapper', () => {
  describe('mapTour', () => {
    it('maps the uuid id/name onto the frontend id/title shape', () => {
      const tour = mapTour(rawTour())
      expect(tour.id).toBe(TOUR_ID)
      expect(tour.title).toBe('טיול לגולן')
      expect(tour.date).toBe('2026-08-15')
      expect(tour.createdAt).toBe('2026-08-01T00:00:00.000Z')
    })

    it('embeds buses with their seats', () => {
      const tour = mapTour(rawTour())
      expect(tour.buses).toHaveLength(1)
      expect(tour.buses[0].seats).toHaveLength(4)
    })

    it('falls back to an empty buses list when the backend omits it', () => {
      const tour = mapTour({ id: TOUR_ID, name: 'ללא אוטובוסים' })
      expect(tour.buses).toEqual([])
    })

    it('maps a list of tours', () => {
      expect(mapTours([rawTour(), rawTour()])).toHaveLength(2)
      expect(mapTours(undefined)).toEqual([])
    })
  })

  describe('mapBus', () => {
    it('maps the uuid id/name and flattens PickupPoint objects to strings', () => {
      const bus = mapBus(rawTour().buses![0])
      expect(bus.id).toBe(BUS_ID)
      expect(bus.tourId).toBe(TOUR_ID)
      expect(bus.busName).toBe('אוטובוס 1')
      expect(bus.totalSeats).toBe(52)
      expect(bus.pickupPoints).toEqual(['תחנה מרכזית', 'צומת גולני'])
    })

    it('accepts pickupPoints already sent as plain strings', () => {
      const bus = mapBus({ id: BUS_ID, pickupPoints: ['תל אביב'] })
      expect(bus.pickupPoints).toEqual(['תל אביב'])
    })

    it('falls back to the seat count when totalSeats is missing', () => {
      const bus = mapBus({
        id: BUS_ID,
        seats: [
          { id: SEAT_IDS[0], position: '1A', status: 'available' },
          { id: SEAT_IDS[1], position: '1B', status: 'available' }
        ]
      })
      expect(bus.totalSeats).toBe(2)
    })

    it('defaults driverSide/doorPosition when absent or invalid', () => {
      const bus = mapBus({ id: BUS_ID, driverSide: 'sideways' })
      expect(bus.driverSide).toBe('left')
      expect(bus.doorPosition).toBe('front')
    })
  })

  describe('mapSeats', () => {
    it('maps uuid id/position/status onto id/seatNumber/row/col/seatStatus', () => {
      const seats = mapSeats(rawTour().buses![0].seats, 52)
      expect(seats.map((s) => s.id)).toEqual(SEAT_IDS)
      expect(seats.map((s) => s.seatNumber)).toEqual([1, 2, 3, 4])
      expect(seats.map((s) => s.seatStatus)).toEqual([
        'available',
        'pending',
        'taken',
        'reserved'
      ])
    })

    it('derives row/col from the canonical bus layout', () => {
      const seats = mapSeats(rawTour().buses![0].seats, 52)
      const layout = generateBusSeats(52)
      seats.forEach((seat) => {
        const expected = layout.find((l) => l.seatNumber === seat.seatNumber)!
        expect({ row: seat.row, col: seat.col }).toEqual({
          row: expected.row,
          col: expected.col
        })
      })
    })

    it('orders positions naturally so "10A" comes after "2A"', () => {
      const seats = mapSeats(
        [
          { id: 'x', position: '10A', status: 'available' },
          { id: 'y', position: '2A', status: 'available' },
          { id: 'z', position: '1A', status: 'available' }
        ],
        52
      )
      // seatNumber is the 1-based index into position-sorted seats — the same
      // convention the backend uses to resolve a seatNumber back to a seat id.
      expect(seats.map((s) => s.id)).toEqual(['z', 'y', 'x'])
      expect(seats.map((s) => s.seatNumber)).toEqual([1, 2, 3])
    })

    it('prefers an explicit backend seatNumber over the derived index', () => {
      const seats = mapSeats([{ id: 'a', position: '9Z', seatNumber: 42 }], 52)
      expect(seats[0].seatNumber).toBe(42)
    })

    it('coerces an unknown status to available', () => {
      const seats = mapSeats([{ id: 'a', position: '1A', status: 'weird' }], 52)
      expect(seats[0].seatStatus).toBe('available')
    })

    it('returns an empty array for missing/empty seats', () => {
      expect(mapSeats(undefined, 52)).toEqual([])
      expect(mapSeats([], 52)).toEqual([])
    })

    // Guards the SEV-001 regression class: GET /tour is public, so no
    // passenger PII may ever reach the store — even if the backend leaks it.
    it('never surfaces passenger PII even if the backend over-returns', () => {
      const leaky = {
        id: SEAT_IDS[0],
        position: '1A',
        status: 'taken',
        passengerName: 'ישראל ישראלי',
        passengerPhone: '0500000000',
        notes: 'סודי',
        pickupPointName: 'תחנה מרכזית',
        requestedAt: '2026-08-01T00:00:00.000Z',
        approvedAt: '2026-08-02T00:00:00.000Z',
        assignedBy: 'admin1'
      }
      const [seat] = mapSeats([leaky], 52)

      expect(seat.seatStatus).toBe('taken')
      expect(Object.keys(seat).sort()).toEqual(
        ['col', 'id', 'row', 'seatNumber', 'seatStatus'].sort()
      )
      expect(JSON.stringify(seat)).not.toContain('ישראל ישראלי')
      expect(JSON.stringify(seat)).not.toContain('0500000000')
    })
  })

  // mapAdminSeats/mapAdminBus are only ever wired to the authenticated
  // single-bus route (GET /tour/:tourId/buses/:busId) — unlike mapSeats,
  // they're expected to surface PII, since that route is meant to.
  describe('mapAdminSeats / mapAdminBus', () => {
    const authenticatedSeat = {
      id: SEAT_IDS[0],
      position: '1A',
      status: 'taken',
      passengerName: 'ישראל ישראלי',
      passengerPhone: '0500000000',
      notes: 'סודי',
      pickupPointName: 'תחנה מרכזית'
    }

    it('maps passengerName/passengerPhone/pickupPointName/notes onto the frontend Seat shape', () => {
      const [seat] = mapAdminSeats([authenticatedSeat], 52)
      expect(seat.passengerName).toBe('ישראל ישראלי')
      expect(seat.passengerPhone).toBe('0500000000')
      expect(seat.pickupPoint).toBe('תחנה מרכזית')
      expect(seat.notes).toBe('סודי')
    })

    it('mapAdminBus embeds mapAdminSeats results (PII included)', () => {
      const bus = mapAdminBus({ id: BUS_ID, totalSeats: 52, seats: [authenticatedSeat] })
      expect(bus.seats[0].passengerName).toBe('ישראל ישראלי')
    })

    it('mapSeats (public) still never surfaces PII from the same raw payload', () => {
      const [seat] = mapSeats([authenticatedSeat], 52)
      expect(JSON.stringify(seat)).not.toContain('ישראל ישראלי')
    })
  })

  // The backend now strips `_id` from every response, so these cases should
  // never occur in practice. The `_id` fallback is retained as defensive
  // backward-compat during rollout (plan 028 Open Question 4) — but the uuid
  // `id` must always win, so a mid-rollout response carrying both can never
  // leak a Mongo ObjectId into the frontend's public identity.
  describe('legacy `_id` tolerance', () => {
    it('prefers the uuid `id` over a legacy `_id` when both are present', () => {
      const tour = mapTour({
        id: TOUR_ID,
        _id: '507f1f77bcf86cd799439011',
        name: 'טיול',
        buses: [
          {
            id: BUS_ID,
            _id: '507f1f77bcf86cd799439012',
            seats: [
              { id: SEAT_IDS[0], _id: '507f1f77bcf86cd799439013', position: '1A' }
            ]
          }
        ]
      })

      expect(tour.id).toBe(TOUR_ID)
      expect(tour.buses[0].id).toBe(BUS_ID)
      expect(tour.buses[0].seats[0].id).toBe(SEAT_IDS[0])
      expect(JSON.stringify(tour)).not.toContain('507f1f77bcf86cd7994390')
    })

    it('still maps a legacy `_id`-only response rather than dropping the id', () => {
      const tour = mapTour({
        _id: 't-legacy',
        name: 'ישן',
        buses: [{ _id: 'bus-legacy', seats: [{ _id: 'seat-legacy', position: '1A' }] }]
      })

      expect(tour.id).toBe('t-legacy')
      expect(tour.buses[0].id).toBe('bus-legacy')
      expect(tour.buses[0].seats[0].id).toBe('seat-legacy')
    })
  })
})
