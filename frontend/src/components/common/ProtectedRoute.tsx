import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useStore } from '../../store/store'

// Admin-only route guard. Passengers have no auth; only admins are gated.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAdminLoggedIn = useStore(state => state.adminUser.isLoggedIn)
  if (!isAdminLoggedIn) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
