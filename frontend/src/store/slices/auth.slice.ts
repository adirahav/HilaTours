import type { StateCreator } from 'zustand'
import type { AdminUser } from '../../types/auth.types'

export interface AuthSlice {
  adminUser: AdminUser
  authToken: string | null
  setAdminUser: (adminUser: AdminUser) => void
  setAuthToken: (token: string | null) => void
  clearAuth: () => void
}

const EMPTY_ADMIN: AdminUser = { email: '', name: '', isLoggedIn: false }

export const createAuthSlice: StateCreator<AuthSlice> = set => ({
  adminUser: EMPTY_ADMIN,
  authToken: null,
  setAdminUser: adminUser => set({ adminUser }),
  setAuthToken: authToken => set({ authToken }),
  clearAuth: () => set({ adminUser: EMPTY_ADMIN, authToken: null })
})
