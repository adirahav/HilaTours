import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { seatService } from '../services/seat.service'

type ActionState = 'running' | 'success' | 'error'

// Landing target for the Approve/Reject links in the booking-notification
// email (see backend/tour-service/api/seat/bookingNotification.ts). Rendered
// under ProtectedRoute — an unauthenticated visitor is bounced to /login
// first and returned here (see ProtectedRoute's ?redirect handling) before
// this component ever mounts, so by the time it runs the caller is already
// a logged-in admin.
export function SeatActionPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [state, setState] = useState<ActionState>('running')
  const [errorMsg, setErrorMsg] = useState('')
  const ran = useRef(false)

  const tourId = searchParams.get('tourId') || ''
  const busId = searchParams.get('busId') || ''
  const seatIds = (searchParams.get('seatIds') || '').split(',').filter(Boolean)
  const action = searchParams.get('action')

  useEffect(() => {
    // StrictMode/dev double-invoke guard — this performs a real, non-idempotent
    // write (seat status change), so it must run at most once per page visit.
    if (ran.current) return
    ran.current = true

    if (!tourId || !busId || seatIds.length === 0 || (action !== 'approve' && action !== 'cancel')) {
      setState('error')
      setErrorMsg('קישור לא תקין — חסרים פרטים נדרשים.')
      return
    }

    const run = action === 'approve' ? seatService.approveMany : seatService.cancelMany
    run(tourId, busId, seatIds)
      .then(() => setState('success'))
      .catch((err) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        setState('error')
        setErrorMsg(
          status === 409
            ? 'אחד או יותר מהמושבים כבר אינו במצב הצפוי (כנראה טופל כבר).'
            : 'הפעולה נכשלה. ייתכן שהמושבים כבר טופלו, או שאירעה שגיאת תקשורת.'
        )
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isApprove = action === 'approve'

  return (
    <div className="max-w-lg mx-auto text-center py-16 space-y-4">
      {state === 'running' && (
        <>
          <Loader2 className="w-10 h-10 text-blue-600 mx-auto animate-spin" aria-hidden="true" />
          <p className="text-slate-600 font-bold">מבצע {isApprove ? 'אישור' : 'דחייה'} של המושבים...</p>
        </>
      )}
      {state === 'success' && (
        <>
          <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto" aria-hidden="true" />
          <p className="text-slate-900 font-bold text-lg">
            המושבים {isApprove ? 'אושרו' : 'נדחו'} בהצלחה.
          </p>
        </>
      )}
      {state === 'error' && (
        <>
          <AlertCircle className="w-12 h-12 text-rose-600 mx-auto" aria-hidden="true" />
          <p className="text-rose-700 font-bold">{errorMsg}</p>
        </>
      )}
      <button
        type="button"
        onClick={() => navigate('/admin/seats')}
        className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        מעבר לניהול מושבים
      </button>
    </div>
  )
}
