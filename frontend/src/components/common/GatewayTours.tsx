import { useState } from 'react'
import { Bus, Calendar, ChevronDown, ChevronLeft, Users } from 'lucide-react'
import type { Tour } from '../../types/tour.types'
import { sanitizeDescriptionHtml } from '../../lib/sanitizeHtml'
import { cn } from '../../lib/utils'

interface GatewayToursProps {
  tours: Tour[]
  onSelectTour: (tourId: string) => void
}

interface TourListItemProps {
  tour: Tour
  onSelectTour: (tourId: string) => void
}

function TourListItem({ tour, onSelectTour }: TourListItemProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

  // Total available seats across every bus in this tour.
  const totalAvailable = (tour.buses || []).reduce(
    (acc, bus) =>
      acc + (bus.seats || []).filter(s => s.seatStatus === 'available').length,
    0
  )
  const busCount = (tour.buses || []).length
  const formattedDate = new Date(tour.date).toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <li className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition group">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 text-base sm:text-lg group-hover:text-blue-600 transition">
              {tour.title}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1 font-semibold text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
              <time dateTime={tour.date}>{formattedDate}</time>
            </span>
            <span aria-hidden="true">•</span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              {busCount} {busCount === 1 ? 'אוטובוס' : 'אוטובוסים'}
            </span>
            <span aria-hidden="true">•</span>
            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              {totalAvailable} מושבים פנויים
            </span>
          </div>

          {tour.description && (
            <div className="relative">
              {/* Absolutely positioned at the top corner (not inline with the
                  text) so it never drifts down as the expanded description
                  grows to several paragraphs — it stays reachable at the top
                  regardless of content height. */}
              <button
                type="button"
                onClick={() => setIsDescriptionExpanded(v => !v)}
                aria-expanded={isDescriptionExpanded}
                aria-label={isDescriptionExpanded ? 'הצג פחות מהתיאור' : 'הצג את כל התיאור'}
                className="absolute top-0 inset-inline-start-0 w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ChevronDown
                  className={cn('w-3 h-3 transition-transform', isDescriptionExpanded && 'rotate-180')}
                  aria-hidden="true"
                />
              </button>
              {/* Admin-authored free text may contain basic HTML tags
                  (bold/italic/lists/line breaks) — sanitized against a tight
                  allowlist before rendering (see sanitizeHtml.ts), never
                  trusted outright even though only admins write it. */}
              <div
                className={cn(
                  'text-xs text-slate-500 ps-6 [&_ul]:list-disc [&_ul]:ps-4 [&_ol]:list-decimal [&_ol]:ps-4',
                  isDescriptionExpanded ? 'whitespace-pre-line' : 'line-clamp-1'
                )}
                dangerouslySetInnerHTML={{
                  __html: sanitizeDescriptionHtml(tour.description)
                }}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onSelectTour(tour.id)}
          aria-label={`בחר מושבים לטיול ${tour.title}`}
          className="w-full sm:w-auto mt-4 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <span>בחר מושבים</span>
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

export function GatewayTours({ tours, onSelectTour }: GatewayToursProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Bus className="w-5 h-5 text-blue-600" aria-hidden="true" />
          <span>בחירת טיול - כניסת נוסעים</span>
        </h2>
        <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2.5 py-1 rounded-lg border border-blue-200">
          {tours.length} טיולים זמינים
        </span>
      </div>

      <ul className="space-y-3 list-none p-0 m-0">
        {tours.map(tour => (
          <TourListItem key={tour.id} tour={tour} onSelectTour={onSelectTour} />
        ))}

        {tours.length === 0 && (
          <li className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 list-none">
            <Bus className="w-10 h-10 text-slate-400 mx-auto mb-2" aria-hidden="true" />
            <p className="font-bold">אין טיולים זמינים במערכת כעת</p>
          </li>
        )}
      </ul>
    </>
  )
}
