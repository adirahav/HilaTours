import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BusMap } from './BusMap'
import { generateBusSeats } from '../../lib/busLayoutHelper'
import type { Seat, SeatStatus } from '../../types/seat.types'

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn()
}))

vi.mock('sonner', () => ({ toast: toastMock }))

const buildSeat = (seatNumber: number, seatStatus: SeatStatus, extra: Partial<Seat> = {}): Seat => ({
  id: 's' + seatNumber,
  seatNumber,
  row: Math.ceil(seatNumber / 4),
  col: ((seatNumber - 1) % 4) + 1,
  seatStatus,
  ...extra
})

describe('BusMap', () => {
  beforeEach(() => {
    toastMock.error.mockClear()
    toastMock.info.mockClear()
  })

  it('renders a labelled button for every seat', () => {
    const seats = generateBusSeats(50)
    render(
      <BusMap
        seats={seats}
        totalSeats={50}
        selectedSeatNumbers={[]}
        onToggleSelectSeat={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /מושב 1,/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /מושב 50,/ })).toBeInTheDocument()
  })

  it('exposes each status through a non-color aria-label', () => {
    const seats = [
      buildSeat(1, 'available'),
      buildSeat(2, 'pending'),
      buildSeat(3, 'taken'),
      buildSeat(4, 'reserved')
    ]
    render(
      <BusMap seats={seats} totalSeats={9} selectedSeatNumbers={[]} onToggleSelectSeat={() => {}} />
    )
    expect(screen.getByRole('button', { name: 'מושב 1, פנוי' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'מושב 2, ממתין לאישור' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'מושב 3, תפוס' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /מושב 4, שמור/ })).toBeInTheDocument()
  })

  it('marks selected seats with aria-pressed', () => {
    const seats = [buildSeat(1, 'available')]
    render(
      <BusMap seats={seats} totalSeats={6} selectedSeatNumbers={[1]} onToggleSelectSeat={() => {}} />
    )
    expect(screen.getByRole('button', { name: /מושב 1/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('fires onToggleSelectSeat when an available seat is clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const seats = [buildSeat(1, 'available')]
    render(
      <BusMap seats={seats} totalSeats={6} selectedSeatNumbers={[]} onToggleSelectSeat={onToggle} />
    )
    await user.click(screen.getByRole('button', { name: /מושב 1/ }))
    expect(onToggle).toHaveBeenCalledWith(1)
  })

  it('does not select a reserved seat and shows no toast — the button is disabled', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const seats = [buildSeat(1, 'reserved')]
    render(
      <BusMap seats={seats} totalSeats={6} selectedSeatNumbers={[]} onToggleSelectSeat={onToggle} />
    )
    const seatButton = screen.getByRole('button', { name: /מושב 1/ })
    expect(seatButton).toBeDisabled()
    await user.click(seatButton)
    expect(onToggle).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('calls onAdminClickSeat in admin mode instead of selecting', async () => {
    const user = userEvent.setup()
    const onAdminClick = vi.fn()
    const onToggle = vi.fn()
    const seats = [buildSeat(1, 'available')]
    render(
      <BusMap
        seats={seats}
        totalSeats={6}
        selectedSeatNumbers={[]}
        onToggleSelectSeat={onToggle}
        isAdminMode
        onAdminClickSeat={onAdminClick}
      />
    )
    await user.click(screen.getByRole('button', { name: /מושב 1/ }))
    expect(onAdminClick).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('shows the passenger name on an occupied seat, plus a "no pickup point" warning when missing', () => {
    const seats = [
      buildSeat(1, 'taken', { passengerName: 'ישראל ישראלי' }),
      buildSeat(2, 'taken', { passengerName: 'דנה כהן', pickupPoint: 'תל אביב' })
    ]
    render(
      <BusMap seats={seats} totalSeats={6} selectedSeatNumbers={[]} onToggleSelectSeat={() => {}} />
    )
    expect(screen.getByText('ישראל ישראלי')).toBeInTheDocument()
    // Exactly one warning badge — seat 2 has a pickup point, seat 1 doesn't.
    expect(screen.getAllByTitle('אזהרה: לא נבחרה תחנת איסוף')).toHaveLength(1)
    expect(screen.getByText('דנה כהן')).toBeInTheDocument()
  })

  it('never shows a name or pickup warning on an available seat', () => {
    const seats = [buildSeat(3, 'available')]
    render(
      <BusMap seats={seats} totalSeats={6} selectedSeatNumbers={[]} onToggleSelectSeat={() => {}} />
    )
    expect(screen.queryByTitle('אזהרה: לא נבחרה תחנת איסוף')).not.toBeInTheDocument()
  })

  it('moves a seat via the click-based move mode (touch fallback)', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    const seats = [buildSeat(1, 'taken'), buildSeat(2, 'available')]
    render(
      <BusMap
        seats={seats}
        totalSeats={6}
        selectedSeatNumbers={[]}
        onToggleSelectSeat={() => {}}
        isAdminMode
        onAdminClickSeat={() => {}}
        onMoveSeat={onMove}
      />
    )
    await user.click(screen.getByRole('button', { name: /מצב העברה/ }))
    await user.click(screen.getByRole('button', { name: /מושב 1/ }))
    await user.click(screen.getByRole('button', { name: /מושב 2/ }))
    expect(onMove).toHaveBeenCalledWith(1, 2)
  })
})
