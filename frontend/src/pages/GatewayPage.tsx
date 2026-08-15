import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useStore } from '../store/store'
import { tourService } from '../services/tour.service'
import { GatewayTours } from '../components/common/GatewayTours'
import { GatewayAdminLogin } from '../components/common/GatewayAdminLogin'
import { filterUpcomingTours } from '../lib/tourDate'

// Landing gateway: passengers pick a tour, admins log in.
export function GatewayPage() {
  const navigate = useNavigate()
  const tours = useStore(state => state.tours)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (tours.length > 0) return
    let active = true
    setIsLoading(true)
    tourService
      .query()
      .catch(err => {
        console.log('[GATEWAY] failed to load tours', err)
        toast.error('טעינת הטיולים נכשלה. נסו שוב מאוחר יותר.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
    // Load once on mount; guarded above when tours already present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-12">
      <section className="lg:col-span-7 space-y-4">
        {isLoading && tours.length === 0 ? (
          <div
            className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 animate-pulse"
            aria-live="polite"
          >
            טוען טיולים...
          </div>
        ) : (
          <GatewayTours
            tours={filterUpcomingTours(tours)}
            // Encode the id so a server-supplied value can never break out of
            // the passenger route (e.g. "../admin") via path traversal.
            onSelectTour={tourId =>
              navigate(`/tour/${encodeURIComponent(tourId)}`)
            }
          />
        )}
      </section>
      <aside className="lg:col-span-5">
        <GatewayAdminLogin
          onAdminLoginSuccess={() => navigate('/admin')}
        />
      </aside>
    </div>
  )
}

