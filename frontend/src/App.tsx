import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { GatewayPage } from './pages/GatewayPage'
import { PassengerViewPage } from './pages/PassengerViewPage'
import { LoginPage } from './pages/LoginPage'
import { SignUpPage } from './pages/SignUpPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProtectedRoute } from './components/common/ProtectedRoute'
import { authService } from './services/auth.service'

export default function App() {
  // Zustand's auth state is in-memory only; the token itself is persisted
  // (localStorage/Capacitor Preferences). Without this, every reload starts
  // adminUser.isLoggedIn at false and ProtectedRoute redirects to /login
  // before the persisted token has a chance to be restored.
  const [sessionReady, setSessionReady] = useState(false)
  useEffect(() => {
    authService.loadToken().finally(() => setSessionReady(true))
  }, [])

  if (!sessionReady) return null

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<GatewayPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignUpPage />} />
          <Route path="tour/:tourId" element={<PassengerViewPage />} />
          <Route
            path="admin"
            element={
              <ProtectedRoute>
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="seats" replace />} />
            <Route path="seats" element={null} />
            <Route path="tours" element={null} />
            <Route path="report" element={null} />
          </Route>
          <Route path="404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
