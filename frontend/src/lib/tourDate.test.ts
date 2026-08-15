import { describe, it, expect } from 'vitest'
import { isUpcomingTourDate, filterUpcomingTours } from './tourDate'
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
