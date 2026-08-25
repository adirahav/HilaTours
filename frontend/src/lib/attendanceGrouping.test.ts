import { describe, it, expect } from 'vitest'
import {
  attendanceStats,
  formatAttendanceSummary,
  groupAttendanceByStation,
  partyKeyOf
} from './attendanceGrouping'
import type { AttendanceRecord, AttendanceSession } from '../types/attendance.types'

let seq = 0

function rec(over: Partial<AttendanceRecord> = {}): AttendanceRecord {
  seq += 1
  return {
    id: `r${seq}`,
    sessionId: 's1',
    seatId: `seat-${seq}`,
    seatPosition: String(seq),
    passengerName: `נוסע ${seq}`,
    pickupPoint: 'תחנה א',
    isPresent: false,
    checkedInAt: null,
    ...over
  }
}

function session(records: AttendanceRecord[]): AttendanceSession {
  return { id: 's1', tourId: 't1', busId: 'b1', title: 'בדיקת בוקר', createdAt: '', records }
}

describe('partyKeyOf', () => {
  it('prefers an explicit bookingGroupId over phone and name', () => {
    const key = partyKeyOf(rec({ bookingGroupId: 'grp-7', passengerPhone: '0501234567' }))
    expect(key).toBe('grp-7')
  })

  it('falls back to the phone digits when there is no bookingGroupId', () => {
    expect(partyKeyOf(rec({ passengerPhone: '050-123-4567' }))).toBe('phone-0501234567')
  })

  it('ignores a phone shorter than 6 chars and falls back to the name', () => {
    expect(partyKeyOf(rec({ passengerName: 'דנה', passengerPhone: '123' }))).toBe('name-דנה')
  })

  it('falls back to the name when there is no phone at all', () => {
    expect(partyKeyOf(rec({ passengerName: 'יוסי' }))).toBe('name-יוסי')
  })

  it('groups two differently-formatted spellings of one phone together', () => {
    const a = partyKeyOf(rec({ passengerPhone: '050-1234567' }))
    const b = partyKeyOf(rec({ passengerPhone: '0501234567' }))
    expect(a).toBe(b)
  })
})

describe('groupAttendanceByStation', () => {
  it('returns nothing for a null session', () => {
    expect(groupAttendanceByStation(null, ['תחנה א'])).toEqual([])
  })

  it('merges a family sharing one phone into a single toggle-all party', () => {
    const family = [
      rec({ passengerName: 'אבי כהן', passengerPhone: '0501111111', seatPosition: '4' }),
      rec({ passengerName: 'רותי כהן', passengerPhone: '0501111111', seatPosition: '3' })
    ]
    const [station] = groupAttendanceByStation(session(family), ['תחנה א'])

    expect(station.parties).toHaveLength(1)
    expect(station.parties[0].partySize).toBe(2)
    // Sorted by seat, so the seat-3 passenger is the primary name on the card.
    expect(station.parties[0].primaryName).toBe('רותי כהן')
    expect(station.parties[0].seatPositions).toEqual(['3', '4'])
    expect(station.parties[0].recordIds).toHaveLength(2)
  })

  it('keeps unrelated passengers at one station as separate parties', () => {
    const [station] = groupAttendanceByStation(
      session([
        rec({ passengerName: 'אבי', passengerPhone: '0501111111' }),
        rec({ passengerName: 'דנה', passengerPhone: '0502222222' })
      ]),
      ['תחנה א']
    )
    expect(station.parties).toHaveLength(2)
  })

  it('marks a party present only when every member is checked in', () => {
    const [station] = groupAttendanceByStation(
      session([
        rec({ passengerPhone: '0501111111', isPresent: true }),
        rec({ passengerPhone: '0501111111', isPresent: false })
      ]),
      ['תחנה א']
    )
    expect(station.parties[0].isPresent).toBe(false)
    expect(station.parties[0].presentCount).toBe(1)
  })

  it('reports per-station progress across parties', () => {
    const [station] = groupAttendanceByStation(
      session([
        rec({ passengerPhone: '0501111111', isPresent: true }),
        rec({ passengerPhone: '0501111111', isPresent: true }),
        rec({ passengerPhone: '0502222222', isPresent: false })
      ]),
      ['תחנה א']
    )
    expect(station.presentPassengers).toBe(2)
    expect(station.totalPassengers).toBe(3)
  })

  it('orders stations by the bus pickup-point order, not by record order', () => {
    const stations = groupAttendanceByStation(
      session([rec({ pickupPoint: 'תחנה ב' }), rec({ pickupPoint: 'תחנה א' })]),
      ['תחנה א', 'תחנה ב']
    )
    expect(stations.map(s => s.pickupPoint)).toEqual(['תחנה א', 'תחנה ב'])
  })

  it('buckets a record with no pickup point under an explicit placeholder station', () => {
    const stations = groupAttendanceByStation(session([rec({ pickupPoint: '' })]), [])
    expect(stations.map(s => s.pickupPoint)).toEqual(['ללא נקודת איסוף מוגדרת'])
  })

  it('drops stations that the bus declares but that have no passengers', () => {
    const stations = groupAttendanceByStation(session([rec({ pickupPoint: 'תחנה א' })]), [
      'תחנה א',
      'תחנה ריקה'
    ])
    expect(stations.map(s => s.pickupPoint)).toEqual(['תחנה א'])
  })

  it('filters by name, and drops a station left empty by the search', () => {
    const stations = groupAttendanceByStation(
      session([
        rec({ passengerName: 'אבי כהן', pickupPoint: 'תחנה א' }),
        rec({ passengerName: 'דנה לוי', pickupPoint: 'תחנה ב' })
      ]),
      ['תחנה א', 'תחנה ב'],
      'דנה'
    )
    expect(stations).toHaveLength(1)
    expect(stations[0].pickupPoint).toBe('תחנה ב')
  })

  it('filters by phone and by notes as well as by name', () => {
    const records = [
      rec({ passengerName: 'אבי', passengerPhone: '0509998888', notes: 'כיסא גלגלים' }),
      rec({ passengerName: 'דנה', passengerPhone: '0501112222' })
    ]
    expect(groupAttendanceByStation(session(records), ['תחנה א'], '9998')[0].parties).toHaveLength(1)
    expect(groupAttendanceByStation(session(records), ['תחנה א'], 'גלגלים')[0].parties).toHaveLength(
      1
    )
  })

  it('sorts seat positions numerically, so seat 12 comes after seat 3', () => {
    const [station] = groupAttendanceByStation(
      session([
        rec({ passengerPhone: '0501111111', seatPosition: '12' }),
        rec({ passengerPhone: '0501111111', seatPosition: '3' })
      ]),
      ['תחנה א']
    )
    expect(station.parties[0].seatPositions).toEqual(['3', '12'])
  })
})

describe('attendanceStats', () => {
  it('is all-zero for a null session', () => {
    expect(attendanceStats(null)).toEqual({ total: 0, present: 0, missing: 0, percent: 0 })
  })

  it('counts present/missing and rounds the percentage', () => {
    const stats = attendanceStats(
      session([rec({ isPresent: true }), rec({ isPresent: false }), rec({ isPresent: false })])
    )
    expect(stats).toEqual({ total: 3, present: 1, missing: 2, percent: 33 })
  })

  it('avoids dividing by zero on an empty session', () => {
    expect(attendanceStats(session([])).percent).toBe(0)
  })
})

describe('formatAttendanceSummary', () => {
  it('produces a WhatsApp-ready report marking present and missing parties', () => {
    const records = [
      rec({ passengerName: 'אבי כהן', passengerPhone: '0501111111', isPresent: true }),
      rec({ passengerName: 'רותי כהן', passengerPhone: '0501111111', isPresent: true }),
      rec({ passengerName: 'דנה לוי', passengerPhone: '0502222222', isPresent: false })
    ]
    const s = session(records)
    const stations = groupAttendanceByStation(s, ['תחנה א'])
    const text = formatAttendanceSummary('טיול לגליל', 'אוטובוס 1', s, stations, attendanceStats(s))

    expect(text).toContain('📋 דוח נוכחות - טיול לגליל (אוטובוס 1)')
    expect(text).toContain('בדיקה: בדיקת בוקר')
    expect(text).toContain('נוכחים: 2 מתוך 3 נוסעים (67%)')
    expect(text).toContain('חסרים: 1')
    expect(text).toContain('📍 תחנה א (2/3 נוסעים):')
    // The 2-person family renders as one line listing both names.
    expect(text).toContain('✅ אבי כהן (2 אנשים: אבי כהן, רותי כהן) [0501111111]')
    expect(text).toContain('❌ דנה לוי (דנה לוי) [0502222222]')
  })

  it('reflects the active search filter, so a filtered view copies a filtered report', () => {
    const s = session([
      rec({ passengerName: 'אבי כהן', pickupPoint: 'תחנה א' }),
      rec({ passengerName: 'דנה לוי', pickupPoint: 'תחנה ב' })
    ])
    const stations = groupAttendanceByStation(s, ['תחנה א', 'תחנה ב'], 'דנה')
    const text = formatAttendanceSummary('טיול', 'אוטובוס 1', s, stations, attendanceStats(s))

    expect(text).toContain('דנה לוי')
    expect(text).not.toContain('אבי כהן')
  })
})
