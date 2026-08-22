import { describe, it, expect, vi, beforeEach } from 'vitest'
import { httpService } from './http.service'
import { busService } from './bus.service'
import { useStore } from '../store/store'
import type { RawBus } from '../lib/tourMapper'
import type { Bus } from '../types/bus.types'
import type { Tour } from '../types/tour.types'

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
const postMock = vi.mocked(httpService.post)
const putMock = vi.mocked(httpService.put)

const busForm: Partial<Bus> = {
  busName: 'אוטובוס 1',
  description: 'מרכז',
  pickupPoints: ['תחנה מרכזית', 'צפון'],
  totalSeats: 3,
  driverSide: 'left',
  doorPosition: 'front'
}

const rawResponse: RawBus = {
  id: 'bus1',
  tourId: 't1',
  name: 'אוטובוס 1',
  totalSeats: 3,
  pickupPoints: [{ name: 'תחנה מרכזית', order: 0 }],
  isDefault: false,
  seats: []
}

describe('busService.save', () => {
  beforeEach(() => vi.clearAllMocks())

  it('translates busName/totalSeats/pickupPoints into the backend BusInput shape on create', async () => {
    postMock.mockResolvedValueOnce(rawResponse)

    await busService.save('t1', busForm)

    expect(postMock).toHaveBeenCalledWith(expect.anything(), '/tour/t1/buses', {
      name: 'אוטובוס 1',
      seatLayout: { positions: ['1', '2', '3'] },
      pickupPoints: [
        { name: 'תחנה מרכזית', order: 0 },
        { name: 'צפון', order: 1 }
      ]
    })
  })

  it('never forwards busName/totalSeats/driverSide/doorPosition raw — the backend contract has no such fields', async () => {
    postMock.mockResolvedValueOnce(rawResponse)
    await busService.save('t1', busForm)

    const [, , payload] = postMock.mock.calls[0]
    expect(payload).not.toHaveProperty('busName')
    expect(payload).not.toHaveProperty('totalSeats')
    expect(payload).not.toHaveProperty('driverSide')
    expect(payload).not.toHaveProperty('doorPosition')
  })

  it('PUTs to the bus id route on update and maps the response back to a frontend Bus', async () => {
    putMock.mockResolvedValueOnce(rawResponse)

    const saved = await busService.save('t1', { ...busForm, id: 'bus1' })

    expect(putMock).toHaveBeenCalledWith(
      expect.anything(),
      '/tour/t1/buses/bus1',
      expect.objectContaining({ name: 'אוטובוס 1' })
    )
    expect(saved.id).toBe('bus1')
    expect(saved.busName).toBe('אוטובוס 1')
  })
})

describe('busService.save with a bus type template (F11)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends busTypeId instead of seatLayout — the two are mutually exclusive', async () => {
    postMock.mockResolvedValueOnce(rawResponse)

    await busService.save('t1', busForm, 'bt1')

    const [, , payload] = postMock.mock.calls[0]
    expect(payload).toMatchObject({ name: 'אוטובוס 1', busTypeId: 'bt1' })
    expect(payload).not.toHaveProperty('seatLayout')
  })

  it('falls back to an explicit seatLayout when no template is chosen', async () => {
    postMock.mockResolvedValueOnce(rawResponse)

    await busService.save('t1', busForm, null)

    const [, , payload] = postMock.mock.calls[0]
    expect(payload).toHaveProperty('seatLayout')
    expect(payload).not.toHaveProperty('busTypeId')
  })

  it('never sends busTypeId when updating an existing bus — layouts are not remapped', async () => {
    putMock.mockResolvedValueOnce(rawResponse)

    await busService.save('t1', { ...busForm, id: 'bus1' }, 'bt1')

    const [, , payload] = putMock.mock.calls[0]
    expect(payload).not.toHaveProperty('busTypeId')
    expect(payload).toHaveProperty('seatLayout')
  })
})

describe('busService.loadWithPii', () => {
  beforeEach(() => vi.clearAllMocks())

  const tourWithBus = (): Tour => ({
    id: 't1',
    title: 'טיול',
    date: '2026-08-15',
    description: '',
    createdAt: '2026-08-01',
    buses: [
      {
        id: 'bus1',
        tourId: 't1',
        busName: 'אוטובוס 1',
        description: '',
        pickupPoints: [],
        driverSide: 'left',
        doorPosition: 'front',
        isDefault: false,
        totalSeats: 1,
        seats: [{ id: 'seat1', seatNumber: 1, row: 1, col: 1, seatStatus: 'available' }]
      }
    ]
  })

  it('fetches the authenticated single-bus route and merges PII into the store for that bus', async () => {
    useStore.setState({ tours: [tourWithBus()] })
    getMock.mockResolvedValueOnce({
      id: 'bus1',
      totalSeats: 1,
      seats: [
        {
          id: 'seat1',
          position: '1',
          status: 'taken',
          passengerName: 'דנה כהן',
          passengerPhone: '0501112222',
          pickupPointName: 'תחנה מרכזית'
        }
      ]
    })

    await busService.loadWithPii('t1', 'bus1')

    expect(getMock).toHaveBeenCalledWith(expect.anything(), '/tour/t1/buses/bus1')
    const seat = useStore.getState().tours[0].buses[0].seats[0]
    expect(seat.passengerName).toBe('דנה כהן')
    expect(seat.pickupPoint).toBe('תחנה מרכזית')
  })
})
