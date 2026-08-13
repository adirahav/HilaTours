import type { StateCreator } from 'zustand'
import type { Seat } from '../../types/seat.types'
import type { AppStore } from '../store'

export interface SeatSlice {
  selectedSeatNumbers: number[]
  toggleSeatSelection: (seatNumber: number) => void
  clearSeatSelection: () => void
  // Applies a fresh seat list for a bus after a seat action or re-sync.
  applySeatUpdate: (busId: string, seats: Seat[]) => void
}

// Cross-slice creator: applySeatUpdate re-syncs the seat list that lives
// inside the owning tour's bus, so the seat map never renders stale state.
export const createSeatSlice: StateCreator<AppStore, [], [], SeatSlice> = (set) => ({
  selectedSeatNumbers: [],
  toggleSeatSelection: (seatNumber) =>
    set((state) => ({
      selectedSeatNumbers: state.selectedSeatNumbers.includes(seatNumber)
        ? state.selectedSeatNumbers.filter((n) => n !== seatNumber)
        : [...state.selectedSeatNumbers, seatNumber]
    })),
  clearSeatSelection: () => set({ selectedSeatNumbers: [] }),
  applySeatUpdate: (busId, seats) =>
    set((state) => ({
      tours: state.tours.map((tour) => ({
        ...tour,
        buses: tour.buses.map((bus) =>
          bus.id === busId ? { ...bus, seats } : bus
        )
      }))
    }))
})
