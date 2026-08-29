import type {
  AttendanceParty,
  AttendanceRecord,
  AttendanceSession,
  AttendanceStation,
  AttendanceStats
} from '../types/attendance.types'

// Pure grouping/reporting helpers for the attendance tab, extracted from the
// prototype's inline `useMemo` blocks so they can be unit-tested without
// rendering. The behaviour is deliberately identical to
// raw_from_ai_studio/src/components/AttendanceManagement.tsx — only the data
// source changed (server records instead of localStorage).

const NO_PICKUP_POINT = 'ללא נקודת איסוף מוגדרת'

/**
 * Family / booking-party key, in the prototype's priority order:
 * 1. `bookingGroupId` (an explicit shared booking)
 * 2. digits of `passengerPhone`, when it has at least 6 characters
 * 3. the passenger's name
 *
 * Tier 1 is kept even though `Seat` carries no `bookingGroupId` today — when
 * real booking-group linkage lands, grouping upgrades with no code change.
 */
export function partyKeyOf(record: AttendanceRecord): string {
  const groupId = record.bookingGroupId?.trim()
  if (groupId) return groupId
  const phone = record.passengerPhone?.trim() ?? ''
  if (phone.length >= 6) return `phone-${phone.replace(/\D/g, '')}`
  return `name-${record.passengerName.trim()}`
}

// Seat labels are strings ("3A", "12B"), so a plain string sort would put
// "12A" before "3A". Compare numerically where possible.
function compareSeatPositions(a: string, b: string): number {
  return a.localeCompare(b, 'he', { numeric: true })
}

function matchesQuery(records: AttendanceRecord[], names: string[], query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (names.some(n => n.toLowerCase().includes(q))) return true
  if (records.some(r => r.passengerPhone?.includes(q))) return true
  return records.some(r => r.notes?.toLowerCase().includes(q))
}

function toParty(pickupPoint: string, partyKey: string, records: AttendanceRecord[]): AttendanceParty {
  const sorted = [...records].sort((a, b) => compareSeatPositions(a.seatPosition, b.seatPosition))
  const primary = sorted[0]
  const passengerNames = Array.from(new Set(sorted.map(r => r.passengerName.trim())))
  const presentCount = sorted.filter(r => r.isPresent).length

  return {
    id: `${pickupPoint}-${partyKey}`,
    primaryName: primary.passengerName,
    passengerNames,
    passengerPhone: primary.passengerPhone || sorted.find(r => r.passengerPhone)?.passengerPhone,
    pickupPoint,
    notes: primary.notes || sorted.find(r => r.notes)?.notes,
    partySize: sorted.length,
    seatPositions: sorted.map(r => r.seatPosition),
    recordIds: sorted.map(r => r.id),
    records: sorted,
    // A party counts as present only when every one of its members does —
    // that's what makes the card a single toggle-all control.
    isPresent: presentCount === sorted.length,
    presentCount,
    hasUnapproved: sorted.some(r => !r.isApproved)
  }
}

/**
 * Groups a session's records by pickup point, and within each point by
 * family/party. Stations are emitted in the bus's declared pickup-point order
 * first (so the guide's list matches the route), with any unexpected point
 * appended after. Empty stations — including ones emptied by `searchQuery` —
 * are dropped.
 */
export function groupAttendanceByStation(
  session: AttendanceSession | null,
  pickupPointsOrder: string[],
  searchQuery = ''
): AttendanceStation[] {
  if (!session) return []

  const stations = new Map<string, AttendanceStation>()
  const ensure = (pickupPoint: string): AttendanceStation => {
    let station = stations.get(pickupPoint)
    if (!station) {
      station = { pickupPoint, parties: [], totalPassengers: 0, presentPassengers: 0 }
      stations.set(pickupPoint, station)
    }
    return station
  }
  pickupPointsOrder.forEach(ensure)

  const byStation = new Map<string, Map<string, AttendanceRecord[]>>()
  session.records.forEach(record => {
    const pickupPoint = record.pickupPoint?.trim() || NO_PICKUP_POINT
    let parties = byStation.get(pickupPoint)
    if (!parties) {
      parties = new Map()
      byStation.set(pickupPoint, parties)
    }
    const key = partyKeyOf(record)
    const bucket = parties.get(key)
    if (bucket) bucket.push(record)
    else parties.set(key, [record])
  })

  byStation.forEach((parties, pickupPoint) => {
    const station = ensure(pickupPoint)
    const list: AttendanceParty[] = []
    parties.forEach((records, partyKey) => {
      const party = toParty(pickupPoint, partyKey, records)
      if (!matchesQuery(party.records, party.passengerNames, searchQuery)) return
      list.push(party)
    })
    list.sort((a, b) => a.primaryName.localeCompare(b.primaryName, 'he'))
    station.parties = list
    station.totalPassengers = list.reduce((sum, g) => sum + g.partySize, 0)
    station.presentPassengers = list.reduce((sum, g) => sum + g.presentCount, 0)
  })

  return Array.from(stations.values()).filter(st => st.parties.length > 0)
}

export function attendanceStats(session: AttendanceSession | null): AttendanceStats {
  const records = session?.records ?? []
  const total = records.length
  const present = records.filter(r => r.isPresent).length
  return {
    total,
    present,
    missing: total - present,
    percent: total > 0 ? Math.round((present / total) * 100) : 0
  }
}

/**
 * WhatsApp-ready plain-text attendance report (the "copy summary" action).
 * Reflects the CURRENTLY VISIBLE stations, so a filtered search produces a
 * filtered report — same as the prototype.
 */
export function formatAttendanceSummary(
  tourTitle: string,
  busName: string,
  session: AttendanceSession,
  stations: AttendanceStation[],
  stats: AttendanceStats
): string {
  const lines = [
    `📋 דוח נוכחות - ${tourTitle} (${busName})`,
    `בדיקה: ${session.title}`,
    `נוכחים: ${stats.present} מתוך ${stats.total} נוסעים (${stats.percent}%)`,
    `חסרים: ${stats.missing}`,
    '---------------------------------------'
  ]

  stations.forEach(station => {
    lines.push(
      `\n📍 ${station.pickupPoint} (${station.presentPassengers}/${station.totalPassengers} נוסעים):`
    )
    station.parties.forEach(party => {
      const namesStr = party.passengerNames.join(', ')
      const sizeStr =
        party.partySize > 1 ? `(${party.partySize} אנשים: ${namesStr})` : `(${namesStr})`
      const phoneStr = party.passengerPhone ? ` [${party.passengerPhone}]` : ''
      const unapprovedStr = party.hasUnapproved ? ' ⚠️ לא מאושר' : ''
      lines.push(` ${party.isPresent ? '✅' : '❌'} ${party.primaryName} ${sizeStr}${phoneStr}${unapprovedStr}`)
    })
  })

  return lines.join('\n')
}
