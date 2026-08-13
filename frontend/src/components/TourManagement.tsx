import { Plus, Calendar, Edit2, Trash2, Bus as BusIcon, MapPin } from 'lucide-react'
import type { Tour } from '../types/tour.types'
import type { Bus } from '../types/bus.types'
import { cn } from '../lib/utils'

interface TourManagementProps {
  tours: Tour[]
  isLoading?: boolean
  handleOpenAddTour: () => void
  handleOpenEditTour: (tour: Tour) => void
  handleDeleteTour: (tourId: string) => void
  handleOpenAddBus: (tourId: string) => void
  handleOpenEditBus: (tourId: string, bus: Bus) => void
  handleDeleteBus: (tourId: string, busId: string) => void
}

// Admin TourManagement (Screen 3 - Tab 2): lists active tours as cards with a
// per-tour bus grid, exposing add/edit/soft-delete for tours and buses (F8-F9).
// Data is derived from the Zustand store (source of truth = tour-service);
// per-bus seat counts are computed from the loaded seat state.
export function TourManagement({
  tours,
  isLoading = false,
  handleOpenAddTour,
  handleOpenEditTour,
  handleDeleteTour,
  handleOpenAddBus,
  handleOpenEditBus,
  handleDeleteBus
}: TourManagementProps) {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-900">ניהול טיולים ואוטובוסים</h2>
          <p className="text-xs text-slate-500">הוספה, עריכה ומחיקת טיולים ואוטובוסים במערכת</p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddTour}
          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs sm:text-sm rounded-2xl shadow-md transition flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>הוסף טיול חדש</span>
        </button>
      </div>

      {isLoading && tours.length === 0 ? (
        <div
          className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500 animate-pulse"
          aria-live="polite"
        >
          טוען טיולים...
        </div>
      ) : tours.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          אין טיולים במערכת. הוסיפו טיול חדש כדי להתחיל.
        </div>
      ) : (
        <div className="space-y-6">
          {tours.map((tour) => (
            <div
              key={tour.id}
              className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4"
            >
              {/* Tour header bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-900">{tour.title}</h3>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200 font-semibold">
                      {(tour.buses || []).length}{' '}
                      {(tour.buses || []).length === 1 ? 'אוטובוס' : 'אוטובוסים'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    <time dateTime={tour.date}>
                      תאריך יציאה: {new Date(tour.date).toLocaleDateString('he-IL')}
                    </time>
                  </p>
                </div>

                {/* Tour action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditTour(tour)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>ערוך טיול</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTour(tour.id)}
                    aria-label={`מחק את הטיול ${tour.title}`}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>מחק</span>
                  </button>
                </div>
              </div>

              {/* Buses grid for this tour */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    אוטובוסים בטיול זה:
                  </h4>
                  <button
                    type="button"
                    onClick={() => handleOpenAddBus(tour.id)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md px-1"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>הוסף עוד אוטובוס</span>
                  </button>
                </div>

                {(tour.buses || []).length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200 p-4 text-center">
                    אין אוטובוסים בטיול זה. הוסיפו אוטובוס כדי להתחיל.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(tour.buses || []).map((bus) => {
                      const takenCount = (bus.seats || []).filter(
                        (s) => s.seatStatus === 'taken'
                      ).length
                      const pendingCount = (bus.seats || []).filter(
                        (s) => s.seatStatus === 'pending'
                      ).length
                      const freeCount = (bus.seats || []).filter(
                        (s) => s.seatStatus === 'available'
                      ).length
                      // The tour's auto-created default bus (server-enforced,
                      // see backend bus.service.createDefaultBus) is the
                      // "main" (ראשי) bus and cannot be deleted.
                      const isFirstBus = bus.isDefault

                      return (
                        <div
                          key={bus.id}
                          className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h5 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                <BusIcon className="w-4 h-4 text-blue-600" aria-hidden="true" />
                                <span>{bus.busName}</span>
                                {isFirstBus && (
                                  <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded-md">
                                    ראשי
                                  </span>
                                )}
                              </h5>
                              {bus.description && (
                                <p className="text-xs text-slate-500 mt-0.5">{bus.description}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditBus(tour.id, bus)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                title="ערוך אוטובוס"
                                aria-label={`ערוך את האוטובוס ${bus.busName}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={isFirstBus}
                                aria-disabled={isFirstBus}
                                onClick={() => handleDeleteBus(tour.id, bus.id)}
                                className={cn(
                                  'p-1.5 rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500',
                                  isFirstBus
                                    ? 'text-slate-300 cursor-not-allowed opacity-50'
                                    : 'text-slate-500 hover:text-rose-600 hover:bg-white'
                                )}
                                title={
                                  isFirstBus
                                    ? 'לא ניתן למחוק את האוטובוס הראשי של הטיול'
                                    : 'מחק אוטובוס'
                                }
                                aria-label={
                                  isFirstBus
                                    ? `לא ניתן למחוק את האוטובוס הראשי ${bus.busName}`
                                    : `מחק את האוטובוס ${bus.busName}`
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          {/* Pickup locations tags */}
                          <div>
                            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mb-1">
                              <MapPin className="w-3 h-3 text-rose-500" aria-hidden="true" />
                              נקודות איסוף ({bus.pickupPoints.length}):
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {bus.pickupPoints.map((pt, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] bg-white text-slate-700 px-2 py-0.5 rounded-md border border-slate-200"
                                >
                                  {pt}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Seat counts (derived from store state) */}
                          <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                            <div>
                              <strong>{bus.totalSeats}</strong> מושבים סה"כ
                            </div>
                            <div className="flex gap-2">
                              <span className="text-emerald-700 font-bold">{freeCount} פנויים</span>
                              <span className="text-amber-700 font-bold">
                                {pendingCount} ממתינים
                              </span>
                              <span className="text-rose-700 font-bold">{takenCount} תפוסים</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
