import type { Tour } from '../types/tour.types'

// Tours are compared by calendar date only, never time-of-day — a tour dated
// "today" must still show up regardless of what time it is right now, and a
// stray time component in a stored `date` value (e.g. a full ISO datetime)
// must not affect the comparison either.
function toCalendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function isUpcomingTourDate(tourDate: string, referenceDate: Date = new Date()): boolean {
  const parsed = new Date(tourDate)
  if (Number.isNaN(parsed.getTime())) return true // unparseable date: don't hide it, let it surface elsewhere
  return toCalendarDateKey(parsed) >= toCalendarDateKey(referenceDate)
}

export function filterUpcomingTours(tours: Tour[], referenceDate: Date = new Date()): Tour[] {
  return tours.filter(tour => isUpcomingTourDate(tour.date, referenceDate))
}
