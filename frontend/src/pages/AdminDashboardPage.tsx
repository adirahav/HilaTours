import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { useStore } from '../store/store'
import { tourService } from '../services/tour.service'
import { busService } from '../services/bus.service'
import { TourModal } from '../modals/TourModal'
import { BusModal } from '../modals/BusModal'
import { ConfirmModal } from '../modals/ConfirmModal'
import { SeatManagement } from '../components/SeatManagement'
import { TourManagement } from '../components/TourManagement'
import { PassengerManifestReport } from '../components/PassengerManifestReport'
import type { Tour } from '../types/tour.types'
import type { Bus, DriverSide, DoorPosition } from '../types/bus.types'

type AdminTab = 'seats' | 'tours' | 'report'

interface ConfirmState {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void> | void
}

function getActiveTab(pathname: string): AdminTab {
  if (pathname.endsWith('/tours')) return 'tours'
  if (pathname.endsWith('/report')) return 'report'
  return 'seats'
}

// Admin dashboard (Screen 3): the tabbed admin workspace. The active tab is
// driven by the URL (/admin/seats|tours|report) to stay in sync with the
// Header nav. Seat Management and the Passenger Manifest Report are
// self-contained (own tour/bus selection + seat lifecycle via seatService);
// this container owns tour/bus CRUD (F8-F9) through the tour-service, which
// stays the source of truth - every mutation re-syncs the store, and the tours
// list refetches on window focus so seat counts reflect Tab 1 mutations.
// Destructive deletes use an in-app ConfirmModal (Q4) rather than window.confirm.
export function AdminDashboardPage() {
  const location = useLocation()
  const tours = useStore((state) => state.tours)
  const activeTab = getActiveTab(location.pathname)

  const [isLoading, setIsLoading] = useState(false)

  const [isTourModalOpen, setIsTourModalOpen] = useState(false)
  const [tourToEdit, setTourToEdit] = useState<Tour | null>(null)

  const [isBusModalOpen, setIsBusModalOpen] = useState(false)
  const [busToEdit, setBusToEdit] = useState<Bus | null>(null)
  const [busTourId, setBusTourId] = useState<string | null>(null)

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const refetchTours = useMemo(
    () => () =>
      tourService.query().catch((err) => {
        console.log('[ADMIN] refetch tours failed', err)
        toast.error('רענון הטיולים נכשל. נסו שוב מאוחר יותר.')
      }),
    []
  )

  useEffect(() => {
    let active = true
    setIsLoading(true)
    tourService
      .query()
      .catch((err) => {
        console.log('[ADMIN] failed to load tours', err)
        toast.error('טעינת הטיולים נכשלה. נסו שוב מאוחר יותר.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const onFocus = () => {
      tourService.query().catch((err) => {
        console.log('[ADMIN] focus refetch failed', err)
      })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const handleConfirm = async () => {
    const action = confirmState?.onConfirm
    setConfirmState(null)
    if (action) await action()
  }

  // Tour handlers ----------------------------------------------------------
  const handleOpenAddTour = () => {
    setTourToEdit(null)
    setIsTourModalOpen(true)
  }

  const handleOpenEditTour = (tour: Tour) => {
    setTourToEdit(tour)
    setIsTourModalOpen(true)
  }

  const handleSaveTour = async (title: string, date: string, description: string) => {
    try {
      await tourService.save(
        tourToEdit
          ? { id: tourToEdit.id, title, date, description }
          : { title, date, description }
      )
      setIsTourModalOpen(false)
      setTourToEdit(null)
      await refetchTours()
    } catch (err) {
      console.log('[ADMIN] save tour failed', err)
      toast.error('שמירת הטיול נכשלה. נסו שוב.')
    }
  }

  const handleDeleteTour = (tourId: string) => {
    setConfirmState({
      title: 'מחיקת טיול',
      message: 'האם אתה בטוח שברצונך למחוק טיול זה ואת כל האוטובוסים שלו?',
      confirmLabel: 'מחק טיול',
      onConfirm: async () => {
        try {
          await tourService.remove(tourId)
          await refetchTours()
        } catch (err) {
          console.log('[ADMIN] delete tour failed', err)
          toast.error('מחיקת הטיול נכשלה. נסו שוב.')
        }
      }
    })
  }

  // Bus handlers -----------------------------------------------------------
  const handleOpenAddBus = (tourId: string) => {
    setBusToEdit(null)
    setBusTourId(tourId)
    setIsBusModalOpen(true)
  }

  const handleOpenEditBus = (tourId: string, bus: Bus) => {
    setBusToEdit(bus)
    setBusTourId(tourId)
    setIsBusModalOpen(true)
  }

  const handleSaveBus = async (
    busName: string,
    description: string,
    pickupPoints: string[],
    totalSeats: number,
    driverSide: DriverSide,
    doorPosition: DoorPosition
  ) => {
    if (!busTourId) return
    try {
      await busService.save(busTourId, {
        ...(busToEdit ? { id: busToEdit.id } : {}),
        busName,
        description,
        pickupPoints,
        totalSeats,
        driverSide,
        doorPosition
      })
      setIsBusModalOpen(false)
      setBusToEdit(null)
      setBusTourId(null)
      await refetchTours()
    } catch (err) {
      console.log('[ADMIN] save bus failed', err)
      toast.error('שמירת האוטובוס נכשלה. נסו שוב.')
    }
  }

  const handleDeleteBus = (tourId: string, busId: string) => {
    setConfirmState({
      title: 'מחיקת אוטובוס',
      message: 'האם למחוק אוטובוס זה? כל הנתונים שלו יימחקו.',
      confirmLabel: 'מחק אוטובוס',
      onConfirm: async () => {
        try {
          await busService.remove(tourId, busId)
          await refetchTours()
        } catch (err) {
          console.log('[ADMIN] delete bus failed', err)
          toast.error('מחיקת האוטובוס נכשלה. נסו שוב.')
        }
      }
    })
  }

  // Empty state: no tours in the system yet - CTA to create the first tour.
  const showEmptyState = !isLoading && tours.length === 0

  return (
    <div className="space-y-6" dir="rtl">
      {showEmptyState ? (
        <div className="bg-white p-8 rounded-3xl text-center shadow-sm border border-slate-200">
          <p className="text-slate-600 font-bold mb-4">אין טיולים או אוטובוסים קיימים במערכת.</p>
          <button
            type="button"
            onClick={handleOpenAddTour}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 font-bold text-slate-950 rounded-2xl shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>צור טיול ראשון</span>
          </button>
        </div>
      ) : (
        <>
          {activeTab === 'seats' && <SeatManagement isLoading={isLoading} />}

          {activeTab === 'tours' && (
            <TourManagement
              tours={tours}
              isLoading={isLoading}
              handleOpenAddTour={handleOpenAddTour}
              handleOpenEditTour={handleOpenEditTour}
              handleDeleteTour={handleDeleteTour}
              handleOpenAddBus={handleOpenAddBus}
              handleOpenEditBus={handleOpenEditBus}
              handleDeleteBus={handleDeleteBus}
            />
          )}

          {activeTab === 'report' && <PassengerManifestReport isLoading={isLoading} />}
        </>
      )}

      <TourModal
        isOpen={isTourModalOpen}
        onClose={() => {
          setIsTourModalOpen(false)
          setTourToEdit(null)
        }}
        onSave={handleSaveTour}
        tourToEdit={tourToEdit}
      />

      <BusModal
        isOpen={isBusModalOpen}
        onClose={() => {
          setIsBusModalOpen(false)
          setBusToEdit(null)
          setBusTourId(null)
        }}
        onSave={handleSaveBus}
        busToEdit={busToEdit}
      />

      <ConfirmModal
        isOpen={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={handleConfirm}
        onClose={() => setConfirmState(null)}
      />
    </div>
  )
}