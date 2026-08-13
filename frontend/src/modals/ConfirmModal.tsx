import { useEffect, useId, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '../lib/utils'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onClose: () => void
}

// App-level confirmation modal used for destructive actions (e.g. deleting a
// tour or bus) instead of the native window.confirm, per accessibility polish.
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'מחק',
  cancelLabel = 'ביטול',
  onConfirm,
  onClose
}: ConfirmModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  // Initial focus on the confirm button when opened.
  useEffect(() => {
    if (isOpen) confirmButtonRef.current?.focus()
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

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
        className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 id={titleId} className="text-lg font-bold text-slate-900">
              {title}
            </h3>
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

        <p className="text-sm text-slate-600 mb-6">{message}</p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-1/2 py-3 bg-slate-100 text-slate-700 font-semibold rounded-2xl hover:bg-slate-200 text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className={cn(
              'w-1/2 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-md transition text-sm focus:outline-none focus:ring-2 focus:ring-red-700'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
