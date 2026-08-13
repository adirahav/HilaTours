import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Header } from '../components/common/Header'

// Single app shell. The one and only <Toaster /> is mounted here per
// .rule/error-handling-rules.md — do not mount another per page.
export function AppLayout() {
  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans"
      dir="rtl"
    >
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
      <Toaster position="top-center" richColors dir="rtl" />
    </div>
  )
}
