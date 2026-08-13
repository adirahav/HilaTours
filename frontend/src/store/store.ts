import { create } from 'zustand'
import { createAuthSlice, type AuthSlice } from './slices/auth.slice'
import { createTourSlice, type TourSlice } from './slices/tour.slice'
import { createBusSlice, type BusSlice } from './slices/bus.slice'
import { createSeatSlice, type SeatSlice } from './slices/seat.slice'

export type AppStore = AuthSlice & TourSlice & BusSlice & SeatSlice

export const useStore = create<AppStore>()((...args) => ({
  ...createAuthSlice(...args),
  ...createTourSlice(...args),
  ...createBusSlice(...args),
  ...createSeatSlice(...args)
}))
