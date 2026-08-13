/**
 * Security re-audit — Gateway page (AGE-264).
 * Target: raw_from_ai_studio/src/pages/GatewayPage.tsx, as reflected in the
 * built frontend/src/pages/GatewayPage.tsx and its wired children
 * GatewayAdminLogin / GatewayTours.
 * Plan: .plan/025-2026-08-08-re-audit-gateway-page-raw-from-ai-studio-pages-gatewaypage-t.md
 *
 * This ticket exists because Security never actually ran on GatewayPage.tsx
 * before plan 009 was marked done. This suite independently re-verifies,
 * against the current code:
 *
 *  1. Admin login goes through the real POST /auth/login JWT flow
 *     (authService.login -> httpService -> userManagementClient) and never
 *     through the design's local-storage `loginAdmin` stub
 *     (raw_from_ai_studio/src/lib/storage.ts) — that stub accepts ANY
 *     email + a >=4-char password as a successful "demo" login, which would
 *     be a full admin-auth bypass if it were still reachable.
 *  2. No demo/default admin credentials are pre-filled in the shipped
 *     GatewayAdminLogin (the design source pre-fills
 *     admin@bus.co.il / admin123 — a real credential-disclosure smell if
 *     shipped as-is).
 *  3. A failed login never calls onAdminLoginSuccess (no route to /admin
 *     without a real, server-verified success).
 *  4. The raw API error payload is never surfaced to the DOM on failure
 *     (only a fixed Hebrew fallback / server `message`), so no token/stack
 *     trace/internal detail leaks through the login card.
 *  5. Regression check for a defect found during an earlier audit (now
 *     fixed): `authService.login` used to assume the login response was a
 *     `{ token, admin }` object, but user-management-service (per
 *     docs/api-contract/api-contract.user-management-service.yaml and
 *     backend/user-management-service/api/auth/auth.controller.ts, confirmed
 *     by that service's own auth.test.ts) returns the JWT as a bare string.
 *     `authService.login` now treats the response as the raw token and
 *     decodes email/username from the JWT payload locally — verified below
 *     to persist the real token, not `undefined`.
 *
 * EXECUTION: this folder has no dedicated vitest config that can load the
 * frontend's Vite/React plugin from outside the frontend package's own
 * module resolution root. Run as part of the frontend suite:
 *   npm --prefix frontend run test -- age264-gateway-page.security.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const postMock = vi.fn()
const setItemMock = vi.fn()

vi.mock('../services/http.service', () => ({
  httpService: {
    get: vi.fn(),
    post: (...args: unknown[]) => postMock(...args),
    put: vi.fn(),
    del: vi.fn()
  },
  userManagementClient: {},
  tourClient: {}
}))

vi.mock('../services/util.service', () => ({
  utilService: {
    setItem: (...args: unknown[]) => setItemMock(...args),
    getItem: vi.fn(),
    removeItem: vi.fn()
  }
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

import { GatewayAdminLogin } from '../components/common/GatewayAdminLogin'
import { useStore } from '../store/store'

// Builds a syntactically-real JWT (header.payload.signature) so
// authService's local payload decode succeeds in tests, matching what
// user-management-service actually issues.
function fakeJwt(payload: Record<string, unknown>): string {
  const base64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.signature`
}

describe('GatewayAdminLogin (wired inside GatewayPage) — admin auth security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ authToken: null, adminUser: { email: '', name: '', isLoggedIn: false } })
  })

  it('renders with no pre-filled demo credentials (unlike the design source admin@bus.co.il / admin123)', () => {
    render(<GatewayAdminLogin onAdminLoginSuccess={vi.fn()} />)
    const emailInput = screen.getByPlaceholderText('admin@bus.co.il') as HTMLInputElement
    const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement
    expect(emailInput.value).toBe('')
    expect(passwordInput.value).toBe('')
  })

  it('calls the real POST /auth/login flow via httpService, never a local-storage stub', async () => {
    postMock.mockResolvedValueOnce(fakeJwt({ email: 'a@b.com', username: 'a' }))
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    render(<GatewayAdminLogin onAdminLoginSuccess={onSuccess} />)

    await user.type(screen.getByPlaceholderText('admin@bus.co.il'), 'admin@bus.co.il')
    await user.type(screen.getByPlaceholderText('••••••••'), 'realpassword')
    await user.click(screen.getByRole('button', { name: /התחבר כמנהל/ }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(postMock).toHaveBeenCalledWith(
      expect.anything(),
      '/auth/login',
      { email: 'admin@bus.co.il', password: 'realpassword' }
    )
  })

  it('does not call onAdminLoginSuccess when the API rejects the login', async () => {
    postMock.mockRejectedValueOnce(new Error('invalid email or password'))
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    render(<GatewayAdminLogin onAdminLoginSuccess={onSuccess} />)

    await user.type(screen.getByPlaceholderText('admin@bus.co.il'), 'admin@bus.co.il')
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /התחבר כמנהל/ }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('never renders a raw server error payload (only the mapped message) on failed login', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { token: 'leaked-secret-value' } } })
    const user = userEvent.setup()
    render(<GatewayAdminLogin onAdminLoginSuccess={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('admin@bus.co.il'), 'admin@bus.co.il')
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /התחבר כמנהל/ }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText(/leaked-secret-value/)).not.toBeInTheDocument()
  })

  // Regression test for the response-shape defect described in the file
  // header (item 5): a bare-string login response (the real backend/contract
  // shape) must be stored as the actual JWT, not `undefined`.
  it('stores the real JWT (not undefined) for a bare-string login response, the real backend/contract shape', async () => {
    const token = fakeJwt({ email: 'admin@bus.co.il', username: 'Admin' })
    postMock.mockResolvedValueOnce(token)
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    render(<GatewayAdminLogin onAdminLoginSuccess={onSuccess} />)

    await user.type(screen.getByPlaceholderText('admin@bus.co.il'), 'admin@bus.co.il')
    await user.type(screen.getByPlaceholderText('••••••••'), 'realpassword')
    await user.click(screen.getByRole('button', { name: /התחבר כמנהל/ }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(setItemMock).toHaveBeenCalledWith('hila_admin_token', token)
    expect(useStore.getState().authToken).toBe(token)
  })
})
