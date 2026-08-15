import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useStore } from '../../store/store'
import { authService } from '../../services/auth.service'

// Admin-only route guard. Passengers have no auth; only admins are gated.
//
// A logged-in account with no "admin" role (e.g. a self-signed-up user,
// always roles:["user"] per auth.service.ts) must never reach here — it's
// not just "not logged in as admin", it's an account that was never granted
// admin access at all. Silently forcing that case through /login again is
// pointless (they can log back in with the same non-admin token) — instead
// this actively logs them out and sends them home, matching the "unauthorized
// user must be logged out and taken to the main page" requirement.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAdminLoggedIn = useStore(state => state.adminUser.isLoggedIn)
  const roles = useStore(state => state.adminUser.roles)
  const isAdmin = roles?.includes('admin') ?? false
  const forceLogout = isAdminLoggedIn && !isAdmin
  const location = useLocation()

  useEffect(() => {
    if (forceLogout) {
      authService.logout()
    }
  }, [forceLogout])

  if (!isAdminLoggedIn || forceLogout) {
    if (forceLogout) return <Navigate to="/" replace />
    // Preserve where the visitor was headed (e.g. an email approve/reject
    // link) so LoginPage can send them there after a successful login,
    // instead of always dropping them on the generic /admin default.
    const target = `${location.pathname}${location.search}`
    return <Navigate to={`/login?redirect=${encodeURIComponent(target)}`} replace />
  }
  return <>{children}</>
}
