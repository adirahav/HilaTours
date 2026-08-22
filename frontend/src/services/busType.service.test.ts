import { describe, it, expect, vi, beforeEach } from 'vitest'
import { httpService } from './http.service'
import { busTypeService } from './busType.service'
import { useStore } from '../store/store'
import type { BusType } from '../types/busType.types'

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
const delMock = vi.mocked(httpService.del)

const rawBusType = {
  id: 'bt1',
  name: 'אוטובוס 55',
  description: 'סטנדרטי',
  totalSeats: 55,
  standardRowsCount: 13,
  doorRow: 7,
  backRowSeatsCount: 5,
  disabledSeatSlots: [],
  isDefault: false,
  createdAt: '2026-08-01'
}

const storedBusType = (overrides: Partial<BusType> = {}): BusType => ({
  id: 'bt1',
  name: 'אוטובוס 55',
  description: 'סטנדרטי',
  totalSeats: 55,
  standardRowsCount: 13,
  doorRow: 7,
  backRowSeatsCount: 5,
  disabledSeatSlots: [],
  isDefault: false,
  createdAt: '2026-08-01',
  ...overrides
})

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ busTypes: [], selectedBusTypeId: null })
})

describe('busTypeService.query', () => {
  it('fetches /busType and writes the mapped list into the store', async () => {
    getMock.mockResolvedValueOnce([rawBusType])

    const result = await busTypeService.query()

    expect(getMock).toHaveBeenCalledWith(expect.anything(), '/busType')
    expect(result).toHaveLength(1)
    expect(useStore.getState().busTypes[0].name).toBe('אוטובוס 55')
  })

  it('derives totalSeats from the layout when the backend omits it', async () => {
    getMock.mockResolvedValueOnce([{ ...rawBusType, totalSeats: undefined }])

    const [busType] = await busTypeService.query()

    expect(busType.totalSeats).toBe(55)
  })
})

describe('busTypeService.create / update', () => {
  it('never sends a client-computed totalSeats — the server derives it', async () => {
    postMock.mockResolvedValueOnce(rawBusType)

    await busTypeService.create({
      name: 'חדש',
      standardRowsCount: 13,
      doorRow: 7,
      backRowSeatsCount: 5,
      disabledSeatSlots: []
    })

    const [, url, payload] = postMock.mock.calls[0]
    expect(url).toBe('/busType')
    expect(payload).not.toHaveProperty('totalSeats')
    expect(payload).toMatchObject({ name: 'חדש', doorRow: 7 })
  })

  it('PUTs to the id route and upserts the result into the store', async () => {
    useStore.setState({ busTypes: [storedBusType()] })
    putMock.mockResolvedValueOnce({ ...rawBusType, name: 'שם מעודכן' })

    await busTypeService.update('bt1', {
      name: 'שם מעודכן',
      standardRowsCount: 13,
      doorRow: 7,
      backRowSeatsCount: 5,
      disabledSeatSlots: []
    })

    expect(putMock).toHaveBeenCalledWith(expect.anything(), '/busType/bt1', expect.anything())
    expect(useStore.getState().busTypes).toHaveLength(1)
    expect(useStore.getState().busTypes[0].name).toBe('שם מעודכן')
  })
})

describe('busTypeService.duplicate', () => {
  it('persists a copy of the layout under a "(עותק)" name and never marks it default', async () => {
    postMock.mockResolvedValueOnce({ ...rawBusType, id: 'bt2', name: 'אוטובוס 55 (עותק)' })

    const copy = await busTypeService.duplicate(
      storedBusType({ isDefault: true, disabledSeatSlots: ['1-1'] })
    )

    const [, , payload] = postMock.mock.calls[0]
    expect(payload).toMatchObject({
      name: 'אוטובוס 55 (עותק)',
      disabledSeatSlots: ['1-1'],
      isDefault: false
    })
    expect(copy.id).toBe('bt2')
  })
})

describe('busTypeService.remove', () => {
  it('soft-deletes via DELETE and drops the template from the store', async () => {
    useStore.setState({ busTypes: [storedBusType()], selectedBusTypeId: 'bt1' })
    delMock.mockResolvedValueOnce(undefined)

    await busTypeService.remove('bt1')

    expect(delMock).toHaveBeenCalledWith(expect.anything(), '/busType/bt1')
    expect(useStore.getState().busTypes).toHaveLength(0)
    expect(useStore.getState().selectedBusTypeId).toBeNull()
  })
})

describe('busType slice default exclusivity', () => {
  it('clears isDefault on every other template when one is marked default', () => {
    useStore.setState({
      busTypes: [storedBusType({ id: 'bt1', isDefault: true }), storedBusType({ id: 'bt2' })]
    })

    useStore.getState().upsertBusType(storedBusType({ id: 'bt2', isDefault: true }))

    const flags = useStore.getState().busTypes.map((t) => t.isDefault)
    expect(flags).toEqual([false, true])
  })
})
