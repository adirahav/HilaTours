import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  Bus as BusIcon,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  UserCheck
} from 'lucide-react'
import { useStore } from '../store/store'
import { attendanceService } from '../services/attendance.service'
import { useAttendanceSocket } from '../hooks/useAttendanceSocket'
import { getStoredBusId, setStoredBusId } from '../lib/busSelectionStorage'
import { isTourToday } from '../lib/tourDate'
import { resolveSelectedTour } from '../lib/selectedTour'
import {
  attendanceStats,
  formatAttendanceSummary,
  groupAttendanceByStation
} from '../lib/attendanceGrouping'
import { ConfirmModal } from '../modals/ConfirmModal'
import { cn } from '../lib/utils'
import type { AttendanceParty, AttendanceStation } from '../types/attendance.types'

interface AttendanceManagementProps {
  isLoading?: boolean
}

interface ConfirmState {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void> | void
}

// Admin/guide attendance check (Screen 5, F12 / AC-12..14). Adapted from
// raw_from_ai_studio/src/components/AttendanceManagement.tsx: the visual
// structure (session pills, station cards, party toggle cards, search bar,
// copy-summary) is preserved, but the prototype's `lib/storage` localStorage
// layer is gone — sessions live in tour-service and every mutation is pushed
// to other admin devices over `attendance:update` (useAttendanceSocket), so
// the guide at the door and the office see the same board in real time.
export function AttendanceManagement({ isLoading = false }: AttendanceManagementProps) {
  const allTours = useStore((state) => state.tours)
  const sessions = useStore((state) => state.attendanceSessions)
  const selectedSessionId = useStore((state) => state.selectedAttendanceSessionId)
  const setSelectedSessionId = useStore((state) => state.setSelectedAttendanceSessionId)
  const setSelectedTourIdInStore = useStore((state) => state.setSelectedTourId)
  const storeSelectedTourId = useStore((state) => state.selectedTourId)

  // The tab only exists on a tour's own day, so the picker offers exactly the
  // tours running today — never a future one the guide can't check in yet.
  const tours = useMemo(() => allTours.filter((t) => isTourToday(t.date)), [allTours])

  const [selectedTourId, setSelectedTourId] = useState('')
  const [selectedBusId, setSelectedBusId] = useState('')
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedPickups, setCollapsedPickups] = useState<Record<string, boolean>>({})
  const [copiedSummary, setCopiedSummary] = useState(false)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const activeTour =
    tours.find((t) => t.id === selectedTourId) ?? resolveSelectedTour(tours, storeSelectedTourId)
  const activeBus = activeTour?.buses.find((b) => b.id === selectedBusId) ?? activeTour?.buses[0]

  const activeTourId = activeTour?.id
  const activeBusId = activeBus?.id

  useEffect(() => {
    if (tours.some((t) => t.id === selectedTourId)) return
    setSelectedTourId(resolveSelectedTour(tours, storeSelectedTourId)?.id ?? '')
  }, [tours, selectedTourId, storeSelectedTourId])

  useEffect(() => {
    if (!activeTour || activeTour.buses.some((b) => b.id === selectedBusId)) return
    const restored = activeTour.buses.find((b) => b.id === getStoredBusId(activeTour.id))
    setSelectedBusId((restored ?? activeTour.buses[0])?.id ?? '')
  }, [activeTour, selectedBusId])

  // Mirror the selection into the store so the Header's tour-day check (which
  // decides whether this very tab is shown) follows the tour picked here.
  useEffect(() => {
    if (activeTourId) setSelectedTourIdInStore(activeTourId)
  }, [activeTourId, setSelectedTourIdInStore])

  useEffect(() => {
    if (!activeTourId || !activeBusId) return
    attendanceService.query(activeTourId, activeBusId).catch((err) => {
      console.log('[ATTENDANCE] failed to load sessions', err)
      toast.error('טעינת בדיקות הנוכחות נכשלה. נסו שוב מאוחר יותר.')
    })
  }, [activeTourId, activeBusId])

  useAttendanceSocket(activeBusId)

  const busSessions = useMemo(
    () => sessions.filter((s) => s.tourId === activeTourId && s.busId === activeBusId),
    [sessions, activeTourId, activeBusId]
  )

  const activeSession = useMemo(
    () => busSessions.find((s) => s.id === selectedSessionId) ?? busSessions[0] ?? null,
    [busSessions, selectedSessionId]
  )

  const stations = useMemo(
    () => groupAttendanceByStation(activeSession, activeBus?.pickupPoints ?? [], searchQuery),
    [activeSession, activeBus?.pickupPoints, searchQuery]
  )

  const stats = useMemo(() => attendanceStats(activeSession), [activeSession])

  const runMutation = async (action: () => Promise<unknown>, errorMessage: string) => {
    setIsSaving(true)
    try {
      await action()
    } catch (err) {
      console.log('[ATTENDANCE] mutation failed', err)
      toast.error(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateSession = (customTitle?: string) => {
    if (!activeTourId || !activeBusId) return
    const title =
      customTitle?.trim() ||
      newSessionTitle.trim() ||
      `בדיקת נוכחות ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
    setNewSessionTitle('')
    setIsCreatingNew(false)
    // Multiple sessions per bus are an explicit feature (one for the morning
    // departure, one for the return) — titles are free-form and never unique.
    void runMutation(
      () => attendanceService.create(activeTourId, activeBusId, title),
      'יצירת בדיקת הנוכחות נכשלה. נסו שוב.'
    )
  }

  // Individual toggle, whole-party toggle and station batch all funnel into
  // the same presence mutation — only the resolved record-id list differs.
  const handleSetPresence = (recordIds: string[], isPresent: boolean) => {
    if (!activeSession || recordIds.length === 0) return
    void runMutation(
      () => attendanceService.setPresence(activeSession.id, recordIds, isPresent),
      'עדכון הנוכחות נכשל. נסו שוב.'
    )
  }

  const handleToggleParty = (party: AttendanceParty) => {
    handleSetPresence(party.recordIds, !party.isPresent)
  }

  const handleBatchStation = (station: AttendanceStation, isPresent: boolean) => {
    handleSetPresence(
      station.parties.flatMap((p) => p.recordIds),
      isPresent
    )
  }

  const handleResetSession = () => {
    if (!activeSession) return
    const sessionId = activeSession.id
    setConfirmState({
      title: 'איפוס בדיקת נוכחות',
      message: `האם לאפס את בדיקת הנוכחות "${activeSession.title}"? כל הסימונים יימחקו.`,
      confirmLabel: 'אפס סימונים',
      onConfirm: () =>
        runMutation(() => attendanceService.reset(sessionId), 'איפוס בדיקת הנוכחות נכשל. נסו שוב.')
    })
  }

  const handleDeleteSession = (sessionId: string) => {
    setConfirmState({
      title: 'מחיקת בדיקת נוכחות',
      message: 'האם למחוק בדיקת נוכחות זו? הפעולה אינה הפיכה.',
      confirmLabel: 'מחק בדיקה',
      onConfirm: () =>
        runMutation(
          () => attendanceService.remove(sessionId),
          'מחיקת בדיקת הנוכחות נכשלה. נסו שוב.'
        )
    })
  }

  const handleConfirm = async () => {
    const action = confirmState?.onConfirm
    setConfirmState(null)
    if (action) await action()
  }

  const togglePickupCollapse = (pickupPoint: string) => {
    setCollapsedPickups((prev) => ({ ...prev, [pickupPoint]: !prev[pickupPoint] }))
  }

  const handleCopySummary = async () => {
    if (!activeSession || !activeTour || !activeBus) return
    const text = formatAttendanceSummary(
      activeTour.title,
      activeBus.busName,
      activeSession,
      stations,
      stats
    )
    try {
      await navigator.clipboard.writeText(text)
      setCopiedSummary(true)
      setTimeout(() => setCopiedSummary(false), 2500)
    } catch (err) {
      console.log('[ATTENDANCE] clipboard write failed', err)
      toast.error('העתקת הדוח נכשלה. נסו שוב או העתיקו ידנית.')
    }
  }

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
        <p className="text-slate-600 font-bold">אין טיול המתקיים היום.</p>
        <p className="text-xs text-slate-400 mt-1">
          בדיקת נוכחות זמינה רק ביום הטיול עצמו.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Tour & bus selection + copy-summary action */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-xs border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label htmlFor="attendance-tour" className="text-xs font-bold text-slate-500">
                טיול:
              </label>
              <select
                id="attendance-tour"
                value={activeTour.id}
                onChange={(e) => {
                  setSelectedTourId(e.target.value)
                  setSelectedBusId('')
                }}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {tours.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({new Date(t.date).toLocaleDateString('he-IL')})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">אוטובוס:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {activeTour.buses.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setSelectedBusId(b.id)
                      setStoredBusId(activeTour.id, b.id)
                    }}
                    aria-pressed={b.id === activeBus.id}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
                      b.id === activeBus.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    )}
                  >
                    <BusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{b.busName}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {activeSession && (
            <button
              type="button"
              onClick={handleCopySummary}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <Share2 className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              <span>{copiedSummary ? 'הדוח הועתק לוואטסאפ!' : 'שתף סיכום נוכחות'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Session bar: pills per session, create form, live metrics, reset */}
      <div className="bg-gradient-to-l from-slate-900 to-indigo-950 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center">
                <UserCheck className="w-5 h-5" aria-hidden="true" />
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                בדיקת נוכחות נוסעים - {activeBus.busName}
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              {busSessions.map((session) => {
                const isSelected = session.id === activeSession?.id
                const presentCount = session.records.filter((r) => r.isPresent).length
                return (
                  <div
                    key={session.id}
                    className={cn(
                      'group flex items-center rounded-xl border transition',
                      isSelected
                        ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold shadow-md'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedSessionId(session.id)}
                      aria-pressed={isSelected}
                      className="px-3 py-1.5 text-xs flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-xl"
                    >
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      <span>{session.title}</span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 rounded-full font-mono font-bold',
                          isSelected ? 'bg-slate-950 text-amber-400' : 'bg-slate-900 text-slate-300'
                        )}
                      >
                        {presentCount}/{session.records.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteSession(session.id)}
                      title="מחק בדיקה זו"
                      aria-label={`מחק את הבדיקה ${session.title}`}
                      className={cn(
                        'p-1.5 hover:text-rose-400 transition opacity-70 group-hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 rounded-lg',
                        isSelected ? 'text-slate-950' : 'text-slate-400'
                      )}
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                )
              })}

              {isCreatingNew ? (
                <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-600">
                  <input
                    type="text"
                    aria-label="שם בדיקת הנוכחות"
                    placeholder="שם הבדיקה (למשל: יציאה חזרה)"
                    value={newSessionTitle}
                    onChange={(e) => setNewSessionTitle(e.target.value)}
                    className="bg-slate-900 text-white text-xs px-2.5 py-1 rounded-lg border border-slate-700 focus:outline-none focus:border-amber-400 w-44"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateSession()
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleCreateSession()}
                    disabled={isSaving}
                    className="px-2.5 py-1 bg-amber-400 text-slate-950 text-xs font-bold rounded-lg hover:bg-amber-300 transition disabled:opacity-50"
                  >
                    צור
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(false)}
                    className="px-2 py-1 text-slate-400 hover:text-white text-xs"
                  >
                    ביטול
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600/60 hover:bg-indigo-600 text-indigo-100 border border-indigo-500/50 transition flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>בדיקת נוכחות חדשה</span>
                </button>
              )}
            </div>
          </div>

          {activeSession && (
            <div
              className="flex items-center gap-3 bg-slate-800/80 p-3 rounded-2xl border border-slate-700/80 shrink-0"
              aria-live="polite"
            >
              <div className="text-center px-2">
                <div className="text-[11px] text-slate-400">נוכחים</div>
                <div className="text-lg font-black text-emerald-400 font-mono">
                  {stats.present} / {stats.total}
                </div>
              </div>

              <div className="h-8 w-px bg-slate-700" />

              <div className="text-center px-2">
                <div className="text-[11px] text-slate-400">אחוז נוכחות</div>
                <div className="text-lg font-black text-amber-400 font-mono">{stats.percent}%</div>
              </div>

              <div className="h-8 w-px bg-slate-700" />

              <button
                type="button"
                onClick={handleResetSession}
                title="אפס את כל סימוני הנוכחות בבדיקה זו"
                aria-label="אפס את כל סימוני הנוכחות בבדיקה זו"
                className="p-2 rounded-xl bg-slate-700 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 border border-slate-600 transition flex items-center gap-1 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">איפוס</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {!activeSession ? (
        <div className="bg-white rounded-3xl p-10 text-center shadow-xs border border-slate-200 space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <UserCheck className="w-8 h-8" aria-hidden="true" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              אין בדיקת נוכחות פעילה לאוטובוס זה
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              צור בדיקת נוכחות כדי לסמן הגעה של משפחות ונוסעים לפי תחנות האיסוף בזמן אמת.
            </p>
            <button
              type="button"
              onClick={() => handleCreateSession('בדיקת בוקר - תחנות איסוף')}
              disabled={isSaving}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition inline-flex items-center gap-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            >
              <Plus className="w-4 h-4 stroke-[3]" aria-hidden="true" />
              <span>התחל בדיקת נוכחות חדשה</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Free-text filter across name / phone / notes */}
          <div className="bg-white rounded-2xl p-3 shadow-xs border border-slate-200 flex items-center gap-3">
            <div className="relative flex-1">
              <Search
                className="w-4 h-4 text-slate-400 absolute end-3 top-2.5"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="חיפוש נוסע או משפחה"
                placeholder="חפש משפחה / נוסע לפי שם, טלפון או הערות..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pe-9 ps-4 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-slate-500 hover:text-slate-800 font-bold px-2 py-1"
              >
                נקה
              </button>
            )}
          </div>

          <div className="space-y-4">
            {stations.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-200">
                <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm font-bold text-slate-700">לא נמצאו נוסעים רשומים לבדיקה</p>
                <p className="text-xs text-slate-400 mt-1">
                  ודא שקיימות הזמנות מאושרות או תפוסות באוטובוס זה במפת המושבים.
                </p>
              </div>
            ) : (
              stations.map((station) => {
                const isAllPresent =
                  station.totalPassengers > 0 &&
                  station.presentPassengers === station.totalPassengers
                const isCollapsed = !!collapsedPickups[station.pickupPoint]

                return (
                  <div
                    key={station.pickupPoint}
                    className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden transition"
                  >
                    <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => togglePickupCollapse(station.pickupPoint)}
                        aria-expanded={!isCollapsed}
                        className="flex items-center gap-2.5 select-none text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-xl"
                      >
                        <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-900">
                            {station.pickupPoint}
                          </span>
                          <span
                            className={cn(
                              'text-[11px] font-black px-2.5 py-0.5 rounded-full font-mono',
                              isAllPresent
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                            )}
                          >
                            {station.presentPassengers}/{station.totalPassengers} נוסעים
                          </span>
                        </div>
                      </button>

                      {/* Batch check / uncheck for the whole station */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleBatchStation(station, true)}
                          disabled={isAllPresent || isSaving}
                          className="px-2.5 py-1 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl transition disabled:opacity-40 flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                          title="סמן את כל הנוסעים בתחנה זו כנוכחים"
                        >
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                          <span className="hidden sm:inline">סמן הכל בתחנה</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleBatchStation(station, false)}
                          disabled={station.presentPassengers === 0 || isSaving}
                          className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl transition disabled:opacity-40 flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                          title="בטל סימון לכל הנוסעים בתחנה זו"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                          <span className="hidden sm:inline">בטל הכל</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => togglePickupCollapse(station.pickupPoint)}
                          aria-label={
                            isCollapsed
                              ? `הצג נוסעים בתחנת ${station.pickupPoint}`
                              : `הסתר נוסעים בתחנת ${station.pickupPoint}`
                          }
                          className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                        >
                          {isCollapsed ? (
                            <ChevronDown className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <ChevronUp className="w-4 h-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* One card per family/party — tapping toggles everyone in it */}
                    {!isCollapsed && (
                      <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {station.parties.map((party) => (
                          <div
                            key={party.id}
                            className={cn(
                              'p-3 rounded-2xl border-2 transition-all flex items-center justify-between gap-3 select-none',
                              party.isPresent
                                ? 'bg-emerald-50/80 border-emerald-400 shadow-xs'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleParty(party)}
                              disabled={isSaving}
                              aria-pressed={party.isPresent}
                              className="flex-1 min-w-0 text-start active:scale-[0.98] transition disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-xl"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-slate-900 truncate">
                                  {party.primaryName}
                                </span>
                                <span
                                  className={cn(
                                    'text-[11px] font-black px-2 py-0.5 rounded-full shrink-0 font-mono',
                                    party.isPresent
                                      ? 'bg-emerald-200 text-emerald-900'
                                      : party.partySize > 1
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-slate-100 text-slate-700'
                                  )}
                                >
                                  {party.partySize === 1 ? 'נוסע 1' : `${party.partySize} אנשים`}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                                מושבים: {party.seatPositions.join(', ')}
                              </div>
                            </button>

                            <div className="flex items-center gap-2 shrink-0">
                              {/* Quick-call a no-show straight from the card */}
                              {party.passengerPhone && (
                                <a
                                  href={`tel:${party.passengerPhone}`}
                                  aria-label={`התקשר אל ${party.primaryName}`}
                                  title={party.passengerPhone}
                                  className="w-8 h-8 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 text-slate-500 hover:text-blue-600 flex items-center justify-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                  <Phone className="w-4 h-4" aria-hidden="true" />
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={() => handleToggleParty(party)}
                                disabled={isSaving}
                                aria-label={
                                  party.isPresent
                                    ? `בטל סימון נוכחות עבור ${party.primaryName}`
                                    : `סמן נוכחות עבור ${party.primaryName}`
                                }
                                aria-pressed={party.isPresent}
                                className={cn(
                                  'w-8 h-8 rounded-xl flex items-center justify-center transition disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600',
                                  party.isPresent
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'border-2 border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-400'
                                )}
                              >
                                {party.isPresent ? (
                                  <CheckCircle2 className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                                ) : (
                                  <Circle className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={handleConfirm}
        onClose={() => setConfirmState(null)}
      />
    </div>
  )
}
