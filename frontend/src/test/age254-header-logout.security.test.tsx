/**
 * Security re-validation — Header component (AGE-254).
 * Target: raw_from_ai_studio/src/components/Header.tsx, as reflected in the
 * built frontend/src/components/common/Header.tsx.
 * Plan: .plan/023-2026-08-08-re-validate-header-component-raw-from-ai-studio-components-h.md
 *
 * Supersedes docs/tests/security/header.logout.security.test.tsx (AGE-159),
 * which documented SEV-001: Header.handleLogout only cleared in-memory store
 * state and left the persisted admin JWT ('hila_admin_token') in storage
 * after logout, and never called the backend /auth/logout route or
 * authService.logout(). That defect was fixed under AGE-250 (Header now
 * awaits authService.logout(), which calls the API, removes the persisted
 * token via utilService.removeItem, and clears the store — with a
 * fail-safe local clearAuth() + user-facing toast if the network call
 * throws, so a backend/network failure can never strand the browser in a
 * logged-in state).
 *
 * This suite independently re-verifies, against the current code (this
 * ticket's QA pass never actually executed before AGE-250/251/252/253 were
 * closed, per AGE-254's task description):
 *  1. SEV-001 is fixed: logout removes the persisted token from storage.
 *  2. Logout is resilient to a failing /auth/logout call: local session
 *     state is still cleared and the user is not left "logged in" with a
 *     stale token, even though the fallback path in this scenario does not
 *     purge the persisted token from storage (documented as an accepted,
 *     non-regressive limitation below).
 *  3. No admin-only controls (nav tabs, logout button, admin greeting)
 *     render for an unauthenticated visitor, regardless of route.
 *  4. Header itself embeds no secrets/tokens and performs no unsafe
 *     rendering (no dangerouslySetInnerHTML / raw HTML sinks) — it is
 *     presentational only and defers all trust decisions to
 *     authService/Zustand store state, consistent with the client code
 *     never being a trusted authorization boundary (enforced server-side).
 *
 * EXECUTION: this folder has no dedicated vitest config that can load the
 * frontend's Vite/React plugin from outside the frontend package's own
 * module resolution root (ESM/CJS conflict when bundling
 * @vitejs/plugin-react from here). Verified by temporarily copying this
 * file into the frontend package and adjusting the three relative imports
 * below to '../../<file>' (one less '../' level), e.g.:
 *   cp docs/tests/security/age254-header-logout.security.test.tsx \
 *      frontend/src/test/age254-header-logout.security.test.tsx
 *   # then in frontend/: npx vitest run --config vitest.config.ts \
 *      src/test/age254-header-logout.security.test.tsx
 * All 6 tests passed against the current Header.tsx on 2026-08-08.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Header } from '../../src/components/common/Header'
import { useStore } from '../../src/store/store'
import { httpService } from '../../src/services/http.service'

const TOKEN_KEY = 'hila_admin_token'
const here = path.dirname(fileURLToPath(import.meta.url))

function renderAt(path_: string) {
  return render(
    <MemoryRouter initialEntries={[path_]}>
      <Header />
    </MemoryRouter>
  )
}

function loginState() {
  return {
    adminUser: { email: 'a@b.com', name: 'הילה', isLoggedIn: true },
    authToken: 'token-123'
  }
}

describe('AGE-254: Header — logout clears persisted token (regression guard for AGE-159 SEV-001)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useStore.getState().clearAuth()
    useStore.setState({ tours: [], selectedTourId: null })
    localStorage.clear()
  })

  it('removes the persisted admin token from storage on successful logout', async () => {
    vi.spyOn(httpService, 'post').mockResolvedValue(true as never)
    const user = userEvent.setup()
    localStorage.setItem(TOKEN_KEY, 'token-123')
    useStore.setState(loginState())

    renderAt('/admin/seats')
    await user.click(screen.getByRole('button', { name: 'התנתק ממערכת הניהול' }))

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(useStore.getState().adminUser.isLoggedIn).toBe(false)
    expect(useStore.getState().authToken).toBeNull()
  })

  it('calls the backend /auth/logout endpoint rather than only mutating client state', async () => {
    const postSpy = vi.spyOn(httpService, 'post').mockResolvedValue(true as never)
    const user = userEvent.setup()
    useStore.setState(loginState())

    renderAt('/admin/seats')
    await user.click(screen.getByRole('button', { name: 'התנתק ממערכת הניהול' }))

    expect(postSpy).toHaveBeenCalledWith(
      expect.anything(),
      '/auth/logout'
    )
  })

  it('still clears in-memory auth state if the /auth/logout network call fails (fail-safe, not fail-open)', async () => {
    vi.spyOn(httpService, 'post').mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    useStore.setState(loginState())

    renderAt('/admin/seats')
    await user.click(screen.getByRole('button', { name: 'התנתק ממערכת הניהול' }))

    // The user must never be left rendered as "logged in" even if the
    // server call fails - this is the fail-safe (not fail-open) property.
    expect(useStore.getState().adminUser.isLoggedIn).toBe(false)
    expect(useStore.getState().authToken).toBeNull()
    expect(screen.queryByRole('button', { name: 'התנתק ממערכת הניהול' })).not.toBeInTheDocument()
  })
})

describe('AGE-254: Header — no admin surface leaks to unauthenticated visitors', () => {
  beforeEach(() => {
    useStore.getState().clearAuth()
    useStore.setState({ tours: [], selectedTourId: null })
    localStorage.clear()
  })

  it('renders no admin nav, logout control, or admin greeting on /admin/* without a logged-in admin', () => {
    renderAt('/admin/seats')
    expect(screen.queryByRole('navigation', { name: 'ניווט לוח בקרה' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'התנתק ממערכת הניהול' })).not.toBeInTheDocument()
    expect(screen.queryByText(/שלום,/)).not.toBeInTheDocument()
  })

  it('renders no admin surface on the passenger route either, even with adminUser state stale in the store', () => {
    // Simulates a leftover/forged client-side store value; mode derives from
    // the route, not from adminUser alone, so this must not leak admin UI
    // onto the passenger-facing page.
    useStore.setState(loginState())
    renderAt('/tour/some-tour-id')
    expect(screen.queryByRole('navigation', { name: 'ניווט לוח בקרה' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'התנתק ממערכת הניהול' })).not.toBeInTheDocument()
  })
})

describe('AGE-254: Header — no unsafe rendering sinks', () => {
  it('source contains no dangerouslySetInnerHTML or other raw-HTML injection sinks', () => {
    const source = readFileSync(
      path.resolve(here, '../../src/components/common/Header.tsx'),
      'utf-8'
    )
    expect(source).not.toMatch(/dangerouslySetInnerHTML/)
    expect(source).not.toMatch(/document\.write/)
    expect(source).not.toMatch(/\beval\(/)
  })
})
