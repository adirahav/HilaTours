import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BusModal } from './BusModal'
import type { Bus } from '../types/bus.types'
import type { Seat, SeatStatus } from '../types/seat.types'
import type { BusType } from '../types/busType.types'
import { useStore } from '../store/store'

const busTypeFixture = (
  id: string,
  name: string,
  totalSeats: number,
  isDefault: boolean
): BusType => ({
  id,
  name,
  description: '',
  totalSeats,
  standardRowsCount: 13,
  doorRow: 7,
  backRowSeatsCount: 5,
  disabledSeatSlots: [],
  isDefault,
  createdAt: '2026-08-01'
})

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn()
}))

vi.mock('sonner', () => ({ toast: toastMock }))

const buildSeat = (seatNumber: number, status: SeatStatus): Seat => ({
  id: `bus1-seat${seatNumber}`,
  seatNumber,
  row: Math.ceil(seatNumber / 4),
  col: ((seatNumber - 1) % 4) + 1,
  seatStatus: status
})

const editBus: Bus = {
  id: 'bus1',
  tourId: 't1',
  busName: 'אוטובוס 1',
  description: 'ממוזג',
  pickupPoints: ['תל אביב', 'נתניה'],
  totalSeats: 55,
  driverSide: 'left',
  doorPosition: 'front',
  isDefault: false,
  seats: []
}

describe('BusModal', () => {
  beforeEach(() => {
    toastMock.error.mockClear()
    toastMock.success.mockClear()
    // Bus type templates are global store state — reset so tests that expect
    // the manual seat-count path don't inherit another test's templates.
    useStore.setState({ busTypes: [] })
  })

  it('offers bus type templates on create, preselects the default one and reports it to onSave', async () => {
    useStore.setState({
      busTypes: [
        busTypeFixture('bt1', 'דגם 55', 55, false),
        busTypeFixture('bt2', 'דגם 49', 49, true)
      ]
    })
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<BusModal isOpen onClose={() => {}} onSave={onSave} />)

    const select = screen.getByLabelText(/יצירה מדגם אוטובוס/) as HTMLSelectElement
    expect(select.value).toBe('bt2')

    await user.type(screen.getByLabelText(/שם\/מזהה האוטובוס/), 'אוטובוס מתבנית')
    await user.click(screen.getByRole('button', { name: 'שמור אוטובוס' }))

    // The template's own seat count is reported, and its id is passed so the
    // server generates the seatLayout instead of the client sending one.
    expect(onSave).toHaveBeenCalledWith(
      'אוטובוס מתבנית',
      '',
      [],
      49,
      'left',
      'front',
      'bt2'
    )
  })

  it('does not offer templates when editing an existing bus — layouts are never remapped', () => {
    useStore.setState({ busTypes: [busTypeFixture('bt1', 'דגם 55', 55, true)] })
    render(<BusModal isOpen onClose={() => {}} onSave={() => {}} busToEdit={editBus} />)
    expect(screen.queryByLabelText(/יצירה מדגם אוטובוס/)).not.toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <BusModal isOpen={false} onClose={() => {}} onSave={() => {}} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the add heading and dialog role when open with no bus', () => {
    render(<BusModal isOpen onClose={() => {}} onSave={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(
      screen.getByRole('heading', { name: 'הוספת אוטובוס נוסף לטיול' })
    ).toBeInTheDocument()
  })

  it('pre-fills fields and shows edit heading in edit mode', () => {
    render(<BusModal isOpen onClose={() => {}} onSave={() => {}} busToEdit={editBus} />)
    expect(screen.getByRole('heading', { name: 'עריכת אוטובוס' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('אוטובוס 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ממוזג')).toBeInTheDocument()
    expect(screen.getByText('תל אביב')).toBeInTheDocument()
    expect(screen.getByText('נתניה')).toBeInTheDocument()
  })

  it('blocks submit and shows an inline error (not a toast) when name is empty', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<BusModal isOpen onClose={() => {}} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: 'שמור אוטובוס' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(screen.getByText('יש להזין שם/מזהה לאוטובוס')).toBeInTheDocument()
  })

  it('allows submit with no pickup points', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<BusModal isOpen onClose={() => {}} onSave={onSave} />)
    await user.type(screen.getByLabelText(/שם\/מזהה האוטובוס/), 'אוטובוס בדיקה')
    await user.click(screen.getByRole('button', { name: 'שמור אוטובוס' }))
    expect(onSave).toHaveBeenCalled()
    expect(screen.queryByText('אנא הוסף לפחות נקודת איסוף אחת לאוטובוס')).not.toBeInTheDocument()
  })

  it('adds and removes pickup points', async () => {
    const user = userEvent.setup()
    render(<BusModal isOpen onClose={() => {}} onSave={() => {}} />)
    const input = screen.getByLabelText(/נקודות איסוף/)
    await user.type(input, 'חיפה')
    await user.click(screen.getByRole('button', { name: 'הוסף' }))
    expect(screen.getByText('חיפה')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'מחק את חיפה' }))
    expect(screen.queryByText('חיפה')).not.toBeInTheDocument()
  })

  it('reorders pickup points with the arrow buttons', async () => {
    const user = userEvent.setup()
    render(<BusModal isOpen onClose={() => {}} onSave={() => {}} busToEdit={editBus} />)
    const list = screen.getByRole('list')
    const before = within(list).getAllByRole('listitem').map((li) => li.textContent)
    expect(before[0]).toContain('תל אביב')

    await user.click(screen.getByRole('button', { name: 'הזז את נתניה למעלה' }))
    const after = within(list).getAllByRole('listitem').map((li) => li.textContent)
    expect(after[0]).toContain('נתניה')
  })

  it('selects the bus size matching the edited bus, and switching picks the other one', async () => {
    const user = userEvent.setup()
    render(<BusModal isOpen onClose={() => {}} onSave={() => {}} busToEdit={editBus} />)
    expect(screen.getByRole('radio', { name: '55 מושבים' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '59 מושבים' })).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByRole('radio', { name: '59 מושבים' }))
    expect(screen.getByRole('radio', { name: '59 מושבים' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '55 מושבים' })).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onSave with trimmed values and closes on valid submit', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<BusModal isOpen onClose={onClose} onSave={onSave} />)

    await user.type(screen.getByLabelText(/שם\/מזהה האוטובוס/), '  אוטובוס חדש  ')
    await user.type(screen.getByLabelText(/תיאור האוטובוס/), '  תיאור  ')
    const pickupInput = screen.getByLabelText(/נקודות איסוף/)
    await user.type(pickupInput, 'תל אביב{Enter}')

    await user.click(screen.getByRole('button', { name: 'שמור אוטובוס' }))

    expect(onSave).toHaveBeenCalledWith(
      'אוטובוס חדש',
      'תיאור',
      ['תל אביב'],
      55,
      'left',
      'front',
      // F11: no bus type template selected, so the manual seat count is used.
      null
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('disables a bus size smaller than the highest occupied seat number (Q6)', async () => {
    const onSave = vi.fn()
    const busWithOccupied: Bus = {
      ...editBus,
      totalSeats: 59,
      seats: [buildSeat(56, 'taken')]
    }
    render(<BusModal isOpen onClose={() => {}} onSave={onSave} busToEdit={busWithOccupied} />)
    // 55 < 56 (the highest occupied seat number) so it must be disabled.
    expect(screen.getByRole('radio', { name: '55 מושבים' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '59 מושבים' })).not.toBeDisabled()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<BusModal isOpen onClose={onClose} onSave={() => {}} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose from the cancel button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<BusModal isOpen onClose={onClose} onSave={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(onClose).toHaveBeenCalled()
  })
})
