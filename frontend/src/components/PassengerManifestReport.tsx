import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { FileText, Copy, Check, Search } from "lucide-react"
import { useStore } from "../store/store"
import { seatService } from "../services/seat.service"
import { busService } from "../services/bus.service"
import { cn } from "../lib/utils"
import { filterUpcomingTours } from "../lib/tourDate"

type ReportFilter = "all" | "pending" | "taken" | "reserved"

interface PassengerManifestReportProps {
  // While the initial tour fetch is still in flight, tours/buses being empty
  // doesn't mean there are none — show a loader, not the empty state.
  isLoading?: boolean
}

// Admin PassengerManifestReport (Screen 3 - Tab 3): a consolidated, searchable
// and filterable table of every non-available seat for the selected bus, with
// copy-to-clipboard export and inline approve/cancel actions. Like
// SeatManagement, the tour-service stays the source of truth: every mutation
// goes through seatService which re-syncs the store, and the counts derive from
// that state.
export function PassengerManifestReport({ isLoading = false }: PassengerManifestReportProps) {
  const allTours = useStore((state) => state.tours)
  const tours = useMemo(() => filterUpcomingTours(allTours), [allTours])

  const [selectedTourId, setSelectedTourId] = useState("")
  const [selectedBusId, setSelectedBusId] = useState("")
  const [reportSearch, setReportSearch] = useState("")
  const [reportFilter, setReportFilter] = useState<ReportFilter>("all")
  const [copiedReport, setCopiedReport] = useState(false)

  const activeTour = tours.find((t) => t.id === selectedTourId) ?? tours[0]
  const activeBus =
    activeTour?.buses.find((b) => b.id === selectedBusId) ?? activeTour?.buses[0]

  useEffect(() => {
    if (!tours.some((t) => t.id === selectedTourId)) {
      setSelectedTourId(tours[0]?.id ?? "")
    }
  }, [tours, selectedTourId])

  useEffect(() => {
    if (activeTour && !activeTour.buses.some((b) => b.id === selectedBusId)) {
      setSelectedBusId(activeTour.buses[0]?.id ?? "")
    }
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
        console.log("[MANIFEST] failed to load passenger details", err)
      })
    }
    load()
    window.addEventListener("focus", load)
    return () => window.removeEventListener("focus", load)
  }, [activeTourId, activeBusId])

  const seats = activeBus?.seats ?? []

  const statusCounts = useMemo(() => {
    return {
      all: seats.filter((s) => s.seatStatus !== "available").length,
      pending: seats.filter((s) => s.seatStatus === "pending").length,
      taken: seats.filter((s) => s.seatStatus === "taken").length,
      reserved: seats.filter((s) => s.seatStatus === "reserved").length
    }
  }, [seats])

  const reportSeats = useMemo(() => {
    return seats.filter((seat) => {
      if (seat.seatStatus === "available") return false
      if (reportFilter !== "all" && seat.seatStatus !== reportFilter) return false

      const search = reportSearch.trim().toLowerCase()
      if (search !== "") {
        const matchName = seat.passengerName?.toLowerCase().includes(search)
        const matchPhone = seat.passengerPhone?.includes(search)
        const matchPickup = seat.pickupPoint?.toLowerCase().includes(search)
        const matchSeatNum = seat.seatNumber.toString() === search
        return Boolean(matchName || matchPhone || matchPickup || matchSeatNum)
      }
      return true
    })
  }, [seats, reportFilter, reportSearch])

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

  // approve/cancel address seats by uuid, not seatNumber — resolve against
  // the currently-loaded seat list.
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

  const handleCopyReport = async () => {
    const lines = [
      `📋 דוח נוסעים - ${activeTour.title} (${activeBus.busName})`,
      `תאריך: ${new Date(activeTour.date).toLocaleDateString("he-IL")}`,
      `==========================================`
    ]

    reportSeats.forEach((seat) => {
      const statusText =
        seat.seatStatus === "taken"
          ? "מאושר"
          : seat.seatStatus === "pending"
            ? "ממתין"
            : "שמור מנהל"
      lines.push(
        `מושב ${seat.seatNumber}: ${seat.passengerName || "שם לא עדכני"} | טלפון: ${
          seat.passengerPhone || "-"
        } | איסוף: ${seat.pickupPoint || "-"} | סטטוס: ${statusText}`
      )
    })

    try {
      await navigator.clipboard.writeText(lines.join("\n"))
      setCopiedReport(true)
      setTimeout(() => setCopiedReport(false), 2500)
    } catch (err) {
      console.log("[MANIFEST] copy to clipboard failed", err)
      toast.error("העתקת הדוח נכשלה, נסו שוב.")
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          בחר טיול ואוטובוס להפקת דוח:
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="report-tour" className="block text-xs font-bold text-slate-700 mb-1">
              טיול:
            </label>
            <select
              id="report-tour"
              value={activeTour.id}
              onChange={(e) => setSelectedTourId(e.target.value)}
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
            <label htmlFor="report-bus" className="block text-xs font-bold text-slate-700 mb-1">
              אוטובוס:
            </label>
            <select
              id="report-bus"
              value={activeBus.id}
              onChange={(e) => setSelectedBusId(e.target.value)}
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

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-500" aria-hidden="true" />
              <span>דוח נוסעים ורשימת איסופים - {activeBus.busName}</span>
            </h2>
            <p className="text-xs text-slate-500">
              רשימה מרוכזת של כל המושבים התפוסים, הממתינים והשמורים
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyReport}
            className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-slate-800 transition flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            {copiedReport ? (
              <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{copiedReport ? "הועתק ללוח!" : "העתק דוח מרוכז"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute right-3 top-3"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="חפש לפי שם, טלפון, נקודת איסוף או מספר מושב..."
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              aria-label="חיפוש בדוח הנוסעים"
              className="w-full bg-slate-50 border border-slate-300 rounded-2xl pr-10 pl-4 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReportFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                reportFilter === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700"
              )}
            >
              הכל ({statusCounts.all})
            </button>
            <button
              type="button"
              onClick={() => setReportFilter("pending")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                reportFilter === "pending"
                  ? "bg-amber-500 text-slate-950"
                  : "bg-amber-50 text-amber-900"
              )}
            >
              ממתינים ({statusCounts.pending})
            </button>
            <button
              type="button"
              onClick={() => setReportFilter("taken")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                reportFilter === "taken"
                  ? "bg-rose-500 text-white"
                  : "bg-rose-50 text-rose-900"
              )}
            >
              תפוסים ({statusCounts.taken})
            </button>
            <button
              type="button"
              onClick={() => setReportFilter("reserved")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                reportFilter === "reserved"
                  ? "bg-purple-600 text-white"
                  : "bg-purple-50 text-purple-900"
              )}
            >
              שמורים ({statusCounts.reserved})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <th className="p-3 rounded-r-xl">מספר מושב</th>
                <th className="p-3">שם הנוסע</th>
                <th className="p-3">מספר טלפון</th>
                <th className="p-3">נקודת איסוף</th>
                <th className="p-3">סטטוס</th>
                <th className="p-3">הערות</th>
                <th className="p-3 rounded-l-xl">פעולות אדמין</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportSeats.length > 0 ? (
                reportSeats.map((seat) => (
                  <tr key={seat.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-bold text-slate-900 font-mono">
                      מושב #{seat.seatNumber}
                    </td>
                    <td className="p-3 font-bold text-slate-800">
                      {seat.passengerName || "—"}
                    </td>
                    <td className="p-3 font-mono text-slate-600">
                      {seat.passengerPhone || "—"}
                    </td>
                    <td className="p-3 text-slate-700">{seat.pickupPoint || "—"}</td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-md font-bold text-[11px]",
                          seat.seatStatus === "pending"
                            ? "bg-amber-100 text-amber-800"
                            : seat.seatStatus === "taken"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-purple-100 text-purple-800"
                        )}
                      >
                        {seat.seatStatus === "pending"
                          ? "ממתין לאישור"
                          : seat.seatStatus === "taken"
                            ? "תפוס / HOLD"
                            : 'שמור ע"י הנהלה'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">{seat.notes || "—"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {seat.seatStatus === "pending" && (
                          <button
                            type="button"
                            onClick={() => handleApproveSeat(seat.seatNumber)}
                            className="px-2 py-1 bg-emerald-600 text-white font-bold rounded-lg text-[10px] hover:bg-emerald-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                          >
                            אשר
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCancelSeat(seat.seatNumber)}
                          className="px-2 py-1 bg-rose-100 text-rose-800 font-bold rounded-lg text-[10px] hover:bg-rose-200 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                        >
                          בטל/שחרר
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    לא נמצאו מושבים תפוסים או שמורים התואמים את החיפוש.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
    toast.error("המושב כבר שונה על ידי פעולה אחרת. רועננו את הדוח.")
    return
  }
  console.log("[MANIFEST] action failed", err)
  toast.error(fallback)
}
