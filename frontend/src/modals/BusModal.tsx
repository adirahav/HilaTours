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

// The fleet only has two physical bus sizes — not a free-form range.
const BUS_SIZES = [55, 59] as const
const DEFAULT_SEATS = BUS_SIZES[0]

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
  const [totalSeats, setTotalSeats] = useState<number>(DEFAULT_SEATS)
  const [busTypeId, setBusTypeId] = useState<string | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [nameError, setNameError] = useState('')
  const [pickupError, setPickupError] = useState('')
  const [seatsError, setSeatsError] = useState('')

  // Templates are loaded into the store by the admin dashboard. They only
  // apply when creating a bus — editing never remaps an existing seat map.
  const busTypes = useStore((state) => state.busTypes)
  const canUseBusType = !busToEdit && busTypes.length > 0
  const selectedBusType = busTypes.find((t) => t.id === busTypeId) ?? null

  const titleId = useId()
  const nameErrorId = useId()
  const pickupErrorId = useId()
  const seatsErrorId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Q6: reducing totalSeats below the highest occupied seat number is blocked
  // — so a bus size smaller than that is not a selectable option at all.
  const minSeats = useMemo(() => {
    const occupied = busToEdit?.seats?.filter((s) => s.seatStatus !== 'available') ?? []
    return occupied.reduce((max, s) => Math.max(max, s.seatNumber), 0)
  }, [busToEdit])

  useEffect(() => {
    if (!isOpen) return
    if (busToEdit) {
      setBusName(busToEdit.busName)
      setDescription(busToEdit.description || '')
      setPickupPoints([...busToEdit.pickupPoints])
      setTotalSeats(busToEdit.totalSeats || DEFAULT_SEATS)
      setBusTypeId(null)
    } else {
      setBusName('')
      setDescription('')
      setPickupPoints([])
      setTotalSeats(DEFAULT_SEATS)
      // Preselect the template marked as default, if one exists.
      setBusTypeId(busTypes.find((t) => t.isDefault)?.id ?? null)
    }
    setNewPickup('')
    setNameError('')
    setPickupError('')
    setSeatsError('')
  }, [busToEdit, isOpen, minSeats, busTypes])

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
    // Q6: block reducing the seat count below already-occupied seat numbers.
    // Irrelevant when a template is used — that path only exists on create.
    if (!selectedBusType && totalSeats < minSeats) {
      setSeatsError(`לא ניתן להפחית את מספר המושבים מתחת ל-${minSeats} (קיימים מושבים תפוסים)`)
      hasError = true
    }
    if (hasError) return
    onSave(
      trimmedName,
      description.trim(),
      pickupPoints,
      selectedBusType ? selectedBusType.totalSeats : totalSeats,
      DRIVER_SIDE,
      DOOR_POSITION,
      selectedBusType ? selectedBusType.id : null
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

          {canUseBusType && (
            <div>
              <label
                htmlFor={`${titleId}-bus-type`}
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                יצירה מדגם אוטובוס (תבנית):
              </label>
              <select
                id={`${titleId}-bus-type`}
                value={busTypeId ?? ''}
                onChange={(e) => {
                  setBusTypeId(e.target.value || null)
                  setSeatsError('')
                }}
                className={inputClass}
              >
                <option value="">ללא תבנית - בחירת גודל ידנית</option>
                {busTypes.map((busType) => (
                  <option key={busType.id} value={busType.id}>
                    {busType.name} ({busType.totalSeats} מושבים)
                    {busType.isDefault ? ' - ברירת מחדל' : ''}
                  </option>
                ))}
              </select>
              {selectedBusType && (
                <p className="text-[11px] text-slate-500 mt-1">
                  מפת המושבים תיווצר לפי התבנית: {selectedBusType.totalSeats} מושבים,{' '}
                  {selectedBusType.standardRowsCount} שורות
                  {selectedBusType.doorRow ? `, דלת בשורה ${selectedBusType.doorRow}` : ', ללא דלת אמצעית'}.
                </p>
              )}
            </div>
          )}

          <div className={cn(selectedBusType && 'hidden')}>
            <div className="flex items-center justify-between mb-1">
              <span id={`${titleId}-seats-label`} className="block text-xs font-bold text-slate-700">
                גודל האוטובוס:
              </span>
            </div>

            <div
              role="radiogroup"
              aria-labelledby={`${titleId}-seats-label`}
              aria-describedby={seatsError ? seatsErrorId : undefined}
              className="grid grid-cols-2 gap-2"
            >
              {BUS_SIZES.map((size) => {
                const disabled = size < minSeats
                const selected = totalSeats === size
                return (
                  <button
                    key={size}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => {
                      setTotalSeats(size)
                      if (seatsError) setSeatsError('')
                    }}
                    className={cn(
                      'py-2.5 rounded-xl border-2 text-sm font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      selected
                        ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100',
                      disabled && 'opacity-40 cursor-not-allowed hover:bg-slate-50'
                    )}
                  >
                    {size} מושבים
                  </button>
                )
              })}
            </div>
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
