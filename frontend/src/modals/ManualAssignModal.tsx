import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, CheckCircle, Lock, Trash2, X } from 'lucide-react'
import type { Seat, SeatStatus } from '../types/seat.types'
import { cn } from '../lib/utils'

interface ManualAssignModalProps {
  isOpen: boolean
  onClose: () => void
  seat: Seat | null
  pickupPoints: string[]
  onSaveAssign: (
    seatNumber: number,
    passengerName: string,
    passengerPhone: string,
    pickupPoint: string,
    notes: string,
    status: 'taken' | 'pending'
  ) => void
  onApprove: (seatNumber: number) => void
  onCancel: (seatNumber: number) => void
  onToggleReserve: (seatNumber: number) => void
}

const STATUS_LABEL: Record<SeatStatus, string> = {
  available: 'פנוי',
  pending: 'ממתין לאישור',
  taken: 'תפוס / HOLD',
  reserved: 'שמור ע"י הנהלה'
}

const STATUS_BADGE: Record<SeatStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800',
  pending: 'bg-amber-100 text-amber-800',
  taken: 'bg-rose-100 text-rose-800',
  reserved: 'bg-purple-100 text-purple-800'
}

export function ManualAssignModal({
  isOpen,
  onClose,
  seat,
  pickupPoints,
  onSaveAssign,
  onApprove,
  onCancel,
  onToggleReserve
}: ManualAssignModalProps) {
  const [passengerName, setPassengerName] = useState('')
  const [passengerPhone, setPassengerPhone] = useState('')
  const [pickupPoint, setPickupPoint] = useState('')
  const [notes, setNotes] = useState('')
  const [assignStatus, setAssignStatus] = useState<'taken' | 'pending'>('taken')
  const [nameInvalid, setNameInvalid] = useState(false)

  const titleId = useId()
  const nameErrorId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen || !seat) return
    setPassengerName(seat.passengerName || '')
    setPassengerPhone(seat.passengerPhone || '')
    setPickupPoint(seat.pickupPoint || '')
    setNotes(seat.notes || '')
    setAssignStatus(seat.seatStatus === 'pending' ? 'pending' : 'taken')
    setNameInvalid(false)
  }, [seat, isOpen])

  useEffect(() => {
    if (isOpen && seat) nameInputRef.current?.focus()
  }, [isOpen, seat])

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

  if (!isOpen || !seat) return null

  const currentSeat = seat
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = passengerName.trim()
    if (!trimmedName) {
      setNameInvalid(true)
      nameInputRef.current?.focus()
      return
    }
    onSaveAssign(
      currentSeat.seatNumber,
      trimmedName,
      passengerPhone.trim(),
      pickupPoint,
      notes.trim(),
      assignStatus
    )
    onClose()
  }

  const inputClass =
    'w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none'

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
          <div>
            <h3 id={titleId} className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>ניהול מושב #{currentSeat.seatNumber}</span>
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-md font-semibold',
                  STATUS_BADGE[currentSeat.seatStatus]
                )}
              >
                {STATUS_LABEL[currentSeat.seatStatus]}
              </span>
            </h3>
            <p className="text-xs text-slate-500">עריכת פרטי נוסע ופעולות מנהל למושב זה</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="סגור חלון"
            className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          {currentSeat.seatStatus === 'pending' && (
            <button
              type="button"
              onClick={() => {
                onApprove(currentSeat.seatNumber)
                onClose()
              }}
              className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <CheckCircle className="w-4 h-4" aria-hidden="true" />
              <span>אשר HOLD כעת</span>
            </button>
          )}

          {(currentSeat.seatStatus === 'pending' || currentSeat.seatStatus === 'taken') && (
            <button
              type="button"
              onClick={() => {
                onCancel(currentSeat.seatNumber)
                onClose()
              }}
              className="py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-700"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>בטל / שחרר מושב</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onToggleReserve(currentSeat.seatNumber)
              onClose()
            }}
            className="py-2.5 bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 col-span-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            <Lock className="w-4 h-4" aria-hidden="true" />
            <span>
              {currentSeat.seatStatus === 'reserved'
                ? 'שחרר ממושב שמור'
                : 'סמן כמושב שמור (נעול למשתמשים)'}
            </span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 pt-3 border-t border-slate-100">
          <div className="text-xs font-bold text-slate-800">
            {currentSeat.seatStatus === 'available'
              ? 'רישום ידני של נוסע למושב זה:'
              : 'עדכון פרטי נוסע למושב:'}
          </div>

          <div>
            <label htmlFor={`${titleId}-name`} className="block text-[11px] font-bold text-slate-600 mb-1">
              שם הנוסע (חובה):
            </label>
            <input
              id={`${titleId}-name`}
              ref={nameInputRef}
              type="text"
              placeholder="ישראל ישראלי"
              value={passengerName}
              aria-invalid={nameInvalid}
              aria-describedby={nameInvalid ? nameErrorId : undefined}
              onChange={(e) => {
                setPassengerName(e.target.value)
                if (nameInvalid) setNameInvalid(false)
              }}
              className={cn(inputClass, nameInvalid && 'border-rose-400 focus:ring-rose-500')}
            />
            {nameInvalid && (
              <p
                id={nameErrorId}
                className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>אנא הזן שם נוסע</span>
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${titleId}-phone`} className="block text-[11px] font-bold text-slate-600 mb-1">
              טלפון:
            </label>
            <input
              id={`${titleId}-phone`}
              type="tel"
              placeholder="050-0000000"
              value={passengerPhone}
              onChange={(e) => setPassengerPhone(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor={`${titleId}-pickup`} className="block text-[11px] font-bold text-slate-600 mb-1">
              נקודת איסוף:
            </label>
            <select
              id={`${titleId}-pickup`}
              value={pickupPoint}
              onChange={(e) => setPickupPoint(e.target.value)}
              className={inputClass}
            >
              <option value="">-- ללא / לא נבחר --</option>
              {pickupPoints.map((point) => (
                <option key={point} value={point}>
                  {point}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${titleId}-notes`} className="block text-[11px] font-bold text-slate-600 mb-1">
              הערות:
            </label>
            <input
              id={`${titleId}-notes`}
              type="text"
              placeholder="הערה פנימית..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <span className="block text-[11px] font-bold text-slate-600 mb-1">סטטוס לאחר שמירה:</span>
            <div className="flex gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="assignStatus"
                  value="taken"
                  checked={assignStatus === 'taken'}
                  onChange={() => setAssignStatus('taken')}
                  className="focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                />
                <span>מאושר / HOLD (תפוס)</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="assignStatus"
                  value="pending"
                  checked={assignStatus === 'pending'}
                  onChange={() => setAssignStatus('pending')}
                  className="focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                />
                <span>ממתין לאישור</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              סגור
            </button>
            <button
              type="submit"
              className="w-1/2 py-2.5 bg-amber-500 text-slate-950 font-bold rounded-xl shadow-xs hover:bg-amber-600 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            >
              שמור שינויים
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}