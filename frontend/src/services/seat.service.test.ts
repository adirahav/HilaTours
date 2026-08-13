import { describe, it, expect, vi, beforeEach } from 'vitest'
import { httpService } from './http.service'
import { seatService } from './seat.service'
import { useStore } from '../store/store'
import type { Tour } from '../types/tour.types'

vi.mock('./http.service', () => ({
  tourClient: {},
  httpService: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn()
  }
}))

const postMock = vi.mocked(httpService.post)

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
      isDefault: false,
      totalSeats: 2,
      seats: [
        { id: 'seat-a', seatNumber: 1, row: 1, col: 1, seatStatus: 'available' },
        { id: 'seat-b', seatNumber: 2, row: 1, col: 2, seatStatus: 'available' }
      ]
    }
  ]
})

describe('seatService merges the backend response shape correctly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ tours: [buildTour()] })
  })

  it('toggleReserve: overlays seatStatus from the raw `status` field, keeps seatNumber/row/col, and never wipes the other seat', async () => {
    // Real backend shape (toClientSeat): {id, position, status, ...} — no
    // seatNumber/row/col/seatStatus at all.
    postMock.mockResolvedValueOnce([{ id: 'seat-a', position: '1', status: 'reserved' }])

    await seatService.toggleReserve('t1', 'bus1', 'seat-a')

    const seats = useStore.getState().tours[0].buses[0].seats
    expect(seats).toHaveLength(2)
    const a = seats.find((s) => s.id === 'seat-a')!
    expect(a.seatStatus).toBe('reserved')
    expect(a.seatNumber).toBe(1)
    expect(a.row).toBe(1)
    expect(a.col).toBe(1)
    // The untouched seat must still be present, unmodified.
    const b = seats.find((s) => s.id === 'seat-b')!
    expect(b.seatStatus).toBe('available')
  })

  it('approve: maps pickupPointName -> pickupPoint and passengerName/passengerPhone through', async () => {
    postMock.mockResolvedValueOnce([
      {
        id: 'seat-a',
        status: 'taken',
        pickupPointName: 'תחנה מרכזית',
        passengerName: 'דנה כהן',
        passengerPhone: '0501112222'
      }
    ])

    await seatService.approve('t1', 'bus1', 'seat-a')

    const a = useStore.getState().tours[0].buses[0].seats.find((s) => s.id === 'seat-a')!
    expect(a.seatStatus).toBe('taken')
    expect(a.pickupPoint).toBe('תחנה מרכזית')
    expect(a.passengerName).toBe('דנה כהן')
    expect(a.passengerPhone).toBe('0501112222')
  })

  it('cancel: clears passenger fields back to undefined from a null response', async () => {
    useStore.setState((state) => ({
      tours: state.tours.map((t) => ({
        ...t,
        buses: t.buses.map((b) => ({
          ...b,
          seats: b.seats.map((s) =>
            s.id === 'seat-a'
              ? { ...s, seatStatus: 'taken' as const, passengerName: 'דנה כהן' }
              : s
          )
        }))
      }))
    }))
    postMock.mockResolvedValueOnce([
      { id: 'seat-a', status: 'available', passengerName: null, pickupPointName: null }
    ])

    await seatService.cancel('t1', 'bus1', 'seat-a')

    const a = useStore.getState().tours[0].buses[0].seats.find((s) => s.id === 'seat-a')!
    expect(a.seatStatus).toBe('available')
    expect(a.passengerName).toBeUndefined()
  })

  it('an unresolvable raw status falls back to "available" rather than storing garbage', async () => {
    postMock.mockResolvedValueOnce([{ id: 'seat-a', status: 'not-a-real-status' }])
    await seatService.toggleReserve('t1', 'bus1', 'seat-a')
    const a = useStore.getState().tours[0].buses[0].seats.find((s) => s.id === 'seat-a')!
    expect(a.seatStatus).toBe('available')
  })
})
