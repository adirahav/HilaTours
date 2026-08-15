import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowRight,
  Bus as BusIcon,
  Calendar,
  CheckCircle,
  MapPin,
  Phone,
  User
} from 'lucide-react'
import { useStore } from '../store/store'
import { tourService } from '../services/tour.service'
import { seatService } from '../services/seat.service'
import { useSeatSocket } from '../hooks/useSeatSocket'
import { getStoredBusId, setStoredBusId } from '../lib/busSelectionStorage'
import { BusMap } from '../components/bus/BusMap'
import { validateSeatPairing, autoSuggestPairs } from '../lib/busLayoutHelper'
import { isUpcomingTourDate } from '../lib/tourDate'
import { cn } from '../lib/utils'
import type { SeatBookingRequest } from '../types/tour.types'

// Passenger seat-selection view for a given tour: pick a bus, choose adjacent
// seats, fill passenger details, and submit a seat-reservation request.
export function PassengerViewPage() {
  const { tourId } = useParams<{ tourId: string }>()
  const navigate = useNavigate()

  const tours = useStore((state) => state.tours)
  const selectedSeatNumbers = useStore((state) => state.selectedSeatNumbers)
  const toggleSeatSelection = useStore((state) => state.toggleSeatSelection)
  const clearSeatSelection = useStore((state) => state.clearSeatSelection)

  const currentTour = useMemo(
    () => tours.find((t) => t.id === tourId),
    [tours, tourId]
  )

  const [selectedBusId, setSelectedBusId] = useState<string>('')
  const [passengerName, setPassengerName] = useState('')
  const [passengerPhone, setPassengerPhone] = useState('')
  const [pickupPoint, setPickupPoint] = useState('')
  const [notes, setNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [confirmedSeats, setConfirmedSeats] = useState<number[]>([])

  // Ensure the tour is loaded (e.g. on hard-refresh / deep link).
  useEffect(() => {
    if (!tourId || currentTour) return
    let active = true
    setIsLoading(true)
    tourService
      .query()
      .catch((err) => {
        console.log('[BOOKING] failed to load tour', err)
        toast.error('טעינת הטיול נכשלה. נסו שוב מאוחר יותר.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId])

  // Clear any selection when leaving the page.
  useEffect(() => {
    return () => clearSeatSelection()
  }, [clearSeatSelection])

  // Restore the last bus picked for this tour once it's available; fall back
  // to the first bus if none was stored or the stored one no longer exists.
  useEffect(() => {
    if (!currentTour || selectedBusId || currentTour.buses.length === 0) return
    const storedBusId = getStoredBusId(currentTour.id)
    const restored = currentTour.buses.find((b) => b.id === storedBusId)
    setSelectedBusId((restored ?? currentTour.buses[0]).id)
  }, [currentTour, selectedBusId])

  const activeBus =
    currentTour?.buses.find((b) => b.id === selectedBusId) ||
    currentTour?.buses[0]

  useSeatSocket(activeBus?.id)

  const totalSeats = activeBus?.totalSeats ?? 52

  const pairingValidation =
    selectedSeatNumbers.length > 1
      ? validateSeatPairing(selectedSeatNumbers, totalSeats)
      : { isValid: true, message: '', formedPairs: [], unpairedSeats: [] }

  const canSubmit =
    selectedSeatNumbers.length > 0 &&
    (selectedSeatNumbers.length === 1 || pairingValidation.isValid)

  const handleAutoSuggestSeats = (count: number) => {
    if (!activeBus) return
    const suggested = autoSuggestPairs(activeBus.seats, count, totalSeats)
    if (suggested.length === 0) {
      toast.error('לא נמצאו מספיק מושבים צמודים פנויים.')
      return
    }
    clearSeatSelection()
    suggested.forEach((num) => toggleSeatSelection(num))
    setErrorMsg('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentTour || !activeBus) return

    if (selectedSeatNumbers.length === 0) {
      setErrorMsg('אנא בחר לפחות מושב אחד מתוך המפה.')
      return
    }
    if (selectedSeatNumbers.length > 1 && !pairingValidation.isValid) {
      setErrorMsg('חובה לבחור מושבים צמודים ברצף. ' + pairingValidation.message)
      return
    }
    if (!passengerName.trim()) {
      setErrorMsg('אנא הזן שם מלא.')
      return
    }

    const sortedSeatNumbers = [...selectedSeatNumbers].sort((a, b) => a - b)
    // The booking endpoint addresses seats by uuid (seatIds), not seatNumber
    // — resolve against the currently-loaded seat list.
    const seatIds = sortedSeatNumbers
      .map((n) => activeBus.seats.find((s) => s.seatNumber === n)?.id)
      .filter((id): id is string => Boolean(id))
    if (seatIds.length !== sortedSeatNumbers.length) {
      setErrorMsg('חלק מהמושבים שנבחרו כבר אינם זמינים. אנא רעננו ונסו שוב.')
      return
    }

    const payload: SeatBookingRequest = {
      tourId: currentTour.id,
      busId: activeBus.id,
      seatIds,
      passengerName: passengerName.trim(),
      passengerPhone: passengerPhone.trim(),
      pickupPointName: pickupPoint,
      notes: notes.trim()
    }

    setIsSubmitting(true)
    setErrorMsg('')
    try {
      await seatService.request(payload)
      setConfirmedSeats(sortedSeatNumbers)
      setIsSuccess(true)
      clearSeatSelection()
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status
      // Re-sync the seat map after any failure so state is never stale.
      await tourService.query().catch(() => undefined)
      if (status === 409) {
        console.log('[SEAT] booking conflict', status)
        clearSeatSelection()
        setErrorMsg('חלק מהמושבים שנבחרו כבר נתפסו. אנא בחר מושבים אחרים.')
        toast.error('אחד המושבים נתפס זה עתה — אנא בחר מושבים אחרים.')
      } else {
        console.log('[BOOKING] request failed', err)
        toast.error('שליחת בקשת השריון נכשלה, נסו שוב.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading && !currentTour) {
    return (
      <div
        className="max-w-4xl mx-auto rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 animate-pulse"
        aria-live="polite"
      >
        טוען את פרטי הטיול...
      </div>
    )
  }

  if (!currentTour) {
    return (
      <div className="max-w-xl mx-auto text-center py-12 space-y-4">
        <p className="text-slate-600 font-bold">הטיול לא נמצא.</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          חזרה לדף הראשי
        </button>
      </div>
    )
  }

  // A stale/shared link to a tour whose date has already passed: block
  // everything (seat map, booking form) and offer only a way back home —
  // never let a passenger submit a booking for a trip that already happened.
  if (!isUpcomingTourDate(currentTour.date)) {
    return (
      <div className="max-w-xl mx-auto text-center py-12 space-y-4">
        <p className="text-slate-600 font-bold">הטיול כבר הסתיים.</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          חזרה לדף הראשי
        </button>
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-3xl p-8 shadow-sm border border-slate-200 text-center space-y-4 my-8">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">
          בקשת השריון התקבלה בהצלחה!
        </h2>
        <p className="text-sm text-slate-600">
          שריינו עבורך את מושבים{' '}
          <strong className="text-slate-900">{confirmedSeats.join(', ')}</strong>{' '}
          באוטובוס <strong>{activeBus?.busName}</strong>. הבקשה ממתינה לאישור סופי
          של הנהלת הטיול.
        </p>
        <div className="pt-4 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            חזרה לדף ראשי
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <ArrowRight className="w-4 h-4 rotate-180" aria-hidden="true" />
            <span>חזרה לרשימת הטיולים</span>
          </button>
          <h2 className="text-xl font-bold text-slate-900">{currentTour.title}</h2>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              <time dateTime={currentTour.date}>
                {new Date(currentTour.date).toLocaleDateString('he-IL')}
              </time>
            </span>
          </p>
        </div>

        {currentTour.buses.length > 1 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="bus-select"
              className="text-xs font-bold text-slate-600"
            >
              בחר אוטובוס:
            </label>
            <select
              id="bus-select"
              value={selectedBusId}
              onChange={(e) => {
                setSelectedBusId(e.target.value)
                if (currentTour) setStoredBusId(currentTour.id, e.target.value)
                clearSeatSelection()
                setPickupPoint('')
                setErrorMsg('')
              }}
              className="bg-slate-50 border border-slate-300 font-bold text-slate-900 text-xs rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {currentTour.buses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.busName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <BusIcon className="w-5 h-5 text-blue-600" aria-hidden="true" />
              <span>מפת מושבים - {activeBus?.busName || ''}</span>
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              לחץ על מושב ירוק לבחירה
            </span>
          </div>

          <BusMap
            seats={activeBus?.seats || []}
            totalSeats={totalSeats}
            selectedSeatNumbers={selectedSeatNumbers}
            onToggleSelectSeat={(seatNum) => {
              setErrorMsg('')
              toggleSeatSelection(seatNum)
            }}
            isAdminMode={false}
          />
        </div>

        <div className="lg:col-span-5 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-6">
          <h3 className="font-bold text-slate-900 text-base border-b border-slate-100 pb-3">
            פרטי נוסע ושריון מושבים
          </h3>

          {errorMsg && (
            <div
              role="alert"
              className="bg-rose-50 text-rose-700 p-3 rounded-2xl border border-rose-200 text-xs font-bold"
            >
              {errorMsg}
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">מושבים שנבחרו:</span>
              {selectedSeatNumbers.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearSeatSelection()
                    setErrorMsg('')
                  }}
                  className="text-xs text-rose-600 hover:underline font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
                >
                  איפוס בחירה
                </button>
              )}
            </div>

            {selectedSeatNumbers.length > 0 ? (
              <div>
                <span className="font-bold text-blue-600 text-sm block">
                  {[...selectedSeatNumbers].sort((a, b) => a - b).join(', ')} (
                  {selectedSeatNumbers.length} מושבים)
                </span>

                {selectedSeatNumbers.length > 1 && !pairingValidation.isValid && (
                  <div className="mt-2.5 p-3 bg-amber-50 text-amber-900 border border-amber-300 rounded-2xl text-xs space-y-1 shadow-sm">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <AlertTriangle
                        className="w-4 h-4 text-amber-600 shrink-0"
                        aria-hidden="true"
                      />
                      <span>המושבים שנבחרו אינם צמודים ברצף!</span>
                    </div>
                    <p className="text-slate-700 font-medium text-[11px] leading-relaxed">
                      לפי נהלי ההזמנה, בעת בחירת מספר מושבים יש לבחור זוגות מושבים
                      צמודים ברצף (לדוגמה 33 ו-34). בחירת מושבים מנותקים אינה
                      מורשית.
                    </p>
                  </div>
                )}

                {selectedSeatNumbers.length > 1 && pairingValidation.isValid && (
                  <div className="mt-2 p-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle
                      className="w-4 h-4 text-emerald-600 shrink-0"
                      aria-hidden="true"
                    />
                    <span>בחירת המושבים תקינה וברצף!</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <span className="text-slate-400 italic block">
                  טרם נבחרו מושבים מהמפה
                </span>
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-500 font-semibold">
                    בחירה מהירה:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAutoSuggestSeats(2)}
                    className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold hover:bg-blue-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    2 מושבים צמודים
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAutoSuggestSeats(3)}
                    className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold hover:bg-blue-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    3 מושבים צמודים
                  </button>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="passenger-name"
                className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1"
              >
                <User className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <span>שם מלא (חובה):</span>
              </label>
              <input
                id="passenger-name"
                type="text"
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
                placeholder="ישראל ישראלי"
                className="w-full bg-slate-50 border border-slate-300 font-medium text-slate-900 rounded-2xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="passenger-phone"
                className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1"
              >
                <Phone className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <span>מספר טלפון:</span>
              </label>
              <input
                id="passenger-phone"
                type="tel"
                value={passengerPhone}
                onChange={(e) => setPassengerPhone(e.target.value)}
                placeholder="050-0000000"
                className="w-full bg-slate-50 border border-slate-300 font-medium text-slate-900 rounded-2xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="pickup-point"
                className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1"
              >
                <MapPin
                  className="w-3.5 h-3.5 text-slate-400"
                  aria-hidden="true"
                />
                <span>נקודת איסוף:</span>
              </label>
              <select
                id="pickup-point"
                value={pickupPoint}
                onChange={(e) => setPickupPoint(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 font-medium text-slate-900 rounded-2xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">-- ללא / לא נבחר --</option>
                {(activeBus?.pickupPoints || []).map((pt, i) => (
                  <option key={i} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="notes"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                הערות / בקשות מיוחדות:
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="לדוגמה: מעדיפים לשבת יחד"
                className="w-full bg-slate-50 border border-slate-300 font-medium text-slate-900 rounded-2xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className={cn(
                'w-full py-3 font-bold text-sm rounded-2xl transition shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                canSubmit && !isSubmitting
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              )}
            >
              {isSubmitting ? 'שולח בקשה...' : 'שלח בקשת שריון מושבים'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
