import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TourManagement } from './TourManagement'
import type { Tour } from '../types/tour.types'
import type { Seat, SeatStatus } from '../types/seat.types'

const buildSeat = (seatNumber: number, seatStatus: SeatStatus): Seat => ({
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
  description: 'תיאור',
  createdAt: '2026-08-01',
  buses: [
    {
      id: 'bus1',
      tourId: 't1',
      busName: 'אוטובוס ראשי',
      description: 'מרכז',
      pickupPoints: ['תל אביב', 'חיפה'],
      driverSide: 'left',
      doorPosition: 'front',
      busTypeId: null,
      grid: null,
      isDefault: true,
      totalSeats: 52,
      seats: [
        buildSeat(1, 'available'),
        buildSeat(2, 'available'),
        buildSeat(3, 'pending'),
        buildSeat(4, 'taken')
      ]
    },
    {
      id: 'bus2',
      tourId: 't1',
      busName: 'אוטובוס משני',
      description: 'צפון',
      pickupPoints: ['נתניה'],
      driverSide: 'left',
      doorPosition: 'front',
      busTypeId: null,
      grid: null,
      isDefault: false,
      totalSeats: 50,
      seats: []
    }
  ]
})

const buildProps = () => ({
  tours: [buildTour()],
  handleOpenAddTour: vi.fn(),
  handleOpenEditTour: vi.fn(),
  handleDeleteTour: vi.fn(),
  handleOpenAddBus: vi.fn(),
  handleOpenEditBus: vi.fn(),
  handleDeleteBus: vi.fn()
})

describe('TourManagement', () => {
  it('renders the tour title, bus count badge and derived seat counts', () => {
    render(<TourManagement {...buildProps()} />)
    expect(screen.getByText('טיול לגולן')).toBeInTheDocument()
    expect(screen.getByText('2 אוטובוסים')).toBeInTheDocument()
    // bus1: available=2, pending=1, taken=1
    expect(screen.getByText('2 פנויים')).toBeInTheDocument()
    expect(screen.getByText('1 ממתינים')).toBeInTheDocument()
    expect(screen.getByText('1 תפוסים')).toBeInTheDocument()
  })

  it('shows the empty state when there are no tours', () => {
    render(<TourManagement {...buildProps()} tours={[]} />)
    expect(
      screen.getByText('אין טיולים במערכת. הוסיפו טיול חדש כדי להתחיל.')
    ).toBeInTheDocument()
  })

  it('disables deleting the first (main) bus but allows deleting others', async () => {
    const user = userEvent.setup()
    const props = buildProps()
    render(<TourManagement {...props} />)

    const firstBusDelete = screen.getByRole('button', {
      name: /לא ניתן למחוק את האוטובוס הראשי אוטובוס ראשי/
    })
    expect(firstBusDelete).toBeDisabled()
    expect(screen.getByText('ראשי')).toBeInTheDocument()

    await user.click(firstBusDelete)
    expect(props.handleDeleteBus).not.toHaveBeenCalled()

    const secondBusDelete = screen.getByRole('button', {
      name: 'מחק את האוטובוס אוטובוס משני'
    })
    await user.click(secondBusDelete)
    expect(props.handleDeleteBus).toHaveBeenCalledWith('t1', 'bus2')
  })

  it('shows the loading state while the first tours fetch is in flight', () => {
    render(<TourManagement {...buildProps()} tours={[]} isLoading />)
    const loading = screen.getByText('טוען טיולים...')
    expect(loading).toBeInTheDocument()
    expect(loading).toHaveAttribute('aria-live', 'polite')
  })

  it('shows the per-tour empty state when a tour has no buses', () => {
    const tour = { ...buildTour(), buses: [] }
    render(<TourManagement {...buildProps()} tours={[tour]} />)
    expect(
      screen.getByText('אין אוטובוסים בטיול זה. הוסיפו אוטובוס כדי להתחיל.')
    ).toBeInTheDocument()
    expect(screen.getByText('0 אוטובוסים')).toBeInTheDocument()
  })

  it('renders pickup-point tags and free-text fields as escaped text, not HTML', () => {
    const tour = buildTour()
    tour.title = '<img src=x onerror="alert(1)">'
    tour.buses[0].description = '<script>alert(2)</script>'
    tour.buses[0].pickupPoints = ['<b>תל אביב</b>']

    const { container } = render(<TourManagement {...buildProps()} tours={[tour]} />)

    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument()
    expect(screen.getByText('<script>alert(2)</script>')).toBeInTheDocument()
    expect(screen.getByText('<b>תל אביב</b>')).toBeInTheDocument()
    expect(screen.getAllByText('נקודות איסוף (1):').length).toBeGreaterThan(0)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('wires the edit-bus handler with the owning tour id', async () => {
    const user = userEvent.setup()
    const props = buildProps()
    render(<TourManagement {...props} />)

    await user.click(
      screen.getByRole('button', { name: 'ערוך את האוטובוס אוטובוס משני' })
    )
    expect(props.handleOpenEditBus).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'bus2' })
    )
  })

  it('wires the add/edit/delete tour and add-bus handlers', async () => {
    const user = userEvent.setup()
    const props = buildProps()
    render(<TourManagement {...props} />)

    await user.click(screen.getByRole('button', { name: 'הוסף טיול חדש' }))
    expect(props.handleOpenAddTour).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /ערוך טיול/ }))
    expect(props.handleOpenEditTour).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /מחק את הטיול/ }))
    expect(props.handleDeleteTour).toHaveBeenCalledWith('t1')

    await user.click(screen.getByRole('button', { name: /הוסף עוד אוטובוס/ }))
    expect(props.handleOpenAddBus).toHaveBeenCalledWith('t1')
  })
})
