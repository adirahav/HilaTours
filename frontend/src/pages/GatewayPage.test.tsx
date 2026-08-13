import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { GatewayPage } from './GatewayPage'
import { useStore } from '../store/store'
import { tourService } from '../services/tour.service'
import type { Tour } from '../types/tour.types'

const navigateMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock
}))

vi.mock('../services/tour.service', () => ({
  tourService: { query: vi.fn() }
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

// Admin login card is exercised in its own suite; stub it here to keep the
// page test focused on tour loading + routing.
vi.mock('../components/common/GatewayAdminLogin', () => ({
  GatewayAdminLogin: ({
    onAdminLoginSuccess
  }: {
    onAdminLoginSuccess: () => void
  }) => (
    <button type="button" onClick={onAdminLoginSuccess}>
      admin-login
    </button>
  )
}))

const queryMock = vi.mocked(tourService.query)

const buildTour = (overrides: Partial<Tour> = {}): Tour => ({
  id: 't1',
  title: 'טיול לגולן',
  date: '2026-08-15',
  description: '',
  buses: [],
  createdAt: '2026-08-01',
  ...overrides
})

describe('GatewayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockResolvedValue([])
    useStore.setState({ tours: [] })
  })

  it('loads tours on mount when the store is empty', async () => {
    queryMock.mockResolvedValueOnce([])
    render(<GatewayPage />)
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1))
  })

  it('does not reload tours when the store is already populated', () => {
    useStore.setState({ tours: [buildTour()] })
    render(<GatewayPage />)
    expect(queryMock).not.toHaveBeenCalled()
    expect(screen.getByText('טיול לגולן')).toBeInTheDocument()
  })

  it('navigates to the tour route when a tour is selected', async () => {
    const user = userEvent.setup()
    useStore.setState({ tours: [buildTour({ id: 't42', title: 'טיול הצפון' })] })
    render(<GatewayPage />)

    await user.click(
      screen.getByRole('button', { name: /בחר מושבים לטיול טיול הצפון/ })
    )
    expect(navigateMock).toHaveBeenCalledWith('/tour/t42')
  })

  it('navigates to /admin on successful admin login', async () => {
    const user = userEvent.setup()
    render(<GatewayPage />)
    await user.click(screen.getByRole('button', { name: 'admin-login' }))
    expect(navigateMock).toHaveBeenCalledWith('/admin')
  })

  // Security: a server-supplied tour id must never break out of the passenger
  // route (path traversal toward admin-gated routes).
  it('encodes the tour id so it cannot traverse out of /tour', async () => {
    const user = userEvent.setup()
    useStore.setState({
      tours: [buildTour({ id: '../admin', title: 'טיול חשוד' })]
    })
    render(<GatewayPage />)

    await user.click(
      screen.getByRole('button', { name: /בחר מושבים לטיול טיול חשוד/ })
    )
    expect(navigateMock).toHaveBeenCalledWith('/tour/..%2Fadmin')
    expect(navigateMock).not.toHaveBeenCalledWith('/admin')
  })

  it('renders the loading state in an aria-live region while tours load', () => {
    queryMock.mockReturnValueOnce(new Promise(() => {}))
    render(<GatewayPage />)

    const region = screen.getByText('טוען טיולים...')
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('shows an error toast when the tour load fails', async () => {
    queryMock.mockRejectedValueOnce(new Error('network down'))
    render(<GatewayPage />)

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    // The raw server/network error is never surfaced to the user.
    expect(vi.mocked(toast.error).mock.calls[0][0]).not.toContain('network down')
  })

  it('shows the empty state when no tours are returned', async () => {
    render(<GatewayPage />)
    await waitFor(() =>
      expect(screen.getByText('אין טיולים זמינים במערכת כעת')).toBeInTheDocument()
    )
  })

  // Security: nothing admin-gated may render to an unauthenticated passenger.
  it('exposes no admin-only affordances before authentication', () => {
    useStore.setState({
      tours: [buildTour()],
      authToken: null,
      adminUser: undefined
    })
    render(<GatewayPage />)

    expect(screen.queryByText(/אישור מושבים/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument()
  })
})
