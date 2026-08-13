import type { StateCreator } from 'zustand'
import type { Bus } from '../../types/bus.types'

export interface BusSlice {
  selectedBusId: string | null
  setSelectedBusId: (busId: string | null) => void
  upsertBus: (bus: Bus) => void
}

export const createBusSlice: StateCreator<BusSlice> = set => ({
  selectedBusId: null,
  setSelectedBusId: selectedBusId => set({ selectedBusId }),
  // Buses live inside tours; upsert mutates the owning tour's bus list.
  upsertBus: () => set({})
})
