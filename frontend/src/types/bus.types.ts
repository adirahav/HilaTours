import type { Seat } from './seat.types'

export type DriverSide = 'left' | 'right'
export type DoorPosition = 'front' | 'middle' | 'rear'

export interface Bus {
  id: string
  tourId: string
  busName: string // e.g. "אוטובוס 1 - מרכז"
  description: string
  pickupPoints: string[]
  totalSeats: number // between 50 and 60
  driverSide: DriverSide // side of the bus the driver sits on
  doorPosition: DoorPosition // where the passenger door is located
  // True only for the bus auto-created with its tour. Server-enforced,
  // deletion-protected — never settable by the client.
  isDefault: boolean
  seats: Seat[]
}
