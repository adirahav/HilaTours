import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'
import { useStore } from '../../store/store'
import { httpService } from '../../services/http.service'
import type { Tour } from '../../types/tour.types'

// Header -> authService.logout() -> httpService.post. Only the network edge is
// mocked so the real service still clears the store and the persisted token.
vi.mock('../../services/http.service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/http.service')>()
  return { ...actual, httpService: { ...actual.httpService, post: vi.fn() } }
})

const TOKEN_KEY = 'hila_admin_token'

const buildTour = (overrides: Partial<Tour> = {}): Tour => ({
  id: 't1',
  title: 'טיול לגולן',
  date: '2026-08-15',
  description: '',
  buses: [],
  createdAt: '2026-08-01',
  ...overrides
})

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Header />
    </MemoryRouter>
  )
}

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(httpService.post).mockResolvedValue(undefined)
    localStorage.clear()
    useStore.getState().clearAuth()
    useStore.setState({ tours: [], selectedTourId: null })
  })

  const loginAdmin = () =>
    useStore.setState({
      adminUser: { email: 'a@b.com', name: 'הילה', isLoggedIn: true, roles: ['admin'] },
      authToken: 'token-123'
    })

  it('shows the default system title on the gateway route', () => {
    renderAt('/')
    expect(
      screen.getByText(/טיולי משפחות עצמאיות/)
    ).toBeInTheDocument()
  })

  it('shows the active tour title in passenger mode with a back-to-gateway control', () => {
    useStore.setState({ tours: [buildTour({ id: 't1', title: 'טיול לים' })] })
    renderAt('/tour/t1')

    expect(screen.getByText(/טיול לים/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /חזרה/ })
    ).toBeInTheDocument()
  })

  it('does not render admin tabs when no admin is logged in', () => {
    renderAt('/admin/seats')
    expect(
      screen.queryByRole('navigation', { name: 'ניווט לוח בקרה' })
    ).not.toBeInTheDocument()
  })

  it('renders admin control-panel title, tabs and greeting when admin is logged in', () => {
    useStore.setState({
      adminUser: { email: 'a@b.com', name: 'הילה', isLoggedIn: true, roles: ['admin'] }
    })
    renderAt('/admin/seats')

    expect(
      screen.getByText(/לוח בקרה ואישור מושבים באוטובוס/)
    ).toBeInTheDocument()
    // desktop + mobile nav both present
    expect(
      screen.getAllByRole('navigation', { name: 'ניווט לוח בקרה' }).length
    ).toBeGreaterThan(0)
    expect(screen.getByText(/שלום, הילה/)).toBeInTheDocument()
  })

  it('marks the active admin tab with aria-current', () => {
    useStore.setState({
      adminUser: { email: 'a@b.com', name: 'הילה', isLoggedIn: true, roles: ['admin'] }
    })
    renderAt('/admin/tours')

    const activeLinks = screen.getAllByRole('link', {
      name: /ניהול טיולים/
    })
    expect(activeLinks.some(l => l.getAttribute('aria-current') === 'page')).toBe(
      true
    )
  })

  it('clears auth state AND the persisted token when logout is clicked', async () => {
    const user = userEvent.setup()
    localStorage.setItem(TOKEN_KEY, 'token-123')
    loginAdmin()
    renderAt('/admin/seats')

    await user.click(
      screen.getByRole('button', { name: 'התנתק ממערכת הניהול' })
    )

    expect(useStore.getState().adminUser.isLoggedIn).toBe(false)
    expect(useStore.getState().authToken).toBeNull()
    // Regression guard: a store-only clearAuth() left this token behind.
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('still clears the local session when the logout request fails', async () => {
    const user = userEvent.setup()
    vi.mocked(httpService.post).mockRejectedValue(new Error('network down'))
    loginAdmin()
    renderAt('/admin/seats')

    await user.click(
      screen.getByRole('button', { name: 'התנתק ממערכת הניהול' })
    )

    expect(useStore.getState().adminUser.isLoggedIn).toBe(false)
    expect(useStore.getState().authToken).toBeNull()
  })

  it('does not render admin tabs, greeting or logout on the gateway route', () => {
    renderAt('/')

    expect(
      screen.queryByRole('navigation', { name: 'ניווט לוח בקרה' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/שלום,/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'התנתק ממערכת הניהול' })
    ).not.toBeInTheDocument()
  })

  it('does not render the back-to-gateway control outside passenger mode', () => {
    renderAt('/')
    expect(
      screen.queryByRole('link', { name: /חזרה/ })
    ).not.toBeInTheDocument()
  })

  it('renders both a desktop and a mobile admin tab bar at the md breakpoint', () => {
    loginAdmin()
    renderAt('/admin/seats')

    const navs = screen.getAllByRole('navigation', { name: 'ניווט לוח בקרה' })
    expect(navs).toHaveLength(2)
    expect(navs.some(n => n.className.includes('hidden md:flex'))).toBe(true)
    expect(navs.some(n => n.className.includes('md:hidden'))).toBe(true)
  })

  it('exposes focus-visible styles on the interactive header controls', () => {
    loginAdmin()
    renderAt('/admin/seats')

    const logout = screen.getByRole('button', { name: 'התנתק ממערכת הניהול' })
    expect(logout.className).toContain('focus-visible:ring-2')

    // The "דוח נוסעים" tab is currently commented out in ADMIN_TABS; the
    // bus-types tab is the last enabled one, in both the desktop and mobile nav.
    const tabs = screen.getAllByRole('link', { name: /דגמי אוטובוס/ })
    expect(tabs.every(t => t.className.includes('focus-visible:ring-2'))).toBe(true)
  })

  it('falls back to the default title when the tour id has no matching tour', () => {
    renderAt('/tour/unknown-id')
    expect(
      screen.getByText(/טיולי משפחות עצמאיות/)
    ).toBeInTheDocument()
  })
})
