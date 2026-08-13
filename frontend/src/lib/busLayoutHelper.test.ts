import { describe, it, expect } from 'vitest'
import {
  generateBusSeats,
  isNaturalPair,
  validateSeatPairing,
  autoSuggestPairs
} from './busLayoutHelper'
import type { Seat } from '../types/seat.types'

describe('generateBusSeats', () => {
  it('generates exactly totalSeats seats with sequential numbers', () => {
    const seats = generateBusSeats(53)
    expect(seats).toHaveLength(53)
    expect(seats.map((s) => s.seatNumber)).toEqual(
      Array.from({ length: 53 }, (_, i) => i + 1)
    )
  })

  it('puts the last 5 seats in a single back row', () => {
    const seats = generateBusSeats(53)
    const backRow = seats.filter((s) => s.seatNumber > 53 - 5)
    const rows = new Set(backRow.map((s) => s.row))
    expect(backRow).toHaveLength(5)
    expect(rows.size).toBe(1)
  })

  it('defaults every generated seat to available', () => {
    const seats = generateBusSeats(50)
    expect(seats.every((s) => s.seatStatus === 'available')).toBe(true)
  })

  it('preserves existing seat status by seatNumber', () => {
    const existing: Seat[] = [
      { id: 'seat-3', seatNumber: 3, row: 1, col: 3, seatStatus: 'taken', passengerName: 'דנה' }
    ]
    const seats = generateBusSeats(50, existing)
    const seat3 = seats.find((s) => s.seatNumber === 3)!
    expect(seat3.seatStatus).toBe('taken')
    expect(seat3.passengerName).toBe('דנה')
  })
})

describe('isNaturalPair', () => {
  it('treats (1,2) and (3,4) as natural pairs in standard rows', () => {
    expect(isNaturalPair(1, 2, 55)).toBe(true)
    expect(isNaturalPair(3, 4, 55)).toBe(true)
  })

  it('rejects (2,3) which straddles the aisle', () => {
    expect(isNaturalPair(2, 3, 55)).toBe(false)
  })

  it('rejects non-adjacent seats', () => {
    expect(isNaturalPair(1, 3, 55)).toBe(false)
  })
})

describe('validateSeatPairing', () => {
  it('accepts an empty selection', () => {
    expect(validateSeatPairing([], 55).isValid).toBe(true)
  })

  it('accepts a single seat', () => {
    const res = validateSeatPairing([5], 55)
    expect(res.isValid).toBe(true)
    expect(res.unpairedSeats).toEqual([5])
  })

  it('accepts a valid adjacent pair', () => {
    const res = validateSeatPairing([1, 2], 55)
    expect(res.isValid).toBe(true)
    expect(res.formedPairs).toEqual([[1, 2]])
  })

  it('rejects two non-adjacent seats', () => {
    const res = validateSeatPairing([1, 5], 55)
    expect(res.isValid).toBe(false)
  })

  it('accepts a pair plus a single (3 seats)', () => {
    const res = validateSeatPairing([1, 2, 7], 55)
    expect(res.isValid).toBe(true)
    expect(res.formedPairs).toEqual([[1, 2]])
    expect(res.unpairedSeats).toEqual([7])
  })
})

describe('autoSuggestPairs', () => {
  it('suggests an adjacent available pair', () => {
    const seats = generateBusSeats(55)
    const suggestion = autoSuggestPairs(seats, 2, 55)
    expect(suggestion).toHaveLength(2)
    expect(isNaturalPair(suggestion[0], suggestion[1], 55)).toBe(true)
  })

  it('does not suggest taken seats', () => {
    const seats = generateBusSeats(55).map((s) =>
      s.seatNumber <= 2 ? { ...s, seatStatus: 'taken' as const } : s
    )
    const suggestion = autoSuggestPairs(seats, 2, 55)
    expect(suggestion).not.toContain(1)
    expect(suggestion).not.toContain(2)
  })
})
