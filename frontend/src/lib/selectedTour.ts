import type { Tour } from '../types/tour.types'
import { filterUpcomingTours } from './tourDate'
import { getStoredTourId } from './busSelectionStorage'

/**
 * Resolves which tour the admin is currently working on, in the same
 * precedence order SeatManagement itself uses:
 *   1. the live in-store selection (published by whichever admin tab is open)
 *   2. the tour id remembered in this browser
 *   3. the first upcoming tour
 *
 * Shared so the Header's tour-day check and the admin tabs can never disagree
 * about which tour is "selected" — a mismatch there would show or hide the
 * attendance tab for the wrong tour.
 */
export function resolveSelectedTour(
  tours: Tour[],
  selectedTourId: string | null
): Tour | undefined {
  const upcoming = filterUpcomingTours(tours)
  return (
    tours.find(t => t.id === selectedTourId) ??
    tours.find(t => t.id === getStoredTourId()) ??
    upcoming[0]
  )
}
