import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User,
  Mail,
  Lock,
  UserPlus,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react'
import { toast } from 'sonner'
import { authService } from '../services/auth.service'
import { cn } from '../lib/utils'

type Feedback = { type: 'error' | 'success'; text: string }

// Hardcoded Hebrew copy — never surface raw API payloads (error-handling-rules).
const SIGNUP_ERROR_FALLBACK = 'ההרשמה נכשלה, נסה שוב'
const SIGNUP_SUCCESS = 'ההרשמה הושלמה בהצלחה! מעביר אותך להתחברות...'
const REDIRECT_DELAY_MS = 1200

// Standalone admin-account signup screen (/signup). A self-registered account
// receives no management permissions — the copy here must not imply otherwise.
export function SignUpPage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [nameTouched, setNameTouched] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)

  const [message, setMessage] = useState<Feedback | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Held so the "success → /login" redirect never fires after unmount.
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current)
    },
    []
  )

  const nameId = useId()
  const nameErrorId = useId()
  const emailId = useId()
  const emailErrorId = useId()
  const passwordId = useId()
  const passwordErrorId = useId()
  const feedbackId = useId()

  const isNameValid = name.trim().length >= 2
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const isPasswordValid = password.length >= 6
  const isFormValid = isNameValid && isEmailValid && isPasswordValid

  const nameInvalid = nameTouched && !isNameValid
  const emailInvalid = emailTouched && !isEmailValid
  const passwordInvalid = passwordTouched && !isPasswordValid

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameTouched(true)
    setEmailTouched(true)
    setPasswordTouched(true)

    if (!isFormValid || isSubmitting) return

    setMessage(null)
    setIsSubmitting(true)
    try {
      await authService.signup({
        fullname: name.trim(),
        email: email.trim(),
        password
      })
      setMessage({ type: 'success', text: SIGNUP_SUCCESS })
      toast.success(SIGNUP_SUCCESS)
      // No auto-login: the new account must authenticate through /login.
      redirectTimerRef.current = setTimeout(
        () => navigate('/login'),
        REDIRECT_DELAY_MS
      )
    } catch (err) {
      const text =
        err instanceof Error && err.message ? err.message : SIGNUP_ERROR_FALLBACK
      console.log('[SIGNUP] signup failed')
      setMessage({ type: 'error', text })
      toast.error(text)
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass = (invalid: boolean, withTrailingIcon = false) =>
    cn(
      'w-full bg-slate-50 border rounded-2xl pr-10 py-2.5 text-sm transition focus:ring-2 focus:outline-none',
      withTrailingIcon ? 'pl-10' : 'pl-3',
      invalid
        ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/20'
        : 'border-slate-200 focus:ring-amber-500 focus:border-amber-500'
    )

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-10 px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center mx-auto shadow-md">
            <UserPlus className="w-6 h-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            יצירת חשבון חדש
          </h1>
          <p className="text-xs text-slate-500">הזן את פרטיך להרשמה למערכת</p>
        </div>

        {/* Feedback Message */}
        {message && (
          <div
            id={feedbackId}
            role="alert"
            aria-live="assertive"
            className={cn(
              'p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2.5 transition',
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            )}
          >
            {message.type === 'success' ? (
              <CheckCircle
                className="w-4 h-4 shrink-0 text-emerald-600"
                aria-hidden="true"
              />
            ) : (
              <AlertCircle
                className="w-4 h-4 shrink-0 text-rose-600"
                aria-hidden="true"
              />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Full name */}
          <div>
            <label
              htmlFor={nameId}
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              שם מלא <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User
                className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id={nameId}
                type="text"
                value={name}
                aria-invalid={nameInvalid}
                aria-describedby={nameInvalid ? nameErrorId : undefined}
                onBlur={() => setNameTouched(true)}
                onChange={e => {
                  setName(e.target.value)
                  if (!nameTouched) setNameTouched(true)
                }}
                placeholder="ישראל ישראלי"
                className={inputClass(nameInvalid)}
              />
            </div>
            {nameInvalid && (
              <p
                id={nameErrorId}
                className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>יש להזין שם מלא (לפחות 2 אותיות)</span>
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor={emailId}
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              כתובת דוא"ל <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail
                className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id={emailId}
                type="email"
                value={email}
                aria-invalid={emailInvalid}
                aria-describedby={emailInvalid ? emailErrorId : undefined}
                onBlur={() => setEmailTouched(true)}
                onChange={e => {
                  setEmail(e.target.value)
                  if (!emailTouched) setEmailTouched(true)
                }}
                placeholder="your@email.com"
                className={inputClass(emailInvalid)}
              />
            </div>
            {emailInvalid && (
              <p
                id={emailErrorId}
                className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>יש להזין כתובת דוא"ל תקינה</span>
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor={passwordId}
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              סיסמה <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Lock
                className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
                value={password}
                aria-invalid={passwordInvalid}
                aria-describedby={passwordInvalid ? passwordErrorId : undefined}
                onBlur={() => setPasswordTouched(true)}
                onChange={e => {
                  setPassword(e.target.value)
                  if (!passwordTouched) setPasswordTouched(true)
                }}
                placeholder="••••••••"
                className={inputClass(passwordInvalid, true)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                className="absolute left-3.5 top-3.5 text-slate-400 hover:text-slate-600 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {passwordInvalid && (
              <p
                id={passwordErrorId}
                className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>הסיסמה חייבת להכיל לפחות 6 תווים</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-md transition text-sm flex items-center justify-center gap-2 mt-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            {isSubmitting ? (
              <span>נרשם...</span>
            ) : (
              <>
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                <span>הרשמה למערכת</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="hover:text-slate-900 transition flex items-center gap-1 font-medium"
          >
            <ArrowRight className="w-3.5 h-3.5 rotate-180" aria-hidden="true" />
            <span>חזרה לעמוד הראשי</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-blue-600 hover:text-blue-800 font-bold transition"
          >
            יש לך כבר חשבון? התחבר
          </button>
        </div>
      </div>
    </div>
  )
}
