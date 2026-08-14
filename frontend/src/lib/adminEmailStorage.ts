// Remembers the last admin email that logged in successfully, so the login
// form is pre-filled next visit. Plain `localStorage` — works fine inside
// the Capacitor Android webview too, same as any browser. Wrapped in
// try/catch since some embedded webviews restrict storage and this is a
// convenience, not a requirement.
const KEY = 'hila-tours:lastAdminEmail'

export function getStoredAdminEmail(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setStoredAdminEmail(email: string): void {
  try {
    localStorage.setItem(KEY, email)
  } catch {
    // ignore — storage unavailable
  }
}
