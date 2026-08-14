// Remembers the last-picked tour/bus (passenger booking page and admin seat
// management both use this) so a reload — or, on Android, resuming the
// Capacitor app — restores the same selection. Plain `localStorage` works
// inside the Capacitor webview the same as any browser, so no native plugin
// is needed here. Wrapped in try/catch since some embedded webviews restrict
// storage (e.g. private browsing) and this is a convenience, not a
// requirement.
const busKeyFor = (tourId: string): string => `hila-tours:selectedBus:${tourId}`
const TOUR_KEY = "hila-tours:selectedTour"

export function getStoredBusId(tourId: string): string | null {
  try {
    return localStorage.getItem(busKeyFor(tourId))
  } catch {
    return null
  }
}

export function setStoredBusId(tourId: string, busId: string): void {
  try {
    localStorage.setItem(busKeyFor(tourId), busId)
  } catch {
    // ignore — storage unavailable
  }
}

export function getStoredTourId(): string | null {
  try {
    return localStorage.getItem(TOUR_KEY)
  } catch {
    return null
  }
}

export function setStoredTourId(tourId: string): void {
  try {
    localStorage.setItem(TOUR_KEY, tourId)
  } catch {
    // ignore — storage unavailable
  }
}
