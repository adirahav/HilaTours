// Seat domain types. seatStatus values are the canonical
// available/pending/taken/reserved strings used across UI, API, and DB.
export type SeatStatus = 'available' | 'pending' | 'taken' | 'reserved'

export interface Seat {
  id: string // e.g. "bus1-seat1"
  seatNumber: number // 1..totalSeats
  row: number // row number from front
  col: number // column within the row
  isAisle?: boolean
  seatStatus: SeatStatus
  passengerName?: string
  passengerPhone?: string
  pickupPoint?: string
  notes?: string
  bookingGroupId?: string
  updatedAt?: string
}
