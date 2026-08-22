import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Bus as BusIcon,
  Edit2,
  X,
  MapPin,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown
} from 'lucide-react'
import type { Bus, DriverSide, DoorPosition } from '../types/bus.types'
import { useStore } from '../store/store'
import { cn } from '../lib/utils'

interface BusModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (
    busName: string,
    description: string,
    pickupPoints: string[],
    totalSeats: number,
    driverSide: DriverSide,
    doorPosition: DoorPosition,
    // F11: when a bus type template is chosen, the server generates the
    // seatLayout from it. Null means "use the manual seat count" — the two are
    // mutually exclusive on the API, so exactly one of them is ever sent.
    busTypeId?: string | null
  ) => void
  busToEdit?: Bus | null
}

// Every bus in the fleet has the same fixed door layout — a front door at
// the driver's side plus a back door at row 8 (see BusMap.tsx) — so neither
// is a per-bus choice; there's no UI for either. onSave still takes both
// since the backend contract carries the fields.
const DRIVER_SIDE: DriverSide = 'left'
const DOOR_POSITION: DoorPosition = 'front'

export function BusModal({ isOpen, onClose, onSave, busToEdit }: BusModalProps) {
  const [busName, setBusName] = useState('')
  const [description, setDescription] = useState('')
  const [pickupPoints, setPickupPoints] = useState<string[]>([])
  const [newPickup, setNewPickup] = useState('')
  const [busTypeId, setBusTypeId] = useState<string | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [nameError, setNameError] = useState('')
  const [pickupError, setPickupError] = useState('')
  const [seatsError, setSeatsError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  // Templates are loaded into the store by the admin dashboard. Bus size is
  // always chosen from this list — there is no manual/free-form seat count.
  const busTypes = useStore((state) => state.busTypes)
  const selectedBusType = busTypes.find((t) => t.id === busTypeId) ?? null

  const titleId = useId()
  const nameErrorId = useId()
  const pickupErrorId = useId()
  const seatsErrorId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Product decision (2026-08-22): changing the bus type on an existing bus
  // is always allowed, even when seats are already occupied/booked. The
  // backend reseeds by position — seats whose position exists in both the
  // old and new layout keep their occupant untouched; only seats at
  // positions absent from the new layout (e.g. a smaller template, or a
  // door-row shift) lose their assignment. No size restriction is applied
  // here; the admin only has to explicitly confirm before doing this when
  // any seat is occupied, since some occupants may be affected (see
  // confirmReset) — this is a conservative warning, not a guarantee that
  // every occupied seat will actually be lost.
  const hasOccupiedSeats = useMemo(
    () => (busToEdit?.seats ?? []).some((s) => s.seatStatus !== 'available'),
    [busToEdit]
  )
  const isChangingBusType = !!busToEdit && selectedBusType !== null

  useEffect(() => {
    if (!isOpen) return
    if (busToEdit) {
      setBusName(busToEdit.busName)
      setDescription(busToEdit.description || '')
      setPickupPoints([...busToEdit.pickupPoints])
      // No link is kept between a bus and the template it was created from
      // (see plan 034, Open Question 2) — preselect the template whose seat
      // count matches, if any, else leave it for the admin to pick.
      setBusTypeId(busTypes.find((t) => t.totalSeats === busToEdit.totalSeats)?.id ?? null)
    } else {
      setBusName('')
      setDescription('')
      setPickupPoints([])
      // Preselect the template marked as default, if one exists.
      setBusTypeId(busTypes.find((t) => t.isDefault)?.id ?? null)
    }
    setNewPickup('')
    setNameError('')
    setPickupError('')
    setSeatsError('')
    setConfirmReset(false)
  }, [busToEdit, isOpen, busTypes])

  // Initial focus on the name input when opened.
  useEffect(() => {
    if (isOpen) nameInputRef.current?.focus()
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

  const handleAddPickup = () => {
    const trimmed = newPickup.trim()
    if (!trimmed) return
    setPickupPoints([...pickupPoints, trimmed])
    setNewPickup('')
  }

  const handleRemovePickup = (index: number) => {
    setPickupPoints(pickupPoints.filter((_, i) => i !== index))
  }

  const movePickup = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= pickupPoints.length) return
    const updated = [...pickupPoints]
    const [moved] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, moved)
    setPickupPoints(updated)
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) setDragOverIndex(index)
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      movePickup(draggedIndex, targetIndex)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setNameError('')
    setPickupError('')
    setSeatsError('')
    const trimmedName = busName.trim()
    let hasError = false
    if (!trimmedName) {
      setNameError('יש להזין שם/מזהה לאוטובוס')
      hasError = true
    }
    if (!selectedBusType) {
      setSeatsError('יש לבחור דגם אוטובוס')
      hasError = true
    } else if (isChangingBusType && hasOccupiedSeats && !confirmReset) {
      // Confirmation guard: the backend reseeds by position (positions
      // shared with the new layout keep their occupant; positions absent
      // from it lose theirs) — always allowed, never size-blocked, but
      // requires explicit admin confirmation whenever any seat is occupied
      // (product decision, 2026-08-22).
      setSeatsError('יש לאשר את השינוי לפני החלפת הדגם')
      hasError = true
    }
    if (hasError) return
    onSave(
      trimmedName,
      description.trim(),
      pickupPoints,
      selectedBusType!.totalSeats,
      DRIVER_SIDE,
      DOOR_POSITION,
      selectedBusType!.id
    )
    onClose()
  }

  const inputClass =
    'w-full bg-slate-50 border border-slate-300 rounded-2xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none'

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
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
        className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 my-8"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              {busToEdit ? <Edit2 className="w-5 h-5" /> : <BusIcon className="w-5 h-5" />}
            </div>
            <div>
              <h3 id={titleId} className="text-lg font-bold text-slate-900">
                {busToEdit ? 'עריכת אוטובוס' : 'הוספת אוטובוס נוסף לטיול'}
              </h3>
              <p className="text-xs text-slate-500">
                הגדר תיאור, נקודות איסוף וגודל האוטובוס
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={`${titleId}-name`} className="block text-xs font-bold text-slate-700 mb-1">
              שם/מזהה האוטובוס (חובה):
            </label>
            <input
              id={`${titleId}-name`}
              ref={nameInputRef}
              type="text"
              placeholder="למשל: אוטובוס 1 - איסוף מרכז"
              value={busName}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? nameErrorId : undefined}
              onChange={(e) => {
                setBusName(e.target.value)
                if (nameError) setNameError('')
              }}
              className={cn(inputClass, nameError && 'border-rose-400 focus:ring-rose-500')}
            />
            {nameError && (
              <p
                id={nameErrorId}
                className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{nameError}</span>
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${titleId}-desc`} className="block text-xs font-bold text-slate-700 mb-1">
              תיאור האוטובוס:
            </label>
            <input
              id={`${titleId}-desc`}
              type="text"
              placeholder="אוטובוס תיירותי ממוזג עם Wi-Fi ומיזוג אוויר"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor={`${titleId}-bus-type`}
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              דגם אוטובוס (גודל וגריד המושבים):
            </label>
            {busTypes.length === 0 ? (
              <p className="text-[11px] font-semibold text-rose-600">
                אין דגמי אוטובוס מוגדרים במערכת — יש להגדיר דגם תחילה בניהול דגמי אוטובוס.
              </p>
            ) : (
              <>
                <select
                  id={`${titleId}-bus-type`}
                  value={busTypeId ?? ''}
                  aria-invalid={!!seatsError}
                  aria-describedby={seatsError ? seatsErrorId : undefined}
                  onChange={(e) => {
                    setBusTypeId(e.target.value || null)
                    setSeatsError('')
                  }}
                  className={cn(inputClass, seatsError && 'border-rose-400 focus:ring-rose-500')}
                >
                  <option value="">בחר דגם אוטובוס...</option>
                  {busTypes.map((busType) => (
                    <option key={busType.id} value={busType.id}>
                      {busType.name} ({busType.totalSeats} מושבים)
                      {busType.isDefault ? ' - ברירת מחדל' : ''}
                    </option>
                  ))}
                </select>
                {selectedBusType && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    מפת המושבים תיווצר לפי הדגם: {selectedBusType.totalSeats} מושבים,{' '}
                    {selectedBusType.standardRowsCount} שורות
                    {selectedBusType.doorRow ? `, דלת בשורה ${selectedBusType.doorRow}` : ', ללא דלת אמצעית'}.
                  </p>
                )}
                {isChangingBusType && hasOccupiedSeats && (
                  <div className="mt-2 rounded-2xl border border-amber-300 bg-amber-50 p-3">
                    <p className="text-[11px] font-semibold text-amber-800 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        שינוי הדגם יעדכן את מפת המושבים: נוסעים במושבים שקיימים גם בדגם החדש{' '}
                        <b>ישמרו את השיוך שלהם</b>, אך <b>מושבים שלא קיימים בדגם החדש</b> (למשל אם הדגם קטן
                        יותר, או שמיקום הדלת שונה) <b>יאבדו את שיוך הנוסע</b>. פעולה זו אינה הפיכה עבור
                        המושבים שנעלמים.
                      </span>
                    </p>
                    <label className="flex items-center gap-2 mt-2 text-[11px] font-medium text-amber-900">
                      <input
                        type="checkbox"
                        checked={confirmReset}
                        onChange={(e) => {
                          setConfirmReset(e.target.checked)
                          if (seatsError) setSeatsError('')
                        }}
                        className="rounded border-amber-400 text-amber-700 focus:ring-amber-500"
                      />
                      אני מבין/ה ומאשר/ת שמושבים שלא קיימים בדגם החדש יאבדו את שיוך הנוסע
                    </label>
                  </div>
                )}
              </>
            )}
            {seatsError && (
              <p
                id={seatsErrorId}
                className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{seatsError}</span>
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor={`${titleId}-pickup`} className="block text-xs font-bold text-slate-700">
                נקודות איסוף:
              </label>
              <span className="text-[11px] text-blue-600 font-medium">
                לחץ וגורר לשינוי סדר האיסוף
              </span>
            </div>

            <div className="flex gap-2 mb-2">
              <input
                id={`${titleId}-pickup`}
                type="text"
                placeholder="הוסף נקודת איסוף, למשל: תל אביב - רכבת מרכז"
                value={newPickup}
                aria-invalid={!!pickupError}
                aria-describedby={pickupError ? pickupErrorId : undefined}
                onChange={(e) => {
                  setNewPickup(e.target.value)
                  if (pickupError) setPickupError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddPickup()
                  }
                }}
                className={cn(
                  'flex-1 bg-slate-50 border border-slate-300 rounded-2xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none',
                  pickupError && 'border-rose-400 focus:ring-rose-500'
                )}
              />
              <button
                type="button"
                onClick={() => {
                  handleAddPickup()
                  setPickupError('')
                }}
                className="px-4 py-2 bg-slate-800 text-white font-bold text-xs rounded-2xl hover:bg-slate-700 transition focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                הוסף
              </button>
            </div>
            {pickupError && (
              <p
                id={pickupErrorId}
                className="text-[11px] font-semibold text-rose-600 mb-2 flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{pickupError}</span>
              </p>
            )}

            <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {pickupPoints.map((point, index) => {
                const isDragging = draggedIndex === index
                const isDragOver = dragOverIndex === index

                return (
                  <li
                    key={index}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      'flex items-center justify-between px-3 py-2.5 rounded-2xl border text-xs transition-all duration-150 cursor-grab active:cursor-grabbing select-none',
                      isDragging
                        ? 'opacity-40 bg-blue-50 border-blue-400 border-dashed scale-[0.98]'
                        : isDragOver
                          ? 'bg-blue-100 border-blue-500 shadow-md ring-2 ring-blue-300'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/80'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-slate-400 p-0.5" aria-hidden="true">
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" aria-hidden="true" />
                      <span className="font-medium text-slate-800 truncate">{point}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => movePickup(index, index - 1)}
                        aria-label={`הזז את ${point} למעלה`}
                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={index === pickupPoints.length - 1}
                        onClick={() => movePickup(index, index + 1)}
                        aria-label={`הזז את ${point} למטה`}
                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>

                      <span className="h-4 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

                      <button
                        type="button"
                        onClick={() => handleRemovePickup(index)}
                        aria-label={`מחק את ${point}`}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition focus:outline-none focus:ring-2 focus:ring-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-3 bg-slate-100 text-slate-700 font-semibold rounded-2xl hover:bg-slate-200 text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="w-1/2 py-3 bg-blue-600 text-white font-bold rounded-2xl shadow-md transition text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              {busToEdit ? 'עדכן אוטובוס' : 'שמור אוטובוס'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
