import { useNavigate, useSearchParams } from 'react-router-dom'
import { GatewayAdminLogin } from '../components/common/GatewayAdminLogin'

// Only an in-app relative path is ever honored as a post-login redirect target
// (must start with a single "/", never "//" which browsers treat as
// protocol-relative — e.g. "//evil.com") — an open redirect via a crafted
// ?redirect= query value is not acceptable just because the value happened
// to be in the URL.
function safeRedirectTarget(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/admin'
}

// Admin login screen at /login. Reuses the gateway admin login card.
// ProtectedRoute sends unauthenticated visitors here with ?redirect=<path>
// (e.g. from an email approve/reject link) so login returns them to what
// they were trying to do instead of always landing on /admin.
export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectTarget = safeRedirectTarget(searchParams.get('redirect'))

  return (
    <div className="max-w-md mx-auto space-y-4">
      <GatewayAdminLogin onAdminLoginSuccess={() => navigate(redirectTarget)} />
      <p className="text-center text-xs text-slate-500">
        <span>אין לך חשבון? </span>
        <button
          type="button"
          onClick={() => navigate('/signup')}
          className="text-blue-600 hover:text-blue-800 font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
        >
          יצירת חשבון חדש
        </button>
      </p>
    </div>
  )
}
