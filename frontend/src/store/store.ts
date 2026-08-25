import { create } from 'zustand'
import { createAuthSlice, type AuthSlice } from './slices/auth.slice'
import { createTourSlice, type TourSlice } from './slices/tour.slice'
import { createBusSlice, type BusSlice } from './slices/bus.slice'
import { createBusTypeSlice, type BusTypeSlice } from './slices/busType.slice'
import { createSeatSlice, type SeatSlice } from './slices/seat.slice'
import { createAttendanceSlice, type AttendanceSlice } from './slices/attendance.slice'

export type AppStore = AuthSlice &
  TourSlice &
  BusSlice &
  BusTypeSlice &
  SeatSlice &
  AttendanceSlice

export const useStore = create<AppStore>()((...args) => ({
  ...createAuthSlice(...args),
  ...createTourSlice(...args),
  ...createBusSlice(...args),
  ...createBusTypeSlice(...args),
  ...createSeatSlice(...args),
  ...createAttendanceSlice(...args)
}))
