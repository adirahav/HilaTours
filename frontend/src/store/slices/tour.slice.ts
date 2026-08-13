import type { StateCreator } from 'zustand'
import type { Tour } from '../../types/tour.types'

export interface TourSlice {
  tours: Tour[]
  selectedTourId: string | null
  setTours: (tours: Tour[]) => void
  setSelectedTourId: (tourId: string | null) => void
  upsertTour: (tour: Tour) => void
  removeTour: (tourId: string) => void
}

export const createTourSlice: StateCreator<TourSlice> = set => ({
  tours: [],
  selectedTourId: null,
  setTours: tours => set({ tours }),
  setSelectedTourId: selectedTourId => set({ selectedTourId }),
  upsertTour: tour =>
    set(state => {
      const exists = state.tours.some(t => t.id === tour.id)
      return {
        tours: exists
          ? state.tours.map(t => (t.id === tour.id ? tour : t))
          : [...state.tours, tour]
      }
    }),
  removeTour: tourId =>
    set(state => ({ tours: state.tours.filter(t => t.id !== tourId) }))
})
