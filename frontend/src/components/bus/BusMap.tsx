import { useRef, useState } from 'react'
import type { Seat } from '../../types/seat.types'
import { toast } from 'sonner'
import { Info, Check, Clock, User, Lock, Move, TriangleAlert } from 'lucide-react'
import { cn } from '../../lib/utils'

const LONG_PRESS_MS = 500

interface BusMapProps {
  seats: Seat[]
  totalSeats: number
  selectedSeatNumbers: number[]
  onToggleSelectSeat: (seatNumber: number) => void
  isAdminMode?: boolean
  // Default (short) click: open the full management modal (assign a
  // specific passenger, approve/cancel, etc.) — needed even for an
  // available seat (manual-assign onto it).
  onAdminClickSeat?: (seat: Seat) => void
  onMoveSeat?: (fromSeatNumber: number, toSeatNumber: number) => void
  // Long-press (500ms) on an available/reserved seat toggles it directly —
  // no passenger info to collect for that action, so skip the modal.
  // Pending/taken seats are never affected by a long-press.
  onQuickToggleReserve?: (seat: Seat) => void
}

const STATUS_LABEL: Record<Seat['seatStatus'], string> = {
  available: 'פנוי',
  pending: 'ממתין לאישור',
  taken: 'תפוס',
  reserved: 'שמור על ידי ההנהלה'
}

export function BusMap({
  seats,
  totalSeats,
  selectedSeatNumbers,
  onToggleSelectSeat,
  isAdminMode = false,
  onAdminClickSeat,
  onMoveSeat,
  onQuickToggleReserve
}: BusMapProps) {
  const [hoveredSeat, setHoveredSeat] = useState<Seat | null>(null)
  const [draggedSeatNumber, setDraggedSeatNumber] = useState<number | null>(null)
  const [dragOverSeatNumber, setDragOverSeatNumber] = useState<number | null>(null)
  const [moveMode, setMoveMode] = useState(false)
  const [moveSourceSeatNumber, setMoveSourceSeatNumber] = useState<number | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)

  const safeSeats = seats || []
  const standardLimit = totalSeats - 5
  const standardSeats = safeSeats.filter((s) => s.seatNumber <= standardLimit)
  const backRowSeats = safeSeats.filter((s) => s.seatNumber > standardLimit)

  const rowMap = new Map<number, Seat[]>()
  standardSeats.forEach((s) => {
    if (!rowMap.has(s.row)) rowMap.set(s.row, [])
    rowMap.get(s.row)!.push(s)
  })

  const rowNumbers = Array.from(rowMap.keys()).sort((a, b) => a - b)

  const getSeatStyle = (seat: Seat) => {
    const isSelected = selectedSeatNumbers.includes(seat.seatNumber)
    const isDragged = draggedSeatNumber === seat.seatNumber
    const isDragOverTarget = dragOverSeatNumber === seat.seatNumber
    const isMoveSource = moveSourceSeatNumber === seat.seatNumber

    if (isDragged || isMoveSource) {
      return 'bg-amber-300 text-slate-900 border-amber-500 border-dashed opacity-60 scale-95 shadow-inner'
    }
    if (isDragOverTarget) {
      return 'bg-blue-300 text-blue-950 border-blue-600 ring-4 ring-blue-300 scale-110 z-20 shadow-xl'
    }
    if (isSelected) {
      return 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-400 font-bold scale-105'
    }
    switch (seat.seatStatus) {
      case 'available':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400 hover:shadow-sm'
      case 'pending':
        return 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
      case 'taken':
        return 'bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200'
      case 'reserved':
        return 'bg-slate-200 text-slate-800 border-slate-300 hover:bg-slate-300'
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  const getSeatIcon = (seat: Seat) => {
    const isSelected = selectedSeatNumbers.includes(seat.seatNumber)
    if (isSelected) return <Check aria-hidden="true" className="w-3.5 h-3.5 stroke-[3]" />
    switch (seat.seatStatus) {
      case 'available':
        return null
      case 'pending':
        return <Clock aria-hidden="true" className="w-3 h-3 text-amber-600" />
      case 'taken':
        return <User aria-hidden="true" className="w-3 h-3 text-rose-600" />
      case 'reserved':
        return <Lock aria-hidden="true" className="w-3 h-3 text-slate-600" />
      default:
        return null
    }
  }

  const getSeatTooltipText = (seat: Seat) => {
    if (selectedSeatNumbers.includes(seat.seatNumber)) {
      return 'מושב #' + seat.seatNumber + ' (נבחר כעת)'
    }
    switch (seat.seatStatus) {
      case 'available':
        return 'מושב #' + seat.seatNumber + ' - פנוי לבחירה'
      case 'pending':
        return 'מושב #' + seat.seatNumber + ' - ממתין לאישור (' + (seat.passengerName || 'נוסע') + ')'
      case 'taken':
        return 'תפוס על ידי: ' + (seat.passengerName || 'נוסע') + ' (' + (seat.pickupPoint || 'מאושר') + ')'
      case 'reserved':
        return 'מושב שמור על ידי ההנהלה ' + (seat.notes ? '(' + seat.notes + ')' : '')
      default:
        return 'מושב #' + seat.seatNumber
    }
  }

  const getSeatAriaLabel = (seat: Seat) => {
    const isSelected = selectedSeatNumbers.includes(seat.seatNumber)
    const statusText = isSelected ? 'נבחר' : STATUS_LABEL[seat.seatStatus]
    return 'מושב ' + seat.seatNumber + ', ' + statusText
  }

  const performMove = (fromSeatNumber: number, toSeatNumber: number) => {
    if (fromSeatNumber !== toSeatNumber && onMoveSeat) {
      onMoveSeat(fromSeatNumber, toSeatNumber)
    }
  }

  const handleSeatClick = (seat: Seat) => {
    // A completed long-press already performed its action — the click event
    // that follows pointerup must not also open the modal.
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }

    if (isAdminMode) {
      if (moveMode) {
        if (moveSourceSeatNumber === null) {
          setMoveSourceSeatNumber(seat.seatNumber)
          toast.info('נבחר מקור: מושב #' + seat.seatNumber + '. בחר מושב יעד')
        } else {
          performMove(moveSourceSeatNumber, seat.seatNumber)
          setMoveSourceSeatNumber(null)
        }
        return
      }
      onAdminClickSeat?.(seat)
      return
    }

    if (seat.seatStatus === 'reserved') {
      toast.error('מושב זה שמור על ידי ההנהלה ואינו זמין לבחירה.')
      return
    }
    if (seat.seatStatus === 'taken' || seat.seatStatus === 'pending') {
      const occupant = seat.passengerName ? 'על ידי ' + seat.passengerName : ''
      const state = seat.seatStatus === 'taken' ? 'תפוס' : 'ממתין לאישור'
      toast.error('מושב #' + seat.seatNumber + ' ' + state + ' ' + occupant + '.')
      return
    }
    onToggleSelectSeat(seat.seatNumber)
  }

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  // Long-press only applies in admin mode, not while move-mode is active
  // (there, a press is always a move source/target pick).
  const handleSeatPressStart = (seat: Seat) => {
    if (!isAdminMode || moveMode) return
    clearLongPressTimer()
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      if (seat.seatStatus === 'available' || seat.seatStatus === 'reserved') {
        onQuickToggleReserve?.(seat)
      } else {
        toast.error('שמירה/שחרור מהירים זמינים רק למושבים פנויים או שמורים.')
      }
    }, LONG_PRESS_MS)
  }

  const handleSeatPressEnd = () => {
    clearLongPressTimer()
  }

  const handleSeatDragStart = (e: React.DragEvent, seat: Seat) => {
    if (!isAdminMode) return
    setDraggedSeatNumber(seat.seatNumber)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', seat.seatNumber.toString())
  }

  const handleSeatDragOver = (e: React.DragEvent, seat: Seat) => {
    if (!isAdminMode) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverSeatNumber !== seat.seatNumber) {
      setDragOverSeatNumber(seat.seatNumber)
    }
  }

  const handleSeatDrop = (e: React.DragEvent, targetSeat: Seat) => {
    if (!isAdminMode) return
    e.preventDefault()
    if (draggedSeatNumber && draggedSeatNumber !== targetSeat.seatNumber) {
      performMove(draggedSeatNumber, targetSeat.seatNumber)
    }
    setDraggedSeatNumber(null)
    setDragOverSeatNumber(null)
  }

  const handleSeatDragEnd = () => {
    setDraggedSeatNumber(null)
    setDragOverSeatNumber(null)
  }

  const renderSeat = (seat: Seat) => (
    <SeatButton
      key={seat.id}
      seat={seat}
      styleClass={getSeatStyle(seat)}
      icon={getSeatIcon(seat)}
      tooltip={getSeatTooltipText(seat)}
      ariaLabel={getSeatAriaLabel(seat)}
      isSelected={selectedSeatNumbers.includes(seat.seatNumber)}
      onClick={() => handleSeatClick(seat)}
      onFocus={() => setHoveredSeat(seat)}
      onBlur={() => setHoveredSeat(null)}
      onMouseEnter={() => setHoveredSeat(seat)}
      onMouseLeave={() => {
        setHoveredSeat(null)
        handleSeatPressEnd()
      }}
      onPressStart={() => handleSeatPressStart(seat)}
      onPressEnd={handleSeatPressEnd}
      isAdminMode={isAdminMode}
      onDragStart={(e) => handleSeatDragStart(e, seat)}
      onDragOver={(e) => handleSeatDragOver(e, seat)}
      onDrop={(e) => handleSeatDrop(e, seat)}
      onDragEnd={handleSeatDragEnd}
    />
  )

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto">
      <div
        className="w-full bg-slate-900/5 rounded-3xl p-4 sm:p-6 border-2 border-slate-300 shadow-xl relative backdrop-blur-sm"
        dir="ltr"
      >
        {isAdminMode && (
          <div className="mb-4 flex items-center justify-end gap-2" dir="rtl">
            <button
              type="button"
              onClick={() => {
                setMoveMode((prev) => !prev)
                setMoveSourceSeatNumber(null)
              }}
              aria-pressed={moveMode}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                moveMode
                  ? 'bg-amber-500 text-white border-amber-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              )}
            >
              <Move aria-hidden="true" className="w-4 h-4" />
              {moveMode ? 'מצב העברה פעיל' : 'מצב העברה/החלפה'}
            </button>
          </div>
        )}

        <div className="bg-slate-800 text-white rounded-2xl p-4 mb-6 shadow-inner relative overflow-hidden border border-slate-700">
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-2 bg-slate-700/80 px-3 py-1.5 rounded-xl border border-slate-600"
              dir="rtl"
            >
              <div className="w-7 h-7 rounded-full bg-slate-900 border-2 border-amber-400 flex items-center justify-center animate-pulse">
                <span className="text-xs font-bold text-amber-400">הגה</span>
              </div>
              <span className="text-xs font-medium text-slate-300">תא הנהג</span>
            </div>

            <div className="text-center" dir="rtl">
              <div className="text-xs font-semibold text-slate-300 tracking-wider">חזית האוטובוס</div>
              <div className="text-[10px] text-emerald-400 flex items-center justify-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                כיוון הנסיעה
              </div>
            </div>

            <div
              className="bg-slate-700/80 px-3 py-1.5 rounded-xl border border-slate-600 text-xs text-slate-300 font-medium"
              dir="rtl"
            >
              דלת קדמית
            </div>
          </div>
        </div>

        <div
          className="grid grid-cols-5 gap-2 sm:gap-3 mb-2 text-center text-xs font-semibold text-slate-500 px-1"
          dir="rtl"
        >
          <div>שמאל (חלון)</div>
          <div>שמאל (מעבר)</div>
          <div className="text-slate-400 font-normal">מעבר</div>
          <div>ימין (מעבר)</div>
          <div>ימין (חלון)</div>
        </div>

        <div className="space-y-3">
          {rowNumbers.map((rowNum) => {
            const rowSeats = rowMap.get(rowNum) || []
            const col1 = rowSeats.find((s) => s.col === 1)
            const col2 = rowSeats.find((s) => s.col === 2)
            const col3 = rowSeats.find((s) => s.col === 3)
            const col4 = rowSeats.find((s) => s.col === 4)

            return (
              <div key={'row-' + rowNum} className="grid grid-cols-5 gap-2 sm:gap-3 items-center">
                <div>{col1 && renderSeat(col1)}</div>
                <div>{col2 && renderSeat(col2)}</div>
                <div className="flex items-center justify-center text-[11px] font-semibold text-slate-400 select-none">
                  {rowNum}
                </div>
                <div>{col3 && renderSeat(col3)}</div>
                <div>{col4 && renderSeat(col4)}</div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 pt-4 border-t-2 border-slate-300">
          <div className="text-center text-xs font-semibold text-slate-500 mb-2" dir="rtl">
            ספסל אחורי ({backRowSeats.length} מושבים)
          </div>
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {backRowSeats.map((seat) => renderSeat(seat))}
          </div>
        </div>

        <div
          className="mt-5 min-h-[44px] bg-slate-900 text-white rounded-xl p-3 flex items-center justify-between text-xs sm:text-sm shadow-lg border border-slate-700"
          dir="rtl"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <Info aria-hidden="true" className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              {draggedSeatNumber || moveSourceSeatNumber ? (
                <span className="text-amber-300 font-bold">
                  {'מעביר מושב #' + (draggedSeatNumber ?? moveSourceSeatNumber) + '... בחר מושב יעד'}
                </span>
              ) : hoveredSeat ? (
                getSeatTooltipText(hoveredSeat)
              ) : (
                <span className="text-slate-400">
                  {isAdminMode
                    ? 'לחץ על מושב לניהול, החזק לחיצה על מושב פנוי/שמור לשמירה/שחרור מיידיים, או הפעל מצב העברה'
                    : 'עבור עם המקלדת או לחץ על מושבים כדי לבחור אותם'}
                </span>
              )}
            </span>
          </div>

          {hoveredSeat && (
            <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-amber-300 font-mono font-bold">
              #{hoveredSeat.seatNumber}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

interface SeatButtonProps {
  seat: Seat
  styleClass: string
  icon: React.ReactNode
  tooltip: string
  ariaLabel: string
  isSelected: boolean
  onClick: () => void
  onFocus: () => void
  onBlur: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onPressStart?: () => void
  onPressEnd?: () => void
  isAdminMode?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}

function SeatButton({
  seat,
  styleClass,
  icon,
  tooltip,
  ariaLabel,
  isSelected,
  onClick,
  onFocus,
  onBlur,
  onMouseEnter,
  onMouseLeave,
  onPressStart,
  onPressEnd,
  isAdminMode,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: SeatButtonProps) {
  const showOccupant =
    (seat.seatStatus === 'taken' || seat.seatStatus === 'pending') && !!seat.passengerName
  const missingPickup = showOccupant && !seat.pickupPoint

  return (
    <button
      type="button"
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={onPressStart}
      onPointerUp={onPressEnd}
      onPointerCancel={onPressEnd}
      draggable={isAdminMode}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      title={tooltip}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      className={cn(
        'w-full min-h-[58px] sm:min-h-[62px] rounded-xl border-2 flex flex-col items-center justify-between p-1 transition-all duration-150 relative group',
        showOccupant ? 'py-1.5' : 'aspect-[4/3]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        isAdminMode && 'cursor-grab active:cursor-grabbing',
        styleClass
      )}
    >
      {missingPickup && (
        <span
          className="absolute -top-1.5 -left-1.5 z-20 bg-rose-600 text-white font-black text-[9px] p-1 rounded-full border border-white shadow-xs flex items-center justify-center"
          title="אזהרה: לא נבחרה תחנת איסוף"
        >
          <TriangleAlert aria-hidden="true" className="w-2.5 h-2.5" />
        </span>
      )}

      <span className="text-xs sm:text-sm font-black leading-none mt-0.5">{seat.seatNumber}</span>
      {icon && <div className="mt-0.5">{icon}</div>}

      {showOccupant && (
        <div className="w-full text-center px-0.5 my-auto overflow-hidden" dir="rtl">
          <span
            className="block text-[10px] sm:text-[11px] font-bold leading-tight truncate"
            dir="rtl"
            title={seat.passengerName}
          >
            {seat.passengerName}
          </span>
          {missingPickup && (
            <span className="inline-block text-[8px] sm:text-[9px] font-extrabold bg-rose-200 text-rose-900 border border-rose-300 rounded px-1 py-[0.5px] mt-0.5 leading-none whitespace-nowrap">
              ללא תחנה
            </span>
          )}
        </div>
      )}

      <div className="absolute bottom-full mb-2 hidden group-hover:block z-50 pointer-events-none w-max max-w-[200px]">
        <div className="bg-slate-900 text-white text-[11px] rounded-lg py-1.5 px-2.5 shadow-xl border border-slate-700 leading-tight">
          <div className="font-bold text-amber-300">מושב #{seat.seatNumber}</div>
          <div>{tooltip}</div>
        </div>
      </div>
    </button>
  )
}
