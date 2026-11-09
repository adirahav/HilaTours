import type { Tour } from '../types/tour.types'

// Tours are compared by calendar date only, never time-of-day — a tour dated
// "today" must still show up regardless of what time it is right now, and a
// stray time component in a stored `date` value (e.g. a full ISO datetime)
// must not affect the comparison either.
//
// Month and day are zero-padded because `isUpcomingTourDate` orders these keys
// as strings: unpadded, "10" sorts before "7" and "20" before "5".
function toCalendarDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function isUpcomingTourDate(tourDate: string, referenceDate: Date = new Date()): boolean {
  const parsed = new Date(tourDate)
  if (Number.isNaN(parsed.getTime())) return true // unparseable date: don't hide it, let it surface elsewhere
  return toCalendarDateKey(parsed) >= toCalendarDateKey(referenceDate)
}

/**
 * True only on the tour's own calendar day. Drives the attendance tab's
 * visibility (F12) — the check-in tool is a day-of-tour tool and is hidden
 * every other day.
 *
 * Compared in the BROWSER's local timezone (plan 038, Open Question 1): the
 * guide running the check-in is always physically local to the tour, and this
 * matches how the rest of the app renders dates via toLocaleDateString('he-IL').
 * An unparseable date is never "today" — the tab stays hidden rather than
 * appearing on an arbitrary day.
 */
export function isTourToday(tourDate: string, referenceDate: Date = new Date()): boolean {
  const parsed = new Date(tourDate)
  if (Number.isNaN(parsed.getTime())) return false
  return toCalendarDateKey(parsed) === toCalendarDateKey(referenceDate)
}

export function filterUpcomingTours(tours: Tour[], referenceDate: Date = new Date()): Tour[] {
  return tours.filter(tour => isUpcomingTourDate(tour.date, referenceDate))
}
