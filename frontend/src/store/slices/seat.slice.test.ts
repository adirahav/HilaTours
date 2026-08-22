import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store'
import type { Tour } from '../../types/tour.types'
import type { Seat } from '../../types/seat.types'

const buildSeat = (seatNumber: number, seatStatus: Seat['seatStatus']): Seat => ({
  id: `bus1-seat${seatNumber}`,
  seatNumber,
  row: 1,
  col: seatNumber,
  seatStatus
})

const buildTour = (): Tour => ({
  id: 't1',
  title: 'טיול לגולן',
  date: '2026-08-15',
  description: '',
  createdAt: '2026-08-01',
  buses: [
    {
      id: 'bus1',
      tourId: 't1',
      busName: 'אוטובוס 1',
      description: '',
      pickupPoints: [],
      driverSide: 'left',
      doorPosition: 'front',
      busTypeId: null,
      grid: null,
      isDefault: false,
      totalSeats: 52,
      seats: [buildSeat(1, 'available'), buildSeat(2, 'available')]
    }
  ]
})

describe('seat slice - selection', () => {
  beforeEach(() => {
    useStore.getState().clearSeatSelection()
  })

  it('toggles a seat number into the selection', () => {
    useStore.getState().toggleSeatSelection(12)
    expect(useStore.getState().selectedSeatNumbers).toEqual([12])
  })

  it('toggles a seat number back out when selected twice', () => {
    useStore.getState().toggleSeatSelection(12)
    useStore.getState().toggleSeatSelection(12)
    expect(useStore.getState().selectedSeatNumbers).toEqual([])
  })

  it('clears all selected seats', () => {
    useStore.getState().toggleSeatSelection(1)
    useStore.getState().toggleSeatSelection(2)
    useStore.getState().clearSeatSelection()
    expect(useStore.getState().selectedSeatNumbers).toEqual([])
  })
})

describe('seat slice - applySeatUpdate', () => {
  beforeEach(() => {
    useStore.setState({ tours: [buildTour()] })
  })

  it('replaces the seat list of the matching bus', () => {
    const freshSeats = [buildSeat(1, 'pending'), buildSeat(2, 'pending')]
    useStore.getState().applySeatUpdate('bus1', freshSeats)

    const bus = useStore.getState().tours[0].buses[0]
    expect(bus.seats.map((s) => s.seatStatus)).toEqual(['pending', 'pending'])
  })

  it('leaves other buses untouched', () => {
    const before = useStore.getState().tours[0].buses[0].seats
    useStore.getState().applySeatUpdate('bus-unknown', [buildSeat(9, 'taken')])
    expect(useStore.getState().tours[0].buses[0].seats).toEqual(before)
  })
})
