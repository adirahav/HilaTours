import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TourModal } from './TourModal'
import type { Tour } from '../types/tour.types'

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn()
}))

vi.mock('sonner', () => ({ toast: toastMock }))

function futureDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

const editTour: Tour = {
  id: 't1',
  title: 'טיול לגולן',
  date: futureDate(),
  description: 'מסלול יפה',
  buses: [],
  createdAt: '2026-01-01'
}

describe('TourModal', () => {
  beforeEach(() => {
    toastMock.error.mockClear()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <TourModal isOpen={false} onClose={() => {}} onSave={() => {}} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the add heading and dialog role when open with no tour', () => {
    render(<TourModal isOpen onClose={() => {}} onSave={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'הוספת טיול חדש' })).toBeInTheDocument()
  })

  it('pre-fills fields and shows edit heading in edit mode', () => {
    render(<TourModal isOpen onClose={() => {}} onSave={() => {}} tourToEdit={editTour} />)
    expect(screen.getByRole('heading', { name: 'עריכת טיול קיים' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('טיול לגולן')).toBeInTheDocument()
    expect(screen.getByDisplayValue('מסלול יפה')).toBeInTheDocument()
  })

  it('blocks submit and shows an inline error (not a toast) when title is empty', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<TourModal isOpen onClose={() => {}} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: 'שמור טיול חדש' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(screen.getByText('יש להזין שם טיול')).toBeInTheDocument()
  })

  it('blocks submit and shows an inline error (not a toast) when the date is not in the future', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const pastTour: Tour = { ...editTour, date: '2020-01-01' }
    render(<TourModal isOpen onClose={() => {}} onSave={onSave} tourToEdit={pastTour} />)
    await user.click(screen.getByRole('button', { name: 'עדכן טיול' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(screen.getByText('יש לבחור תאריך יציאה עתידי')).toBeInTheDocument()
  })

  it('calls onSave with trimmed values and closes on valid submit', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onClose = vi.fn()
    const date = futureDate()
    // Edit mode pre-fills a valid future date, avoiding native date-input typing.
    const tour: Tour = { ...editTour, title: 'ישן', date, description: '' }
    render(<TourModal isOpen onClose={onClose} onSave={onSave} tourToEdit={tour} />)

    const title = screen.getByLabelText(/שם הטיול/)
    await user.clear(title)
    await user.type(title, '  טיול חדש  ')
    await user.type(screen.getByLabelText(/תיאור/), '  פרטים  ')

    await user.click(screen.getByRole('button', { name: 'עדכן טיול' }))

    expect(onSave).toHaveBeenCalledWith('טיול חדש', date, 'פרטים')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TourModal isOpen onClose={onClose} onSave={() => {}} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose from the cancel button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TourModal isOpen onClose={onClose} onSave={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(onClose).toHaveBeenCalled()
  })
})
