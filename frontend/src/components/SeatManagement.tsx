import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Clock, CheckCircle2 } from "lucide-react"
import { useStore } from "../store/store"
import { seatService } from "../services/seat.service"
import { busService } from "../services/bus.service"
import { useSeatSocket } from "../hooks/useSeatSocket"
import { getStoredBusId, getStoredTourId, setStoredBusId, setStoredTourId } from "../lib/busSelectionStorage"
import { filterUpcomingTours } from "../lib/tourDate"
import { BusMap } from "./bus/BusMap"
import { ManualAssignModal } from "../modals/ManualAssignModal"
import type { Seat, SeatStatus } from "../types/seat.types"

interface SeatManagementProps {
  // While the initial tour fetch is still in flight, tours/buses being empty
  // doesn't mean there are none — show a loader, not the empty state.
  isLoading?: boolean
}

// Admin SeatManagement (Screen 3 - Tab 1): tour/bus selection sidebar,
// pending-requests panel with bulk approve, status summary, and the
// interactive admin BusMap wired to the seat lifecycle endpoints (F4-F7).
// The tour-service stays the source of truth: every mutation re-syncs the
// store via seatService, and the sidebar counts derive from that state.
export function SeatManagement({ isLoading = false }: SeatManagementProps) {
  const allTours = useStore((state) => state.tours)
  const tours = useMemo(() => filterUpcomingTours(allTours), [allTours])

  const [selectedTourId, setSelectedTourId] = useState("")
  const [selectedBusId, setSelectedBusId] = useState("")
  const [selectedSeatForModal, setSelectedSeatForModal] = useState<Seat | null>(null)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)

  const activeTour = tours.find((t) => t.id === selectedTourId) ?? tours[0]
  const activeBus =
    activeTour?.buses.find((b) => b.id === selectedBusId) ?? activeTour?.buses[0]

  // Restore the last tour/bus picked in this browser; fall back to the first
  // one if none was stored or the stored one no longer exists.
  useEffect(() => {
    if (tours.some((t) => t.id === selectedTourId)) return
    const restored = tours.find((t) => t.id === getStoredTourId())
    setSelectedTourId((restored ?? tours[0])?.id ?? "")
  }, [tours, selectedTourId])

  useEffect(() => {
    if (!activeTour || activeTour.buses.some((b) => b.id === selectedBusId)) return
    const restored = activeTour.buses.find((b) => b.id === getStoredBusId(activeTour.id))
    setSelectedBusId((restored ?? activeTour.buses[0])?.id ?? "")
  }, [activeTour, selectedBusId])

  // GET /tour (used to hydrate the store) is public and strips passenger PII
  // (SEV-001) — load the real names/phones/pickup for the active bus via the
  // authenticated single-bus route. Re-fetched on window focus too, since a
  // background public refetch (see AdminDashboardPage) would otherwise wipe
  // the PII back out without touching tourId/busId.
  const activeTourId = activeTour?.id
  const activeBusId = activeBus?.id
  useEffect(() => {
    if (!activeTourId || !activeBusId) return
    const load = () => {
      busService.loadWithPii(activeTourId, activeBusId).catch((err) => {
        console.log("[SEAT] failed to load passenger details", err)
      })
    }
    load()
    window.addEventListener("focus", load)
    return () => window.removeEventListener("focus", load)
  }, [activeTourId, activeBusId])

  useSeatSocket(activeBusId)

  const seats = activeBus?.seats ?? []

  const statusCounts = useMemo(() => {
    const counts: Record<SeatStatus, number> = {
      available: 0,
      pending: 0,
      taken: 0,
      reserved: 0
    }
    seats.forEach((s) => {
      counts[s.seatStatus] += 1
    })
    return counts
  }, [seats])

  const pendingSeatNumbers = useMemo(
    () => seats.filter((s) => s.seatStatus === "pending").map((s) => s.seatNumber),
    [seats]
  )

  if (!activeTour || !activeBus) {
    if (isLoading) {
      return (
        <div
          className="bg-white p-8 rounded-3xl text-center shadow-sm border border-slate-200 animate-pulse"
          aria-live="polite"
        >
          <p className="text-slate-500 font-bold">טוען טיולים...</p>
        </div>
      )
    }
    return (
      <div className="bg-white p-8 rounded-3xl text-center shadow-sm border border-slate-200">
        <p className="text-slate-600 font-bold">אין טיולים או אוטובוסים קיימים במערכת.</p>
      </div>
    )
  }

  const tourId = activeTour.id
  const busId = activeBus.id

  // approve/cancel/toggle-reserve address seats by uuid, not seatNumber —
  // resolve against the currently-loaded seat list.
  const seatIdByNumber = (seatNumber: number): string | undefined =>
    seats.find((s) => s.seatNumber === seatNumber)?.id

  const handleApproveSeat = async (seatNumber: number) => {
    const seatId = seatIdByNumber(seatNumber)
    if (!seatId) return
    try {
      await seatService.approve(tourId, busId, seatId)
    } catch (err) {
      handleSeatError(err, "אישור המושב נכשל, נסו שוב.")
    }
  }

  const handleCancelSeat = async (seatNumber: number) => {
    const seatId = seatIdByNumber(seatNumber)
    if (!seatId) return
    try {
      await seatService.cancel(tourId, busId, seatId)
    } catch (err) {
      handleSeatError(err, "שחרור המושב נכשל, נסו שוב.")
    }
  }

  const handleToggleReserveSeat = async (seatNumber: number) => {
    const seatId = seatIdByNumber(seatNumber)
    if (!seatId) return
    try {
      await seatService.toggleReserve(tourId, busId, seatId)
    } catch (err) {
      handleSeatError(err, "עדכון סטטוס השמירה נכשל, נסו שוב.")
    }
  }

  const handleSaveAssign = async (
    seatNumber: number,
    passengerName: string,
    passengerPhone: string,
    pickupPoint: string,
    notes: string,
    status: "taken" | "pending"
  ) => {
    try {
      // A seat already pending/taken has an occupant to edit in place —
      // manualAssign only ever targets an available seat (it 400s otherwise).
      if (selectedSeatForModal && selectedSeatForModal.seatStatus !== "available") {
        await seatService.updateOccupant(tourId, busId, selectedSeatForModal.id, {
          passengerName,
          passengerPhone,
          pickupPoint,
          notes,
          status
        })
      } else {
        await seatService.manualAssign(tourId, busId, {
          tourId,
          busId,
          seatNumbers: [seatNumber],
          passengerName,
          passengerPhone,
          pickupPoint,
          notes,
          status
        })
      }
      setIsAssignModalOpen(false)
      setSelectedSeatForModal(null)
    } catch (err) {
      handleSeatError(err, "עדכון פרטי הנוסע נכשל, נסו שוב.")
    }
  }

  const handleMoveSeat = async (fromSeatNumber: number, toSeatNumber: number) => {
    try {
      await seatService.swapMove(tourId, busId, fromSeatNumber, toSeatNumber)
    } catch (err) {
      handleSeatError(err, "העברת המושב נכשלה, נסו שוב.")
    }
  }

  const handleBulkApproveAllPending = async () => {
    if (pendingSeatNumbers.length === 0) return
    let approved = 0
    let conflicts = 0
    for (const seatNumber of pendingSeatNumbers) {
      const seatId = seatIdByNumber(seatNumber)
      if (!seatId) continue
      try {
        await seatService.approve(tourId, busId, seatId)
        approved += 1
      } catch (err) {
        if (isConflict(err)) conflicts += 1
        else {
          console.log("[SEAT] bulk approve failed", err)
        }
      }
    }
    if (conflicts > 0) {
      toast.error(conflicts + " בקשות כבר שונו על ידי פעולה אחרת. רועננו את המפה.")
    } else if (approved === 0) {
      toast.error("אישור הבקשות נכשל, נסו שוב.")
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" dir="rtl">
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            בחר טיול ואוטובוס לניהול:
          </h3>

          <div className="space-y-3">
            <div>
              <label htmlFor="seat-mgmt-tour" className="block text-xs font-bold text-slate-700 mb-1">
                טיול:
              </label>
              <select
                id="seat-mgmt-tour"
                value={activeTour.id}
                onChange={(e) => {
                  setSelectedTourId(e.target.value)
                  setStoredTourId(e.target.value)
                }}
                className="w-full bg-slate-50 border border-slate-300 font-bold text-slate-900 rounded-2xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {tours.map((tour) => (
                  <option key={tour.id} value={tour.id}>
                    {tour.title} ({new Date(tour.date).toLocaleDateString("he-IL")})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="seat-mgmt-bus" className="block text-xs font-bold text-slate-700 mb-1">
                אוטובוס:
              </label>
              <select
                id="seat-mgmt-bus"
                value={activeBus.id}
                onChange={(e) => {
                  setSelectedBusId(e.target.value)
                  if (activeTour) setStoredBusId(activeTour.id, e.target.value)
                }}
                className="w-full bg-slate-50 border border-slate-300 font-bold text-slate-900 rounded-2xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {activeTour.buses.map((bus) => (
                  <option key={bus.id} value={bus.id}>
                    {bus.busName} ({bus.totalSeats} מושבים)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" aria-hidden="true" />
              <span>בקשות ממתינות לאישור ({pendingSeatNumbers.length})</span>
            </h3>
          </div>

          {pendingSeatNumbers.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200 leading-relaxed">
                ישנן <strong>{pendingSeatNumbers.length}</strong> בקשות הממתינות לאישור אדמין
                באוטובוס זה. לחץ לאישור במרוכז או על כל מושב בנפרד.
              </p>

              <button
                type="button"
                onClick={handleBulkApproveAllPending}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>אשר במרוכז את כל הבקשות ({pendingSeatNumbers.length})</span>
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
              אין כעת בקשות ממתינות לאישור לאוטובוס זה.
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 mb-3">סיכום סטטוסים</h3>

          <ul className="space-y-2 text-xs">
            <li className="flex justify-between items-center bg-emerald-50 p-2.5 rounded-xl text-emerald-900 border border-emerald-200">
              <span className="font-semibold">🟢 פנויים לבחירה:</span>
              <span className="font-bold font-mono">{statusCounts.available}</span>
            </li>

            <li className="flex justify-between items-center bg-amber-50 p-2.5 rounded-xl text-amber-900 border border-amber-200">
              <span className="font-semibold">🟡 ממתינים לאישור (Pending):</span>
              <span className="font-bold font-mono">{statusCounts.pending}</span>
            </li>

            <li className="flex justify-between items-center bg-rose-50 p-2.5 rounded-xl text-rose-900 border border-rose-200">
              <span className="font-semibold">🔴 תפוסים / HOLD מאושר:</span>
              <span className="font-bold font-mono">{statusCounts.taken}</span>
            </li>

            <li className="flex justify-between items-center bg-purple-50 p-2.5 rounded-xl text-purple-900 border border-purple-200">
              <span className="font-semibold">🔒 שמורים על ידי מנהל:</span>
              <span className="font-bold font-mono">{statusCounts.reserved}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="lg:col-span-8 bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              מפת מושבים אינטראקטיבית לאדמין - {activeBus.busName}
            </h2>
            <p className="text-xs text-slate-500">
              לחץ על מושב לאישור, ביטול, שינוי פרטי נוסע או שיבוץ ידני — או הפעל
              &quot;מצב שמירה מהירה&quot; לשמירה/שחרור מיידיים ללא טופס
            </p>
          </div>
        </div>

        <BusMap
          seats={seats}
          totalSeats={activeBus.totalSeats}
          selectedSeatNumbers={[]}
          onToggleSelectSeat={() => {}}
          isAdminMode
          onAdminClickSeat={(seat) => {
            setSelectedSeatForModal(seat)
            setIsAssignModalOpen(true)
          }}
          onQuickToggleReserve={(seat) => handleToggleReserveSeat(seat.seatNumber)}
          onQuickApprove={(seat) => handleApproveSeat(seat.seatNumber)}
          onQuickCancel={(seat) => handleCancelSeat(seat.seatNumber)}
          onMoveSeat={handleMoveSeat}
        />
      </div>

      <ManualAssignModal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false)
          setSelectedSeatForModal(null)
        }}
        seat={selectedSeatForModal}
        pickupPoints={activeBus.pickupPoints}
        onSaveAssign={handleSaveAssign}
        onApprove={handleApproveSeat}
        onCancel={handleCancelSeat}
        onToggleReserve={handleToggleReserveSeat}
      />
    </div>
  )
}

// A 409 from a seat endpoint is an expected seat-conflict, not a crash.
function isConflict(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | null)?.response?.status
  return status === 409
}

function handleSeatError(err: unknown, fallback: string) {
  if (isConflict(err)) {
    toast.error("המושב כבר שונה על ידי פעולה אחרת. רועננו את המפה.")
    return
  }
  console.log("[SEAT] action failed", err)
  toast.error(fallback)
}
