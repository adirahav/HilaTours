import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BusTypeManagement } from './BusTypeManagement'
import { busTypeService } from '../services/busType.service'
import { useStore } from '../store/store'
import type { BusType } from '../types/busType.types'

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('../services/busType.service', () => ({
  busTypeService: {
    query: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn()
  }
}))

const queryMock = vi.mocked(busTypeService.query)
const updateMock = vi.mocked(busTypeService.update)
const createMock = vi.mocked(busTypeService.create)

const busType: BusType = {
  id: 'bt1',
  name: 'דגם 55',
  description: 'סטנדרטי',
  totalSeats: 55,
  standardRowsCount: 13,
  doorRow: 7,
  backRowSeatsCount: 5,
  disabledSeatSlots: [],
  isDefault: false,
  createdAt: '2026-08-01'
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ busTypes: [], selectedBusTypeId: null })
})

describe('BusTypeManagement', () => {
  it('loads templates from the API on mount — never from localStorage', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    queryMock.mockImplementation(async () => {
      useStore.setState({ busTypes: [busType] })
      return [busType]
    })

    render(<BusTypeManagement />)

    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByDisplayValue('דגם 55')).toBeInTheDocument()
    expect(getItem).not.toHaveBeenCalledWith(expect.stringMatching(/busType/i))
    getItem.mockRestore()
  })

  it('shows the empty state and creates the first template through the service', async () => {
    const user = userEvent.setup()
    queryMock.mockResolvedValue([])
    createMock.mockResolvedValue(busType)

    render(<BusTypeManagement />)

    const cta = await screen.findByRole('button', { name: /צור תבנית ראשונה/ })
    await user.click(cta)

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ standardRowsCount: 13, doorRow: 7, backRowSeatsCount: 5 })
    )
  })

  it('shows an error toast when loading templates fails', async () => {
    queryMock.mockRejectedValue(new Error('boom'))

    render(<BusTypeManagement />)

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
  })

  it('blocks saving a template with an empty name using an inline error, not a toast', async () => {
    const user = userEvent.setup()
    queryMock.mockImplementation(async () => {
      useStore.setState({ busTypes: [busType] })
      return [busType]
    })

    render(<BusTypeManagement />)

    const nameInput = await screen.findByDisplayValue('דגם 55')
    await user.clear(nameInput)
    await user.click(screen.getByRole('button', { name: /שמור שינויים בתבנית האוטובוס/ }))

    expect(screen.getByText('יש להזין שם לסוג האוטובוס')).toBeInTheDocument()
    expect(updateMock).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('sends the edited layout to the service and recomputes the live seat count', async () => {
    const user = userEvent.setup()
    queryMock.mockImplementation(async () => {
      useStore.setState({ busTypes: [busType] })
      return [busType]
    })
    updateMock.mockResolvedValue(busType)

    render(<BusTypeManagement />)

    await screen.findByDisplayValue('דגם 55')
    // Disabling seat 1 (row 1, col 1) drops the live total from 55 to 54.
    await user.click(screen.getByRole('button', { name: /מושב 1 \(שורה 1, עמודה 1\)/ }))
    // Scope to the stats card — "54" also appears as a seat number in the grid.
    const statsCard = screen.getByText('סך מושבים').parentElement as HTMLElement
    expect(within(statsCard).getByText('54')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /שמור שינויים בתבנית האוטובוס/ }))

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        'bt1',
        expect.objectContaining({ name: 'דגם 55', disabledSeatSlots: ['1-1'] })
      )
    )
    expect(toastMock.success).toHaveBeenCalled()
  })
})
