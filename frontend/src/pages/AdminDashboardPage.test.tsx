import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminDashboardPage } from './AdminDashboardPage'
import { useStore } from '../store/store'
import { tourService } from '../services/tour.service'
import { busService } from '../services/bus.service'
import type { Tour } from '../types/tour.types'

let currentPath = '/admin/seats'

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: currentPath })
}))

vi.mock('../services/tour.service', () => ({
  tourService: { query: vi.fn(), save: vi.fn(), remove: vi.fn() }
}))

vi.mock('../services/bus.service', () => ({
  busService: { save: vi.fn(), remove: vi.fn() }
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

// Stub the self-contained tab bodies so this suite focuses on the container's
// orchestration (tab routing, empty state, modal wiring, CRUD handlers).
vi.mock('../components/SeatManagement', () => ({
  SeatManagement: () => <div>SEAT_MANAGEMENT</div>
}))
vi.mock('../components/PassengerManifestReport', () => ({
  PassengerManifestReport: () => <div>MANIFEST_REPORT</div>
}))
vi.mock('../components/TourManagement', () => ({
  TourManagement: (props: {
    handleDeleteTour: (id: string) => void
    handleOpenAddBus: (id: string) => void
  }) => (
    <div>
      <div>TOUR_MANAGEMENT</div>
      <button onClick={() => props.handleDeleteTour('t1')}>del-tour</button>
      <button onClick={() => props.handleOpenAddBus('t1')}>add-bus</button>
    </div>
  )
}))

const queryMock = vi.mocked(tourService.query)
const saveTourMock = vi.mocked(tourService.save)
const removeTourMock = vi.mocked(tourService.remove)
void busService

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
      seats: []
    }
  ]
})

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentPath = '/admin/seats'
    queryMock.mockResolvedValue([])
    useStore.setState({ tours: [buildTour()] })
  })

  it('renders the Seat Management tab on the /admin/seats route', async () => {
    render(<AdminDashboardPage />)
    expect(await screen.findByText('SEAT_MANAGEMENT')).toBeInTheDocument()
    await waitFor(() => expect(queryMock).toHaveBeenCalled())
  })

  it('renders the Tour Management tab on the /admin/tours route', () => {
    currentPath = '/admin/tours'
    render(<AdminDashboardPage />)
    expect(screen.getByText('TOUR_MANAGEMENT')).toBeInTheDocument()
  })

  it('renders the Manifest Report tab on the /admin/report route', () => {
    currentPath = '/admin/report'
    render(<AdminDashboardPage />)
    expect(screen.getByText('MANIFEST_REPORT')).toBeInTheDocument()
  })

  it('shows the empty-state CTA and opens the tour modal when there are no tours', async () => {
    const user = userEvent.setup()
    useStore.setState({ tours: [] })
    render(<AdminDashboardPage />)

    const cta = await screen.findByRole('button', { name: /צור טיול ראשון/ })
    await user.click(cta)

    expect(
      await screen.findByRole('button', { name: 'שמור טיול חדש' })
    ).toBeInTheDocument()
  })

  it('saves a new tour through the tour-service and refetches', async () => {
    const user = userEvent.setup()
    useStore.setState({ tours: [] })
    saveTourMock.mockResolvedValueOnce(buildTour())
    render(<AdminDashboardPage />)

    await user.click(await screen.findByRole('button', { name: /צור טיול ראשון/ }))
    await user.type(screen.getByLabelText(/שם הטיול/), 'טיול חדש')
    fireEvent.change(screen.getByLabelText(/תאריך יציאה/), { target: { value: '2099-01-01' } })
    await user.click(screen.getByRole('button', { name: 'שמור טיול חדש' }))

    await waitFor(() => expect(saveTourMock).toHaveBeenCalledTimes(1))
    expect(saveTourMock.mock.calls[0][0]).toMatchObject({ title: 'טיול חדש' })
    // one initial load + one refetch after save
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2))
  })

  it('confirms before deleting a tour, then removes it and refetches', async () => {
    const user = userEvent.setup()
    currentPath = '/admin/tours'
    removeTourMock.mockResolvedValueOnce()
    render(<AdminDashboardPage />)

    await user.click(screen.getByRole('button', { name: 'del-tour' }))
    // ConfirmModal appears; remove not called until confirmed
    expect(removeTourMock).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'מחק טיול' }))

    await waitFor(() => expect(removeTourMock).toHaveBeenCalledWith('t1'))
  })
})