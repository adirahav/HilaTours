import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { useStore } from '../store/store'

// Centralized Axios wrapper. Domain services (auth/tour/bus/seat/manifest)
// call through this module, never axios/fetch directly. Each domain service
// picks the correct microservice base URL from the injected VITE_* config.

function createClient(baseURL: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    headers: { 'Content-Type': 'application/json' }
  })

  // Admin-only routes (seat approve/cancel/toggle-reserve/manual-assign/
  // swap-move, tour & bus CRUD, manifest) are guarded server-side by
  // requireAdmin, so every outgoing request must carry the admin JWT held in
  // the auth slice. Attached centrally here so no component or domain service
  // ever handles the token itself.
  client.interceptors.request.use(config => {
    const token = useStore.getState().authToken
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  client.interceptors.response.use(
    res => res,
    err => {
      if (err?.response?.status === 401) {
        // TODO: session-expiry handling (clear auth slice, redirect to /login)
      }
      return Promise.reject(err)
    }
  )

  return client
}

// In production the app is served by `common-service`, the single public-facing
// gateway: it hosts the built frontend and reverse-proxies `/api/*` to the two
// private business services. So every client collapses to one same-origin
// `/api/` prefix and the frontend never addresses either service directly.
// In development each service is still hit on its own origin via the VITE_* env vars.
const isDev = import.meta.env.DEV

const userManagementBaseUrl = isDev ? (import.meta.env.VITE_USER_MANAGEMENT_API_URL ?? '') : '/api/'
const tourBaseUrl = isDev ? (import.meta.env.VITE_TOUR_API_URL ?? '') : '/api/'

export const userManagementClient = createClient(userManagementBaseUrl)
export const tourClient = createClient(tourBaseUrl)

export const httpService = {
  get<T>(client: AxiosInstance, url: string, config?: AxiosRequestConfig) {
    return client.get<T>(url, config).then(res => res.data)
  },
  post<T>(client: AxiosInstance, url: string, body?: unknown, config?: AxiosRequestConfig) {
    return client.post<T>(url, body, config).then(res => res.data)
  },
  put<T>(client: AxiosInstance, url: string, body?: unknown, config?: AxiosRequestConfig) {
    return client.put<T>(url, body, config).then(res => res.data)
  },
  del<T>(client: AxiosInstance, url: string, config?: AxiosRequestConfig) {
    return client.delete<T>(url, config).then(res => res.data)
  }
}
