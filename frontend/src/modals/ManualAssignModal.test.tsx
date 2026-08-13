import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ManualAssignModal } from './ManualAssignModal'
import type { Seat, SeatStatus } from '../types/seat.types'

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn()
}))

vi.mock('sonner', () => ({ toast: toastMock }))

const buildSeat = (seatNumber: number, status: SeatStatus, extra: Partial<Seat> = {}): Seat => ({
  id: `bus1-seat${seatNumber}`,
  seatNumber,
  row: Math.ceil(seatNumber / 4),
  col: ((seatNumber - 1) % 4) + 1,
  seatStatus: status,
  ...extra
})

const pickupPoints = ['תל אביב', 'נתניה']

const noop = () => {}

function renderModal(overrides: Partial<React.ComponentProps<typeof ManualAssignModal>> = {}) {
  const props: React.ComponentProps<typeof ManualAssignModal> = {
    isOpen: true,
    onClose: noop,
    seat: buildSeat(5, 'available'),
    pickupPoints,
    onSaveAssign: noop,
    onApprove: noop,
    onCancel: noop,
    onToggleReserve: noop,
    ...overrides
  }
  return render(<ManualAssignModal {...props} />)
}

describe('ManualAssignModal', () => {
  beforeEach(() => {
    toastMock.error.mockClear()
    toastMock.success.mockClear()
  })

  it('renders nothing when closed', () => {
    const { container } = renderModal({ isOpen: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no seat', () => {
    const { container } = renderModal({ seat: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the dialog with seat number and status badge', () => {
    renderModal({ seat: buildSeat(12, 'pending') })
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const heading = screen.getByRole('heading', { name: /ניהול מושב #12/ })
    expect(heading).toBeInTheDocument()
    expect(within(heading).getByText('ממתין לאישור')).toBeInTheDocument()
  })

  it('shows approve + cancel for a pending seat', () => {
    renderModal({ seat: buildSeat(3, 'pending') })
    expect(screen.getByRole('button', { name: 'אשר HOLD כעת' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'בטל / שחרר מושב' })).toBeInTheDocument()
  })

  it('hides approve but shows cancel for a taken seat', () => {
    renderModal({ seat: buildSeat(3, 'taken') })
    expect(screen.queryByRole('button', { name: 'אשר HOLD כעת' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'בטל / שחרר מושב' })).toBeInTheDocument()
  })

  it('hides approve and cancel for an available seat', () => {
    renderModal({ seat: buildSeat(3, 'available') })
    expect(screen.queryByRole('button', { name: 'אשר HOLD כעת' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'בטל / שחרר מושב' })).not.toBeInTheDocument()
  })

  it('fires onApprove and closes when approving', async () => {
    const user = userEvent.setup()
    const onApprove = vi.fn()
    const onClose = vi.fn()
    renderModal({ seat: buildSeat(7, 'pending'), onApprove, onClose })
    await user.click(screen.getByRole('button', { name: 'אשר HOLD כעת' }))
    expect(onApprove).toHaveBeenCalledWith(7)
    expect(onClose).toHaveBeenCalled()
  })

  it('fires onCancel and closes when releasing', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onClose = vi.fn()
    renderModal({ seat: buildSeat(7, 'taken'), onCancel, onClose })
    await user.click(screen.getByRole('button', { name: 'בטל / שחרר מושב' }))
    expect(onCancel).toHaveBeenCalledWith(7)
    expect(onClose).toHaveBeenCalled()
  })

  it('fires onToggleReserve and closes from the reserve button', async () => {
    const user = userEvent.setup()
    const onToggleReserve = vi.fn()
    const onClose = vi.fn()
    renderModal({ seat: buildSeat(9, 'available'), onToggleReserve, onClose })
    await user.click(screen.getByRole('button', { name: /סמן כמושב שמור/ }))
    expect(onToggleReserve).toHaveBeenCalledWith(9)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the release-reserved label for a reserved seat', () => {
    renderModal({ seat: buildSeat(9, 'reserved') })
    expect(screen.getByRole('button', { name: 'שחרר ממושב שמור' })).toBeInTheDocument()
  })

  it('blocks submit and shows an inline error (not a toast) when name is empty', async () => {
    const user = userEvent.setup()
    const onSaveAssign = vi.fn()
    renderModal({ seat: buildSeat(4, 'available'), onSaveAssign })
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    expect(onSaveAssign).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(screen.getByText('אנא הזן שם נוסע')).toBeInTheDocument()
    expect(screen.getByLabelText(/שם הנוסע/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('submits successfully with only the name filled in — phone/pickup are optional', async () => {
    const user = userEvent.setup()
    const onSaveAssign = vi.fn()
    renderModal({ seat: buildSeat(4, 'available'), onSaveAssign })
    await user.type(screen.getByLabelText(/שם הנוסע/), 'ישראל ישראלי')
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    expect(onSaveAssign).toHaveBeenCalledWith(4, 'ישראל ישראלי', '', '', '', 'taken')
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('calls onSaveAssign with trimmed values and selected status', async () => {
    const user = userEvent.setup()
    const onSaveAssign = vi.fn()
    const onClose = vi.fn()
    renderModal({ seat: buildSeat(15, 'available'), onSaveAssign, onClose })

    await user.type(screen.getByLabelText(/שם הנוסע/), '  ישראל ישראלי  ')
    await user.type(screen.getByLabelText(/טלפון/), '050-1234567')
    await user.selectOptions(screen.getByLabelText(/נקודת איסוף/), 'נתניה')
    await user.type(screen.getByLabelText(/הערות/), '  ליד הדלת  ')
    await user.click(screen.getByLabelText('ממתין לאישור'))

    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))

    expect(onSaveAssign).toHaveBeenCalledWith(
      15,
      'ישראל ישראלי',
      '050-1234567',
      'נתניה',
      'ליד הדלת',
      'pending'
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('pre-fills passenger fields from an occupied seat', () => {
    renderModal({
      seat: buildSeat(20, 'taken', {
        passengerName: 'דנה כהן',
        passengerPhone: '052-9999999',
        pickupPoint: 'תל אביב',
        notes: 'הערה'
      })
    })
    expect(screen.getByDisplayValue('דנה כהן')).toBeInTheDocument()
    expect(screen.getByDisplayValue('052-9999999')).toBeInTheDocument()
    expect(screen.getByDisplayValue('הערה')).toBeInTheDocument()
    expect((screen.getByLabelText('מאושר / HOLD (תפוס)') as HTMLInputElement).checked).toBe(true)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal({ onClose })
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes from the close (X) button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal({ onClose })
    await user.click(screen.getByRole('button', { name: 'סגור חלון' }))
    expect(onClose).toHaveBeenCalled()
  })
})