import { useNavigate } from 'react-router-dom'
import { GatewayAdminLogin } from '../components/common/GatewayAdminLogin'

// Admin login screen at /login. Reuses the gateway admin login card.
export function LoginPage() {
  const navigate = useNavigate()
  return (
    <div className="max-w-md mx-auto space-y-4">
      <GatewayAdminLogin onAdminLoginSuccess={() => navigate('/admin')} />
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
