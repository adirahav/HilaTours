export interface AdminUser {
  email: string
  name: string
  isLoggedIn: boolean
  roles: string[]
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface SignupData {
  fullname: string
  email: string
  password: string
}

export interface AuthResponse {
  token: string
  admin: Pick<AdminUser, 'email' | 'name'>
}
