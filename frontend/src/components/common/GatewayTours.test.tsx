import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GatewayTours } from './GatewayTours'
import type { Tour } from '../../types/tour.types'
import type { Bus } from '../../types/bus.types'
import type { Seat, SeatStatus } from '../../types/seat.types'

const buildSeat = (seatNumber: number, seatStatus: SeatStatus): Seat => ({
  id: `s${seatNumber}`,
  seatNumber,
  row: 1,
  col: seatNumber,
  seatStatus
})

const buildBus = (id: string, statuses: SeatStatus[]): Bus => ({
  id,
  tourId: 't1',
  busName: `אוטובוס ${id}`,
  description: '',
  pickupPoints: [],
  driverSide: 'left',
  doorPosition: 'front',
  isDefault: false,
  totalSeats: statuses.length,
  seats: statuses.map((s, i) => buildSeat(i + 1, s))
})

const buildTour = (overrides: Partial<Tour> = {}): Tour => ({
  id: 't1',
  title: 'טיול לגולן',
  date: '2026-08-15',
  description: '',
  buses: [],
  createdAt: '2026-08-01',
  ...overrides
})

describe('GatewayTours', () => {
  it('renders one card per tour', () => {
    const tours = [
      buildTour({ id: 't1', title: 'טיול לגולן' }),
      buildTour({ id: 't2', title: 'טיול לים המלח' })
    ]
    render(<GatewayTours tours={tours} onSelectTour={() => {}} />)

    expect(screen.getByText('טיול לגולן')).toBeInTheDocument()
    expect(screen.getByText('טיול לים המלח')).toBeInTheDocument()
    expect(screen.getByText('2 טיולים זמינים')).toBeInTheDocument()
  })

  it('sums available seats across all buses in a tour', () => {
    const tour = buildTour({
      buses: [
        buildBus('b1', ['available', 'available', 'taken']),
        buildBus('b2', ['available', 'pending', 'reserved'])
      ]
    })
    render(<GatewayTours tours={[tour]} onSelectTour={() => {}} />)

    expect(screen.getByText('3 מושבים פנויים')).toBeInTheDocument()
  })

  it('shows the empty state when there are no tours', () => {
    render(<GatewayTours tours={[]} onSelectTour={() => {}} />)
    expect(
      screen.getByText('אין טיולים זמינים במערכת כעת')
    ).toBeInTheDocument()
  })

  it('fires onSelectTour with the tour id when the entry button is clicked', async () => {
    const user = userEvent.setup()
    const onSelectTour = vi.fn()
    const tour = buildTour({ id: 't42', title: 'טיול הצפון' })
    render(<GatewayTours tours={[tour]} onSelectTour={onSelectTour} />)

    await user.click(
      screen.getByRole('button', { name: /בחר מושבים לטיול טיול הצפון/ })
    )

    expect(onSelectTour).toHaveBeenCalledTimes(1)
    expect(onSelectTour).toHaveBeenCalledWith('t42')
  })

  it('renders tour title and description as text, never as HTML (XSS)', () => {
    const tour = buildTour({
      title: '<img src=x onerror="alert(1)">טיול',
      description: '<script>alert(2)</script>הערות'
    })
    const { container } = render(
      <GatewayTours tours={[tour]} onSelectTour={() => {}} />
    )

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(
      screen.getByText('<img src=x onerror="alert(1)">טיול')
    ).toBeInTheDocument()
    expect(
      screen.getByText('<script>alert(2)</script>הערות')
    ).toBeInTheDocument()
  })

  it('exposes no admin-only affordance or route on the gateway list', () => {
    const tour = buildTour({ buses: [buildBus('b1', ['available'])] })
    const { container } = render(
      <GatewayTours tours={[tour]} onSelectTour={() => {}} />
    )

    // The only interactive control is the passenger entry button.
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName(/בחר מושבים לטיול/)

    // No links at all, and nothing pointing at an admin/login route.
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(container.innerHTML).not.toMatch(/admin|login/i)
  })
})
