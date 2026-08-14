import type { Seat } from '../types/seat.types'

// Every bus in the fleet has a fixed back door at this row, on the right
// side (`col` 3 and 4 — the same two columns the front-of-row lowest numbers
// normally occupy). Those two seat slots don't exist; the 2 seats they'd
// have used are made up for at the back row instead, so the bus's total
// seat count is unaffected. Shared with BusMap.tsx, which draws the door.
export const BACK_DOOR_ROW = 8

// The back bench is always exactly 5 seats. The 2 seats the back door
// displaces from BACK_DOOR_ROW get their own small compensation row instead
// of being piled onto the bench (see generateBusSeats below). Anything that
// needs to tell "is this seat number in the back row" apart from a standard
// row (BusMap's render split, isNaturalPair, autoSuggestPairs) must use
// this, not a hardcoded `totalSeats - 5`.
export const BACK_ROW_SEAT_COUNT = 5

// How many seats the back door displaces from BACK_DOOR_ROW (columns 3-4)
// — made up for by a dedicated compensation row, not by growing the bench.
const DOOR_GAP_SEATS = 2

/**
 * Generates structured seats for a bus layout based on total seats (50-60).
 * standard row layout: 2 seats (Left), Aisle, 2 seats (Right)
 * back row: 5 seats together. The 2 seats the back door displaces from
 * BACK_DOOR_ROW get their own compensation row (also right-aligned) placed
 * just before the back row, so the bench itself stays a fixed 5 seats.
 *
 * Numbering direction: seat 1 is nearest the front door (physically the
 * rightmost seat, `col` 4 — the driver is always on the left, boarding is
 * always from the right), and numbers increase right-to-left across each
 * row before moving to the next row. So within a row, `col` 4 gets the
 * lowest number, not `col` 1.
 */
export function generateBusSeats(totalSeats: number, existingSeats: Seat[] = []): Seat[] {
  const seats: Seat[] = []
  const existingMap = new Map<number, Seat>()

  if (existingSeats && existingSeats.length > 0) {
    existingSeats.forEach((s) => existingMap.set(s.seatNumber, s))
  }

  // Back row gets 5 seats; the rest are standard rows of 4.
  const standardSeatsCount = totalSeats - 5
  const numStandardRows = Math.floor(standardSeatsCount / 4)
  const leftoverStandard = standardSeatsCount % 4

  let currentSeatNumber = 1

  const buildSeat = (row: number, col: number): Seat => {
    const existing = existingMap.get(currentSeatNumber)
    return {
      id: `seat-${currentSeatNumber}`,
      seatNumber: currentSeatNumber,
      row,
      col,
      seatStatus: existing ? existing.seatStatus : 'available',
      passengerName: existing?.passengerName,
      passengerPhone: existing?.passengerPhone,
      pickupPoint: existing?.pickupPoint,
      notes: existing?.notes,
      bookingGroupId: existing?.bookingGroupId,
      updatedAt: existing?.updatedAt
    }
  }

  // Generate standard rows (4 seats per row: col 4, 3, 2, 1 — right to left).
  // At BACK_DOOR_ROW, columns 3-4 (the right side) are the back door, not
  // seats — skipped here, and made up for at the back row below.
  for (let r = 1; r <= numStandardRows; r++) {
    for (let c = 4; c >= 1; c--) {
      if (r === BACK_DOOR_ROW && c >= 3) continue
      if (currentSeatNumber <= standardSeatsCount) {
        seats.push(buildSeat(r, c))
        currentSeatNumber++
      }
    }
  }

  // Leftover standard seats (not enough for a full row) plus the 2 seats
  // the back door skipped at BACK_DOOR_ROW are combined and laid out as
  // full-width-as-possible rows (right to left, same as every other row) —
  // for both fleet sizes (55/59) this is exactly one full 4-seat row, never
  // two half-empty rows stacked on top of each other.
  let nextRow = numStandardRows + 1
  let extraSeats = leftoverStandard + DOOR_GAP_SEATS
  while (extraSeats > 0) {
    const seatsThisRow = Math.min(4, extraSeats)
    for (let c = 4; c >= 4 - seatsThisRow + 1; c--) {
      seats.push(buildSeat(nextRow, c))
      currentSeatNumber++
    }
    extraSeats -= seatsThisRow
    nextRow++
  }

  // Generate back row (5 seats together in last row) — right to left, same
  // as every other row.
  const backRowIndex = nextRow
  const backRowSeatsCount = totalSeats - (currentSeatNumber - 1)

  for (let c = backRowSeatsCount; c >= 1; c--) {
    seats.push(buildSeat(backRowIndex, c))
    currentSeatNumber++
  }

  return seats
}

/**
 * Checks whether two seats belong to the same adjacent seat pair on the bus.
 * Seat pairs in standard rows: (1,2), (3,4), (5,6), (7,8), etc.
 */
export function isNaturalPair(seatA: number, seatB: number, totalSeats: number): boolean {
  if (Math.abs(seatA - seatB) !== 1) return false
  const min = Math.min(seatA, seatB)

  // Standard rows: odd seat number starting pair (1,2), (3,4), (5,6), (7,8)...
  const standardLimit = totalSeats - BACK_ROW_SEAT_COUNT
  if (min < standardLimit) {
    return min % 2 === 1
  }

  // Back row: any adjacent seats in back row count as adjacent
  return true
}

export interface PairingValidationResult {
  isValid: boolean
  message: string
  formedPairs: [number, number][]
  unpairedSeats: number[]
  suggestedAdditions?: number[]
}

/**
 * Validates the seat pairing rule: passengers must select seats in adjacent
 * pairs (e.g. 2 seats => one adjacent pair, 3 seats => one pair + a single).
 */
export function validateSeatPairing(
  selectedSeatNumbers: number[],
  totalSeats: number
): PairingValidationResult {
  if (selectedSeatNumbers.length === 0) {
    return {
      isValid: true,
      message: 'טרם נבחרו מושבים',
      formedPairs: [],
      unpairedSeats: []
    }
  }

  if (selectedSeatNumbers.length === 1) {
    return {
      isValid: true,
      message: 'נבחר מושב 1 בודד',
      formedPairs: [],
      unpairedSeats: [...selectedSeatNumbers]
    }
  }

  const sorted = [...selectedSeatNumbers].sort((a, b) => a - b)
  const used = new Set<number>()
  const formedPairs: [number, number][] = []

  // Find natural pairs among selected
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i])) continue
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(sorted[j])) continue
      if (isNaturalPair(sorted[i], sorted[j], totalSeats)) {
        formedPairs.push([sorted[i], sorted[j]])
        used.add(sorted[i])
        used.add(sorted[j])
        break
      }
    }
  }

  const unpairedSeats = sorted.filter((s) => !used.has(s))
  const totalPairsNeeded = Math.floor(sorted.length / 2)
  const actualPairsCount = formedPairs.length

  if (actualPairsCount >= totalPairsNeeded) {
    return {
      isValid: true,
      message: `בחירה תקינה! נבחרו ${sorted.length} מושבים (${actualPairsCount} זוגות צמודים${
        unpairedSeats.length > 0 ? ' + מושב בודד' : ''
      })`,
      formedPairs,
      unpairedSeats
    }
  }

  // Invalid selection
  return {
    isValid: false,
    message: `לפי נהלי המערכת, מתוך ${sorted.length} מושבים יש לבחור לפחות ${totalPairsNeeded} זוגות צמודים ברצף. כעת יש ${actualPairsCount} זוגות צמודים.`,
    formedPairs,
    unpairedSeats
  }
}

/**
 * Auto-suggests adjacent pairs for a user requesting N seats.
 */
export function autoSuggestPairs(allSeats: Seat[], count: number, totalSeats: number): number[] {
  const availableSeatNumbers = new Set(
    allSeats.filter((s) => s.seatStatus === 'available').map((s) => s.seatNumber)
  )

  const selected: number[] = []
  let pairsNeeded = Math.floor(count / 2)
  const singlesNeeded = count % 2

  // Search for available natural pairs in standard rows
  const standardLimit = totalSeats - BACK_ROW_SEAT_COUNT
  for (let s = 1; s < standardLimit; s += 2) {
    if (pairsNeeded <= 0) break
    if (availableSeatNumbers.has(s) && availableSeatNumbers.has(s + 1)) {
      selected.push(s, s + 1)
      availableSeatNumbers.delete(s)
      availableSeatNumbers.delete(s + 1)
      pairsNeeded--
    }
  }

  // If back row has adjacent seats
  if (pairsNeeded > 0) {
    for (let s = standardLimit; s < totalSeats; s++) {
      if (pairsNeeded <= 0) break
      if (availableSeatNumbers.has(s) && availableSeatNumbers.has(s + 1)) {
        selected.push(s, s + 1)
        availableSeatNumbers.delete(s)
        availableSeatNumbers.delete(s + 1)
        pairsNeeded--
      }
    }
  }

  // Add remaining singles
  if (singlesNeeded > 0 || pairsNeeded > 0) {
    for (const seatNum of availableSeatNumbers) {
      if (selected.length >= count) break
      selected.push(seatNum)
    }
  }

  return selected.sort((a, b) => a - b)
}
