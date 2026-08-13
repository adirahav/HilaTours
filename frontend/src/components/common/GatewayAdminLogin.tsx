import { useId, useState } from 'react'
import { ShieldCheck, Mail, Lock, CheckCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { authService } from '../../services/auth.service'
import { cn } from '../../lib/utils'

interface GatewayAdminLoginProps {
  // Routing lives in the Page layer: the host passes a callback to run on success.
  onAdminLoginSuccess: () => void
}

type Feedback = { type: 'error' | 'success'; text: string }

// Friendly Hebrew fallback shown when the server does not provide a usable message.
const LOGIN_ERROR_FALLBACK = 'פרטי ההתחברות שגויים'
const LOGIN_SUCCESS = 'התחברת בהצלחה'

export function GatewayAdminLogin({ onAdminLoginSuccess }: GatewayAdminLoginProps) {
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [message, setMessage] = useState<Feedback | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const emailId = useId()
  const emailErrorId = useId()
  const passwordId = useId()
  const passwordErrorId = useId()
  const feedbackId = useId()

  const isEmailValid =
    loginEmail.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail.trim())
  const isPasswordValid = loginPassword.trim().length > 0
  const isFormValid = isEmailValid && isPasswordValid

  const emailInvalid = emailTouched && !isEmailValid
  const passwordInvalid = passwordTouched && !isPasswordValid

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailTouched(true)
    setPasswordTouched(true)

    if (!isFormValid || isSubmitting) return

    setMessage(null)
    setIsSubmitting(true)
    try {
      await authService.login({
        email: loginEmail.trim(),
        password: loginPassword
      })
      setMessage({ type: 'success', text: LOGIN_SUCCESS })
      toast.success(LOGIN_SUCCESS)
      onAdminLoginSuccess()
    } catch (err) {
      // Never surface raw API payloads/tokens — map to a hardcoded Hebrew message.
      const text =
        err instanceof Error && err.message ? err.message : LOGIN_ERROR_FALLBACK
      console.log('[LOGIN] admin login failed')
      setMessage({ type: 'error', text })
      toast.error(text)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 text-white p-5 text-center">
        <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center mx-auto mb-2 font-bold shadow-md shadow-amber-500/20">
          <ShieldCheck className="w-6 h-6" aria-hidden="true" />
        </div>
        <h2 className="text-base font-bold">כניסת מנהל מערכת</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          אישור מושבים, ניהול טיולים ודוחות
        </p>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {/* Feedback Message */}
        {message && (
          <div
            id={feedbackId}
            role="alert"
            aria-live="assertive"
            className={cn(
              'p-3 rounded-xl text-xs flex items-center gap-2',
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            )}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleAdminLogin} noValidate className="space-y-3">
          <div>
            <label
              htmlFor={emailId}
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              דוא"ל מנהל:
            </label>
            <div className="relative">
              <Mail
                className="w-4 h-4 text-slate-400 absolute right-3 top-3"
                aria-hidden="true"
              />
              <input
                id={emailId}
                type="email"
                value={loginEmail}
                aria-invalid={emailInvalid}
                aria-describedby={emailInvalid ? emailErrorId : undefined}
                onBlur={() => setEmailTouched(true)}
                onChange={e => {
                  setLoginEmail(e.target.value)
                  if (!emailTouched) setEmailTouched(true)
                }}
                className={cn(
                  'w-full bg-slate-50 border rounded-xl pr-10 pl-3 py-2 text-xs sm:text-sm focus:ring-2 focus:outline-none',
                  emailInvalid
                    ? 'border-rose-500 focus:ring-rose-400 bg-rose-50/30'
                    : 'border-slate-300 focus:ring-amber-500'
                )}
                placeholder="admin@bus.co.il"
              />
            </div>
            {emailInvalid && (
              <p
                id={emailErrorId}
                className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>
                  {loginEmail.trim() === ''
                    ? 'שדה חובה - יש להזין כתובת דוא"ל'
                    : 'כתובת דוא"ל אינה תקינה'}
                </span>
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor={passwordId}
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              סיסמה:
            </label>
            <div className="relative">
              <Lock
                className="w-4 h-4 text-slate-400 absolute right-3 top-3"
                aria-hidden="true"
              />
              <input
                id={passwordId}
                type="password"
                value={loginPassword}
                aria-invalid={passwordInvalid}
                aria-describedby={passwordInvalid ? passwordErrorId : undefined}
                onBlur={() => setPasswordTouched(true)}
                onChange={e => {
                  setLoginPassword(e.target.value)
                  if (!passwordTouched) setPasswordTouched(true)
                }}
                className={cn(
                  'w-full bg-slate-50 border rounded-xl pr-10 pl-3 py-2 text-xs sm:text-sm focus:ring-2 focus:outline-none',
                  passwordInvalid
                    ? 'border-rose-500 focus:ring-rose-400 bg-rose-50/30'
                    : 'border-slate-300 focus:ring-amber-500'
                )}
                placeholder="••••••••"
              />
            </div>
            {passwordInvalid && (
              <p
                id={passwordErrorId}
                className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>שדה חובה - יש להזין סיסמה</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold rounded-xl shadow-md transition text-xs sm:text-sm mt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            {isSubmitting ? 'מתחבר...' : 'התחבר כמנהל'}
          </button>
        </form>
      </div>
    </div>
  )
}
