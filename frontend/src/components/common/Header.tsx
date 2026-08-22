import { Link, useLocation, useNavigate } from 'react-router-dom'
// `FileText` returns when the commented-out "דוח נוסעים" tab below is re-enabled.
import { Bus, LogOut, Calendar, ArrowRight, Sliders } from 'lucide-react'
import { toast } from 'sonner'
import { useStore } from '../../store/store'
import { authService } from '../../services/auth.service'
import { cn } from '../../lib/utils'
import logo from '../../assets/images/logo.png'

type Mode = 'gateway' | 'passenger' | 'admin'
type AdminTab = 'seats' | 'tours' | 'bus-types' | 'report'

const ADMIN_TABS: {
  id: AdminTab
  path: string
  icon: typeof Bus
  desktopLabel: string
  mobileLabel: string
}[] = [
  {
    id: 'seats',
    path: '/admin/seats',
    icon: Bus,
    desktopLabel: 'מפת מושבים ואישורים',
    mobileLabel: 'מפת מושבים'
  },
  {
    id: 'tours',
    path: '/admin/tours',
    icon: Calendar,
    desktopLabel: 'ניהול טיולים ואוטובוסים',
    mobileLabel: 'ניהול טיולים'
  },
  {
    id: 'bus-types',
    path: '/admin/bus-types',
    icon: Sliders,
    desktopLabel: 'ניהול דגמי אוטובוס',
    mobileLabel: 'דגמי אוטובוס'
  }/*,
  {
    id: 'report',
    path: '/admin/report',
    icon: FileText,
    desktopLabel: 'דוח נוסעים',
    mobileLabel: 'דוח נוסעים'
  }*/
]

function getMode(pathname: string): Mode {
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/tour/')) return 'passenger'
  return 'gateway'
}

function getActiveTab(pathname: string): AdminTab {
  const match = ADMIN_TABS.find(t => pathname.startsWith(t.path))
  return match ? match.id : 'seats'
}

export function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const adminUser = useStore(state => state.adminUser)
  const tours = useStore(state => state.tours)
  const selectedTourId = useStore(state => state.selectedTourId)
  const clearAuth = useStore(state => state.clearAuth)

  const mode = getMode(location.pathname)
  const isAdminLoggedIn = mode === 'admin' && adminUser.isLoggedIn
  const activeTab = getActiveTab(location.pathname)

  const tourIdFromPath = location.pathname.match(/^\/tour\/([^/]+)/)?.[1]
  const activeTourId = tourIdFromPath ?? selectedTourId ?? undefined
  const activeTourTitle =
    mode === 'passenger'
      ? tours.find(t => t.id === activeTourId)?.title
      : undefined

  const title = isAdminLoggedIn
    ? 'לוח בקרה ואישור מושבים באוטובוס'
    : activeTourTitle
      ? activeTourTitle
      : 'טיולי משפחות עצמאיות'

  const handleLogout = async () => {
    try {
      // Goes through the service so the persisted token (Capacitor Preferences /
      // localStorage) is removed too — clearAuth() alone only resets store state.
      await authService.logout()
    } catch {
      console.log('[AUTH] logout request failed; clearing local session anyway')
      // Never leave the user in a logged-in state if the API call fails.
      clearAuth()
      toast.error('ההתנתקות הושלמה מקומית, אך לא עודכנה בשרת')
    }
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-lg border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        {/* Logo & Dynamic Title */}
        <Link
          to="/"
          className="flex items-center gap-3 shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <img
            src={logo}
            alt="הילה בלליס"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl shrink-0 object-cover shadow-md shadow-blue-500/20"
          />
          <h1 className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-1.5 flex-wrap">
            <span>הילה בלליס</span>
            <span className="text-slate-400 font-normal text-xs sm:text-sm">- {title}</span>
          </h1>
        </Link>

        {/* Center: Admin Tabs (desktop, only when Admin is logged in) */}
        {isAdminLoggedIn && (
          <nav
            aria-label="ניווט לוח בקרה"
            className="hidden md:flex bg-slate-800 p-1 rounded-2xl border border-slate-700/80 items-center gap-1"
          >
            {ADMIN_TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <Link
                  key={tab.id}
                  to={tab.path}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.desktopLabel}</span>
                </Link>
              )
            })}
          </nav>
        )}

        {/* Left Side Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Passenger back-to-gateway control */}
          {mode === 'passenger' && (
            <Link
              to="/"
              className="text-xs text-slate-300 hover:text-white transition flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <span className="font-medium">חזרה</span>
              <ArrowRight className="w-3.5 h-3.5 text-blue-400 rotate-180" />
            </Link>
          )}

          {/* Admin greeting + logout */}
          {isAdminLoggedIn && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-block text-xs font-bold text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-700/50">
                שלום, {adminUser.name}
              </span>

              <button
                type="button"
                onClick={handleLogout}
                title="התנתק ממערכת הניהול"
                aria-label="התנתק ממערכת הניהול"
                className="text-xs text-rose-300 hover:text-rose-100 bg-rose-950/40 hover:bg-rose-900/60 px-2.5 py-1.5 rounded-xl border border-rose-800/50 transition flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">התנתק</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Admin Tabs (below md breakpoint when admin logged in) */}
      {isAdminLoggedIn && (
        <nav
          aria-label="ניווט לוח בקרה"
          className="md:hidden bg-slate-800/90 border-t border-slate-800 p-1.5 flex items-center justify-around text-xs"
        >
          {ADMIN_TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <Link
                key={tab.id}
                to={tab.path}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex-1 py-1.5 text-center font-bold rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                  isActive ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
                )}
              >
                {tab.mobileLabel}
              </Link>
            )
          })}
        </nav>
      )}
    </header>
  )
}
