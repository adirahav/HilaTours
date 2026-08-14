import { httpService, userManagementClient } from './http.service'
import { utilService } from './util.service'
import { useStore } from '../store/store'
import type { AdminUser, LoginCredentials, SignupData } from '../types/auth.types'

// Paths are relative to VITE_USER_MANAGEMENT_API_URL, whose base already
// ends in /api (see api-contract.user-management-service.yaml).
const TOKEN_KEY = 'hila_admin_token'

// POST /auth/login returns the raw JWT string (see api-contract, not an
// { token, admin } envelope) — email/username live only in the payload, so
// decode it locally rather than making a second round-trip.
function decodeAdminFromToken(token: string): Pick<AdminUser, 'email' | 'name' | 'roles'> {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const payload = JSON.parse(new TextDecoder('utf-8').decode(bytes))
  return {
    email: payload.email ?? '',
    name: payload.username ?? '',
    roles: Array.isArray(payload.roles) ? payload.roles : []
  }
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<void> {
    const token = await httpService.post<string>(userManagementClient, '/auth/login', credentials)
    await utilService.setItem(TOKEN_KEY, token)
    useStore.setState({
      authToken: token,
      adminUser: { ...decodeAdminFromToken(token), isLoggedIn: true }
    })
  },

  // Self-signup always yields a roles:["user"] account with no admin
  // permissions, so the returned token is deliberately NOT persisted and no
  // auth state is set — the user is sent to /login to authenticate separately.
  async signup(data: SignupData): Promise<void> {
    await httpService.post(userManagementClient, '/auth/signup', {
      fullname: data.fullname,
      email: data.email,
      password: data.password
    })
  },

  async logout(): Promise<void> {
    await httpService.post(userManagementClient, '/auth/logout')
    await utilService.removeItem(TOKEN_KEY)
    useStore.getState().clearAuth()
  },

  async forgotPassword(email: string): Promise<void> {
    await httpService.post(userManagementClient, '/auth/forgot-password', { email })
  },

  async loadToken(): Promise<string | null> {
    const token = await utilService.getItem(TOKEN_KEY)
    if (token) {
      useStore.setState({
        authToken: token,
        adminUser: { ...decodeAdminFromToken(token), isLoggedIn: true }
      })
    }
    return token
  }
}
