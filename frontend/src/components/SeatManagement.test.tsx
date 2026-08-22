import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SeatManagement } from './SeatManagement'
import { useStore } from '../store/store'
import { seatService } from '../services/seat.service'
import type { Tour } from '../types/tour.types'
import type { Seat, SeatStatus } from '../types/seat.types'

vi.mock('../services/seat.service', () => ({
  seatService: {
    approve: vi.fn(),
    cancel: vi.fn(),
    toggleReserve: vi.fn(),
    manualAssign: vi.fn(),
    swapMove: vi.fn()
  }
}))

vi.mock('../services/bus.service', () => ({
  busService: {
    loadWithPii: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

const approveMock = vi.mocked(seatService.approve)
const toggleReserveMock = vi.mocked(seatService.toggleReserve)

const buildSeat = (seatNumber: number, seatStatus: SeatStatus): Seat => ({
  id: `bus1-seat${seatNumber}`,
  seatNumber,
  // col must stay within the 4-column grid (BusMap only renders col 1-4).
  row: Math.ceil(seatNumber / 4),
  col: ((seatNumber - 1) % 4) + 1,
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
      pickupPoints: ['תחנה מרכזית'],
      driverSide: 'left',
      doorPosition: 'front',
      busTypeId: null,
      grid: null,
      isDefault: false,
      totalSeats: 52,
      seats: [
        buildSeat(1, 'available'),
        buildSeat(2, 'pending'),
        buildSeat(3, 'pending'),
        buildSeat(4, 'taken'),
        buildSeat(5, 'reserved')
      ]
    }
  ]
})

describe('SeatManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ tours: [buildTour()], selectedSeatNumbers: [] })
  })

  it('renders the status summary and pending count from store state', () => {
    render(<SeatManagement />)
    // available=1, pending=2, taken=1, reserved=1
    expect(screen.getByText('בקשות ממתינות לאישור (2)')).toBeInTheDocument()
    expect(screen.getByText('סיכום סטטוסים')).toBeInTheDocument()
    const pendingRow = screen.getByText(/ממתינים לאישור/).closest('li')
    expect(pendingRow).not.toBeNull()
    expect(pendingRow).toHaveTextContent('2')
  })

  it('shows the empty pending state when no seat is pending', () => {
    const tour = buildTour()
    tour.buses[0].seats = [buildSeat(1, 'available'), buildSeat(2, 'taken')]
    useStore.setState({ tours: [tour] })
    render(<SeatManagement />)
    expect(
      screen.getByText('אין כעת בקשות ממתינות לאישור לאוטובוס זה.')
    ).toBeInTheDocument()
  })

  it('bulk-approves every pending seat sequentially', async () => {
    const user = userEvent.setup()
    approveMock.mockResolvedValue(undefined)
    render(<SeatManagement />)

    await user.click(
      screen.getByRole('button', { name: /אשר במרוכז את כל הבקשות/ })
    )

    await waitFor(() => expect(approveMock).toHaveBeenCalledTimes(2))
    expect(approveMock).toHaveBeenCalledWith('t1', 'bus1', 'bus1-seat2')
    expect(approveMock).toHaveBeenCalledWith('t1', 'bus1', 'bus1-seat3')
  })

  it('surfaces a seat conflict (409) without crashing during bulk approve', async () => {
    const user = userEvent.setup()
    approveMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ response: { status: 409 } })
    render(<SeatManagement />)

    await user.click(
      screen.getByRole('button', { name: /אשר במרוכז את כל הבקשות/ })
    )

    await waitFor(() => expect(approveMock).toHaveBeenCalledTimes(2))
  })

  it('by default, clicking any seat (including an available one) opens the assign modal', async () => {
    const user = userEvent.setup()
    render(<SeatManagement />)

    await user.click(screen.getByRole('button', { name: /מושב 1,/ }))

    expect(toggleReserveMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // Simulates the 500ms long-press BusMap listens for via pointerdown/up.
  async function longPress(button: HTMLElement) {
    fireEvent.pointerDown(button)
    await new Promise((resolve) => setTimeout(resolve, 600))
    fireEvent.pointerUp(button)
  }

  it('long-press on an available seat opens a quick menu; "שמור" reserves it directly, no modal', async () => {
    toggleReserveMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SeatManagement />)

    await longPress(screen.getByRole('button', { name: /מושב 1,/ }))
    await user.click(screen.getByRole('button', { name: 'שמור' }))

    expect(toggleReserveMock).toHaveBeenCalledWith('t1', 'bus1', 'bus1-seat1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }, 10000)

  it('long-press on a reserved seat opens a quick menu; "שחרור" releases it directly, no modal', async () => {
    toggleReserveMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SeatManagement />)

    await longPress(screen.getByRole('button', { name: /מושב 5,/ }))
    await user.click(screen.getByRole('button', { name: 'שחרור' }))

    expect(toggleReserveMock).toHaveBeenCalledWith('t1', 'bus1', 'bus1-seat5')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }, 10000)

  it('long-press on a pending seat opens a quick menu with approve/cancel, not the modal', async () => {
    render(<SeatManagement />)

    await longPress(screen.getByRole('button', { name: /מושב 2,/ }))

    expect(screen.getByRole('button', { name: 'אישור' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeInTheDocument()
    expect(toggleReserveMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }, 10000)

  it('renders the empty state when there are no tours', () => {
    useStore.setState({ tours: [] })
    render(<SeatManagement />)
    expect(
      screen.getByText('אין טיולים או אוטובוסים קיימים במערכת.')
    ).toBeInTheDocument()
  })

  it('shows a loader (not the empty-state message) while the initial fetch is still in flight', () => {
    useStore.setState({ tours: [] })
    render(<SeatManagement isLoading />)
    expect(screen.getByText('טוען טיולים...')).toBeInTheDocument()
    expect(
      screen.queryByText('אין טיולים או אוטובוסים קיימים במערכת.')
    ).not.toBeInTheDocument()
  })
})
