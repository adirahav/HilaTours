import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store'
import type { Tour } from '../../types/tour.types'

function buildTour(id: string, title = 'טיול'): Tour {
  return { id, title, date: '2026-08-15', description: '', buses: [], createdAt: '2026-08-01' }
}

describe('tour slice', () => {
  beforeEach(() => {
    useStore.getState().setTours([])
  })

  it('sets the tours list', () => {
    useStore.getState().setTours([buildTour('t1')])
    expect(useStore.getState().tours).toHaveLength(1)
  })

  it('upserts a new tour when the id is unknown', () => {
    useStore.getState().setTours([buildTour('t1')])
    useStore.getState().upsertTour(buildTour('t2'))
    expect(useStore.getState().tours.map(t => t.id)).toEqual(['t1', 't2'])
  })

  it('upserts in place when the id already exists', () => {
    useStore.getState().setTours([buildTour('t1', 'old')])
    useStore.getState().upsertTour(buildTour('t1', 'new'))
    expect(useStore.getState().tours).toHaveLength(1)
    expect(useStore.getState().tours[0].title).toBe('new')
  })

  it('removes a tour by id', () => {
    useStore.getState().setTours([buildTour('t1'), buildTour('t2')])
    useStore.getState().removeTour('t1')
    expect(useStore.getState().tours.map(t => t.id)).toEqual(['t2'])
  })
})
