import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BusMap } from './BusMap'
import { generateBusSeats } from '../../lib/busLayoutHelper'
import type { Seat, SeatStatus } from '../../types/seat.types'
import type { BusGrid } from '../../types/bus.types'

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

  // The reported bug (2026-08-22): a mini-bus BusType whose back row is
  // configured with a gap in the middle rendered as packed consecutive seats.
  // With the live-joined grid supplied, the bench must be laid out by `col`
  // over the template's declared width, leaving the disabled slot blank.
  describe('BusType-derived grid', () => {
    // 4 standard rows + a 4-wide bench (row 5) whose col 3 is disabled, so
    // the bench holds seats at cols 1, 2 and 4 only.
    const miniBusGrid: BusGrid = {
      standardRowsCount: 4,
      doorRow: null,
      backRowSeatsCount: 4,
      disabledSeatSlots: ['5-3']
    }
    const benchSeats: Seat[] = [
      { id: 'b4', seatNumber: 14, row: 5, col: 4, seatStatus: 'available' },
      { id: 'b2', seatNumber: 15, row: 5, col: 2, seatStatus: 'available' },
      { id: 'b1', seatNumber: 16, row: 5, col: 1, seatStatus: 'available' }
    ]

    const renderBench = (grid = miniBusGrid, seats = benchSeats) =>
      render(
        <BusMap
          seats={seats}
          totalSeats={16}
          grid={grid}
          selectedSeatNumbers={[]}
          onToggleSelectSeat={() => {}}
        />
      )

    it('leaves the disabled mid-bench slot empty instead of packing seats together', () => {
      renderBench()
      const bench = screen.getByRole('group', { name: 'ספסל אחורי' })
      const cells = Array.from(bench.children)

      // The bench is as wide as the template says, not the hardcoded 5.
      expect(cells).toHaveLength(4)
      // Cols 1, 2 and 4 hold seats; col 3 — the gap — holds nothing.
      expect(cells[0].querySelector('button')).toHaveAccessibleName(/מושב 16/)
      expect(cells[1].querySelector('button')).toHaveAccessibleName(/מושב 15/)
      expect(cells[2].querySelector('button')).toBeNull()
      expect(cells[3].querySelector('button')).toHaveAccessibleName(/מושב 14/)
    })

    it('renders bench seats in the bench, never among the standard rows', () => {
      renderBench()
      const bench = screen.getByRole('group', { name: 'ספסל אחורי' })
      benchSeats.forEach((seat) => {
        expect(bench).toContainElement(
          screen.getByRole('button', { name: new RegExp('מושב ' + seat.seatNumber + ',') })
        )
      })
    })

    it("puts the door on the template's row, not the fixed fleet's row 8", () => {
      renderBench({ ...miniBusGrid, doorRow: 3 })
      const door = screen.getByTitle('דלת אחורית')
      expect(door).toBeInTheDocument()
      // Row 3 is the door row, so its right-side seat slots are the doorway.
      expect(screen.queryByRole('button', { name: /מושב 99/ })).not.toBeInTheDocument()
    })

    it('renders no door at all when the template declares none', () => {
      renderBench()
      expect(screen.queryByTitle('דלת אחורית')).not.toBeInTheDocument()
    })

    it('still renders a row whose slots are all disabled, preserving the vertical gap', () => {
      renderBench(miniBusGrid, [
        { id: 'a', seatNumber: 1, row: 1, col: 4, seatStatus: 'available' },
        { id: 'b', seatNumber: 2, row: 4, col: 4, seatStatus: 'available' }
      ])
      // All 4 declared standard rows exist even though rows 2-3 hold no seats.
      ;[1, 2, 3, 4].forEach((rowNum) => {
        expect(screen.getByRole('group', { name: 'שורה ' + rowNum })).toBeInTheDocument()
      })
      expect(screen.queryByRole('group', { name: 'שורה 5' })).not.toBeInTheDocument()
    })

    // Regression guard: a manually-configured bus (no template) must render
    // exactly as it did before this fix.
    it('keeps the fixed 5-wide bench and row-8 door for a bus with no template', () => {
      render(
        <BusMap
          seats={generateBusSeats(55)}
          totalSeats={55}
          selectedSeatNumbers={[]}
          onToggleSelectSeat={() => {}}
        />
      )
      expect(screen.getByRole('group', { name: 'ספסל אחורי' }).children).toHaveLength(5)
      expect(screen.getByTitle('דלת אחורית')).toBeInTheDocument()
    })
  })
})
