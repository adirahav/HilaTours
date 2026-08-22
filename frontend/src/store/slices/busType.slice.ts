import type { StateCreator } from 'zustand'
import type { BusType } from '../../types/busType.types'

// Bus type templates (F11) are a flat, top-level collection — unlike buses,
// which live inside tours. `busTypeService` is the only writer; components read.
export interface BusTypeSlice {
  busTypes: BusType[]
  selectedBusTypeId: string | null
  setBusTypes: (busTypes: BusType[]) => void
  setSelectedBusTypeId: (busTypeId: string | null) => void
  upsertBusType: (busType: BusType) => void
  removeBusType: (busTypeId: string) => void
}

export const createBusTypeSlice: StateCreator<BusTypeSlice> = set => ({
  busTypes: [],
  selectedBusTypeId: null,
  setBusTypes: busTypes => set({ busTypes }),
  setSelectedBusTypeId: selectedBusTypeId => set({ selectedBusTypeId }),
  upsertBusType: busType =>
    set(state => {
      const exists = state.busTypes.some(t => t.id === busType.id)
      const next = exists
        ? state.busTypes.map(t => (t.id === busType.id ? busType : t))
        : [...state.busTypes, busType]
      // At most one template may be default. The server enforces it on write;
      // mirroring it here keeps the list from showing two defaults until the
      // next refetch.
      return {
        busTypes: busType.isDefault
          ? next.map(t => (t.id === busType.id ? t : { ...t, isDefault: false }))
          : next
      }
    }),
  removeBusType: busTypeId =>
    set(state => ({
      busTypes: state.busTypes.filter(t => t.id !== busTypeId),
      selectedBusTypeId:
        state.selectedBusTypeId === busTypeId ? null : state.selectedBusTypeId
    }))
})
