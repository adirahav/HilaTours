import { describe, it, expect } from 'vitest'
import { isUpcomingTourDate, isTourToday, filterUpcomingTours } from './tourDate'
import type { Tour } from '../types/tour.types'

const REFERENCE = new Date('2026-08-15T09:00:00Z')

function makeTour(id: string, date: string): Tour {
  return { id, title: id, date, description: '', buses: [] } as unknown as Tour
}

describe('isUpcomingTourDate', () => {
  it('keeps a tour dated today', () => {
    expect(isUpcomingTourDate('2026-08-15', REFERENCE)).toBe(true)
  })

  it('keeps a tour dated today even with a time component in the past', () => {
    expect(isUpcomingTourDate('2026-08-15T02:00:00Z', REFERENCE)).toBe(true)
  })

  it('keeps a future tour', () => {
    expect(isUpcomingTourDate('2026-08-20', REFERENCE)).toBe(true)
  })

  it('drops a tour dated yesterday', () => {
    expect(isUpcomingTourDate('2026-08-14', REFERENCE)).toBe(false)
  })

  it('drops a tour dated last month', () => {
    expect(isUpcomingTourDate('2026-07-01', REFERENCE)).toBe(false)
  })
})

// Drives the attendance tab's visibility (F12): true ONLY on the tour's own
// calendar day, so a false positive here would expose the check-in tool on the
// wrong day and a false negative would hide it from the guide at the door.
describe('isTourToday', () => {
  it('is true on the tour date itself', () => {
    expect(isTourToday('2026-08-15', REFERENCE)).toBe(true)
  })

  it('ignores the time component — still today at any hour', () => {
    expect(isTourToday('2026-08-15T23:30:00', REFERENCE)).toBe(true)
    expect(isTourToday('2026-08-15T00:05:00', REFERENCE)).toBe(true)
  })

  it('is false the day before and the day after', () => {
    expect(isTourToday('2026-08-14', REFERENCE)).toBe(false)
    expect(isTourToday('2026-08-16', REFERENCE)).toBe(false)
  })

  it('is false for an unparseable date rather than showing the tab arbitrarily', () => {
    expect(isTourToday('not-a-date', REFERENCE)).toBe(false)
  })
})

describe('filterUpcomingTours', () => {
  it('removes past tours and keeps today/future ones', () => {
    const tours = [
      makeTour('past', '2026-08-01'),
      makeTour('today', '2026-08-15'),
      makeTour('future', '2026-09-01')
    ]
    expect(filterUpcomingTours(tours, REFERENCE).map(t => t.id)).toEqual(['today', 'future'])
  })
})
