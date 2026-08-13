import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="max-w-md mx-auto text-center space-y-4 py-16">
      <h2 className="text-2xl font-bold text-slate-900">404</h2>
      <p className="text-slate-500">הדף לא נמצא</p>
      <Link to="/" className="text-brand-600 hover:underline">
        חזרה לדף הבית
      </Link>
    </div>
  )
}
