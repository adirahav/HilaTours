import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, Calendar, Plus, Edit2, X } from 'lucide-react'
import type { Tour } from '../types/tour.types'
import { cn } from '../lib/utils'

interface TourModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (title: string, date: string, description: string) => void
  tourToEdit?: Tour | null
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

export function TourModal({ isOpen, onClose, onSave, tourToEdit }: TourModalProps) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [titleError, setTitleError] = useState('')
  const [dateError, setDateError] = useState('')

  const titleId = useId()
  const titleErrorId = useId()
  const dateErrorId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    if (tourToEdit) {
      setTitle(tourToEdit.title)
      setDate(tourToEdit.date)
      setDescription(tourToEdit.description || '')
    } else {
      setTitle('')
      setDate(todayIso())
      setDescription('')
    }
    setTitleError('')
    setDateError('')
  }, [tourToEdit, isOpen])

  // Initial focus on the title input when opened.
  useEffect(() => {
    if (isOpen) titleInputRef.current?.focus()
  }, [isOpen])

  // Escape-to-close + focus trap.
  useEffect(() => {
    if (!isOpen) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTitleError('')
    setDateError('')
    const trimmedTitle = title.trim()
    let hasError = false
    if (!trimmedTitle) {
      setTitleError('יש להזין שם טיול')
      hasError = true
    }
    if (!date) {
      setDateError('יש לבחור תאריך יציאה')
      hasError = true
    } else if (date <= todayIso()) {
      setDateError('יש לבחור תאריך יציאה עתידי')
      hasError = true
    }
    if (hasError) return
    onSave(trimmedTitle, date, description.trim())
    onClose()
  }

  const inputClass =
    'w-full bg-slate-50 border border-slate-300 rounded-2xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none'

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
        className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              {tourToEdit ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h3 id={titleId} className="text-lg font-bold text-slate-900">
                {tourToEdit ? 'עריכת טיול קיים' : 'הוספת טיול חדש'}
              </h3>
              <p className="text-xs text-slate-500">הזן שם טיול ותאריך יציאה</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={`${titleId}-title`} className="block text-xs font-bold text-slate-700 mb-1">
              שם הטיול (חובה):
            </label>
            <input
              id={`${titleId}-title`}
              ref={titleInputRef}
              type="text"
              placeholder="למשל: טיול סוף שבוע לרמת הגולן"
              value={title}
              aria-invalid={!!titleError}
              aria-describedby={titleError ? titleErrorId : undefined}
              onChange={e => {
                setTitle(e.target.value)
                if (titleError) setTitleError('')
              }}
              className={cn(inputClass, titleError && 'border-rose-400 focus:ring-rose-500')}
            />
            {titleError && (
              <p
                id={titleErrorId}
                className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{titleError}</span>
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${titleId}-date`} className="block text-xs font-bold text-slate-700 mb-1">
              תאריך יציאה (חובה):
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
              <input
                id={`${titleId}-date`}
                type="date"
                value={date}
                aria-invalid={!!dateError}
                aria-describedby={dateError ? dateErrorId : undefined}
                onChange={e => {
                  setDate(e.target.value)
                  if (dateError) setDateError('')
                }}
                className={cn(
                  inputClass,
                  'pr-10 pl-4',
                  dateError && 'border-rose-400 focus:ring-rose-500'
                )}
              />
            </div>
            {dateError && (
              <p
                id={dateErrorId}
                className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{dateError}</span>
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${titleId}-desc`} className="block text-xs font-bold text-slate-700 mb-1">
              תיאור הטיול / פרטים נוספים:
            </label>
            <textarea
              id={`${titleId}-desc`}
              rows={3}
              placeholder="תיאור קצר, מסלול, ציוד נדרש וכו'..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={cn(inputClass, 'py-2')}
            />
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-3 bg-slate-100 text-slate-700 font-semibold rounded-2xl hover:bg-slate-200 text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="w-1/2 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-2xl shadow-md transition text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
            >
              {tourToEdit ? 'עדכן טיול' : 'שמור טיול חדש'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

