import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PassengerViewPage } from './PassengerViewPage'
import { useStore } from '../store/store'
import { seatService } from '../services/seat.service'
import { tourService } from '../services/tour.service'
import type { Tour } from '../types/tour.types'
import type { Seat } from '../types/seat.types'
import { mapTours, type RawTour } from '../lib/tourMapper'

const navigateMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ tourId: 't1' })
}))

vi.mock('../services/seat.service', () => ({
  seatService: { request: vi.fn() }
}))

vi.mock('../services/tour.service', () => ({
  tourService: { query: vi.fn() }
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

const requestMock = vi.mocked(seatService.request)
const queryMock = vi.mocked(tourService.query)

const buildSeat = (seatNumber: number, row: number, col: number): Seat => ({
  id: `bus1-seat${seatNumber}`,
  seatNumber,
  row,
  col,
  seatStatus: 'available'
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
      pickupPoints: ['תחנה מרכזית'],
      driverSide: 'left',
      doorPosition: 'front',
      isDefault: false,
      totalSeats: 52,
      seats: [buildSeat(1, 1, 1), buildSeat(2, 1, 2), buildSeat(3, 1, 3)]
    }
  ]
})

describe('PassengerViewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockResolvedValue([])
    useStore.setState({ tours: [buildTour()], selectedSeatNumbers: [] })
  })

  it('renders the tour title and seat map', () => {
    render(<PassengerViewPage />)
    expect(screen.getByText('טיול לגולן')).toBeInTheDocument()
    expect(screen.getByText(/מפת מושבים/)).toBeInTheDocument()
  })

  it('submits a booking request and shows the success screen', async () => {
    const user = userEvent.setup()
    requestMock.mockResolvedValueOnce(undefined)
    render(<PassengerViewPage />)

    await user.click(screen.getByRole('button', { name: /מושב 1,/ }))
    await user.type(screen.getByLabelText(/שם מלא/), 'ישראל ישראלי')
    await user.type(screen.getByLabelText(/מספר טלפון/), '0500000000')
    await user.click(
      screen.getByRole('button', { name: 'שלח בקשת שריון מושבים' })
    )

    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
    expect(requestMock.mock.calls[0][0]).toMatchObject({
      tourId: 't1',
      busId: 'bus1',
      seatIds: ['bus1-seat1'],
      passengerName: 'ישראל ישראלי'
    })
    expect(
      await screen.findByText('בקשת השריון התקבלה בהצלחה!')
    ).toBeInTheDocument()
  })

  it('submits successfully with only the name filled in — phone/pickup are optional', async () => {
    const user = userEvent.setup()
    requestMock.mockResolvedValueOnce(undefined)
    render(<PassengerViewPage />)

    await user.click(screen.getByRole('button', { name: /מושב 1,/ }))
    await user.type(screen.getByLabelText(/שם מלא/), 'ישראל ישראלי')
    await user.click(
      screen.getByRole('button', { name: 'שלח בקשת שריון מושבים' })
    )

    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
    expect(requestMock.mock.calls[0][0]).toMatchObject({
      passengerName: 'ישראל ישראלי',
      passengerPhone: ''
    })
  })

  it('shows a conflict message and re-syncs the map on a 409', async () => {
    const user = userEvent.setup()
    requestMock.mockRejectedValueOnce({ response: { status: 409 } })
    render(<PassengerViewPage />)

    await user.click(screen.getByRole('button', { name: /מושב 2,/ }))
    await user.type(screen.getByLabelText(/שם מלא/), 'דנה כהן')
    await user.type(screen.getByLabelText(/מספר טלפון/), '0501111111')
    await user.click(
      screen.getByRole('button', { name: 'שלח בקשת שריון מושבים' })
    )

    await waitFor(() =>
      expect(
        screen.getByText(/חלק מהמושבים שנבחרו כבר נתפסו/)
      ).toBeInTheDocument()
    )
    expect(queryMock).toHaveBeenCalledTimes(1)
  })

  it('blocks submission when no seat is selected', () => {
    render(<PassengerViewPage />)
    const submit = screen.getByRole('button', {
      name: 'שלח בקשת שריון מושבים'
    })
    expect(submit).toBeDisabled()
  })

  // Regression guard for AGE-245: previously GET /tour never returned buses,
  // so the seat map only ever worked against store-seeded mock data. These
  // cases hydrate the store from a realistically-shaped backend response
  // (uuid `id`, string position, status) run through the real mapper.
  describe('with a tour hydrated from a real GET /tour response', () => {
    const rawResponse: RawTour[] = [
      {
        id: 't1',
        name: 'טיול לגולן',
        date: '2026-08-15',
        description: '',
        createdAt: '2026-08-01T00:00:00.000Z',
        buses: [
          {
            id: 'bus1',
            tourId: 't1',
            name: 'אוטובוס 1',
            totalSeats: 52,
            pickupPoints: [{ name: 'תחנה מרכזית', order: 1 }],
            seats: [
              { id: 's1', position: '1A', status: 'available' },
              { id: 's2', position: '1B', status: 'available' },
              { id: 's3', position: '1C', status: 'taken' }
            ]
          }
        ]
      }
    ]

    beforeEach(() => {
      useStore.setState({ tours: mapTours(rawResponse), selectedSeatNumbers: [] })
    })

    it('renders the seat map from the mapped buses[0].seats', () => {
      render(<PassengerViewPage />)
      expect(screen.getByText(/מפת מושבים - אוטובוס 1/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /מושב 1, פנוי/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /מושב 3, תפוס/ })).toBeInTheDocument()
    })

    it('allows selecting a seat and submitting the booking', async () => {
      const user = userEvent.setup()
      requestMock.mockResolvedValueOnce(undefined)
      render(<PassengerViewPage />)

      await user.click(screen.getByRole('button', { name: /מושב 1, פנוי/ }))
      await user.type(screen.getByLabelText(/שם מלא/), 'ישראל ישראלי')
      await user.type(screen.getByLabelText(/מספר טלפון/), '0500000000')
      await user.click(screen.getByRole('button', { name: 'שלח בקשת שריון מושבים' }))

      await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
      expect(requestMock.mock.calls[0][0]).toMatchObject({
        tourId: 't1',
        busId: 'bus1',
        seatIds: ['s1']
      })
    })

    it('exposes the bus pickup points without leaking per-seat PII', () => {
      render(<PassengerViewPage />)
      const bus = useStore.getState().tours[0].buses[0]
      expect(bus.pickupPoints).toEqual(['תחנה מרכזית'])
      bus.seats.forEach((seat) => {
        expect(seat.passengerName).toBeUndefined()
        expect(seat.passengerPhone).toBeUndefined()
        expect(seat.notes).toBeUndefined()
      })
    })
  })
})
