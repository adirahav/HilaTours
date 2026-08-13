import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BusModal } from './BusModal'
import type { Bus } from '../types/bus.types'
import type { Seat, SeatStatus } from '../types/seat.types'

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
  totalSeats: 54,
  driverSide: 'left',
  doorPosition: 'front',
  isDefault: false,
  seats: []
}

describe('BusModal', () => {
  beforeEach(() => {
    toastMock.error.mockClear()
    toastMock.success.mockClear()
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

  it('blocks submit and shows an inline error (not a toast) when there are no pickup points', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<BusModal isOpen onClose={() => {}} onSave={onSave} />)
    await user.type(screen.getByLabelText(/שם\/מזהה האוטובוס/), 'אוטובוס בדיקה')
    await user.click(screen.getByRole('button', { name: 'שמור אוטובוס' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(screen.getByText('אנא הוסף לפחות נקודת איסוף אחת לאוטובוס')).toBeInTheDocument()
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

  it('updates totalSeats from the range slider', async () => {
    render(<BusModal isOpen onClose={() => {}} onSave={() => {}} busToEdit={editBus} />)
    const slider = screen.getByLabelText(/מספר מושבים/) as HTMLInputElement
    expect(slider.value).toBe('54')
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
      52,
      'left',
      'front'
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('blocks reducing seats below occupied seat numbers (Q6)', async () => {
    const onSave = vi.fn()
    const busWithOccupied: Bus = {
      ...editBus,
      totalSeats: 58,
      seats: [buildSeat(56, 'taken')]
    }
    render(<BusModal isOpen onClose={() => {}} onSave={onSave} busToEdit={busWithOccupied} />)
    const slider = screen.getByLabelText(/מספר מושבים/) as HTMLInputElement
    // The slider minimum is clamped to the highest occupied seat number.
    expect(slider.min).toBe('56')
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
