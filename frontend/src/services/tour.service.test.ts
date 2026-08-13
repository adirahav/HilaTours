import { describe, it, expect, vi, beforeEach } from 'vitest'
import { httpService } from './http.service'
import { tourService } from './tour.service'
import { useStore } from '../store/store'
import type { RawTour } from '../lib/tourMapper'

vi.mock('./http.service', () => ({
  tourClient: {},
  httpService: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn()
  }
}))

const getMock = vi.mocked(httpService.get)
const putMock = vi.mocked(httpService.put)

const rawTour: RawTour = {
  id: 't1',
  name: 'טיול לגולן',
  date: '2026-08-15',
  description: '',
  createdAt: '2026-08-01T00:00:00.000Z',
  buses: [
    {
      id: 'bus1',
      tourId: 't1',
      name: 'אוטובוס 1',
      totalSeats: 52,
      pickupPoints: [{ name: 'תחנה מרכזית', order: 1 }],
      seats: [
        { id: 's1', position: '1A', status: 'available' },
        { id: 's2', position: '1B', status: 'taken' }
      ]
    }
  ]
}

describe('tourService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ tours: [] })
  })

  describe('query', () => {
    it('maps the backend shape and stores frontend-shaped tours', async () => {
      getMock.mockResolvedValueOnce([rawTour])

      const tours = await tourService.query()

      expect(getMock).toHaveBeenCalledWith(expect.anything(), '/tour')
      expect(tours[0].id).toBe('t1')
      expect(tours[0].title).toBe('טיול לגולן')
      expect(tours[0].buses[0].busName).toBe('אוטובוס 1')
      expect(tours[0].buses[0].seats[0]).toMatchObject({
        id: 's1',
        seatNumber: 1,
        seatStatus: 'available'
      })
      expect(useStore.getState().tours).toEqual(tours)
    })

    it('tolerates tours returned without a buses field', async () => {
      getMock.mockResolvedValueOnce([{ id: 't9', name: 'ישן' }])
      const tours = await tourService.query()
      expect(tours[0].buses).toEqual([])
    })
  })

  describe('getById', () => {
    it('maps the embedded buses/seats of a single tour', async () => {
      getMock.mockResolvedValueOnce(rawTour)

      const tour = await tourService.getById('t1')

      expect(getMock).toHaveBeenCalledWith(expect.anything(), '/tour/t1')
      expect(tour.buses[0].seats).toHaveLength(2)
      expect(tour.buses[0].seats[1].seatStatus).toBe('taken')
    })
  })

  describe('save', () => {
    it('keeps already-loaded buses when the save response omits them', async () => {
      getMock.mockResolvedValueOnce([rawTour])
      await tourService.query()

      putMock.mockResolvedValueOnce({ id: 't1', name: 'שם מעודכן' })
      const saved = await tourService.save({ id: 't1', title: 'שם מעודכן' })

      expect(saved.title).toBe('שם מעודכן')
      expect(saved.buses[0].seats).toHaveLength(2)
      expect(useStore.getState().tours[0].buses[0].seats).toHaveLength(2)
    })
  })
})
