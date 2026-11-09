import { createPortal } from 'react-dom'
import type {
  AttendanceSession,
  AttendanceStation,
  AttendanceStats
} from '../types/attendance.types'

interface AttendancePrintSheetProps {
  tourTitle: string
  tourDate: string
  busName: string
  session: AttendanceSession
  stations: AttendanceStation[]
  stats: AttendanceStats
}

const cellClass = 'border border-slate-400 px-1.5 py-1'

// Paper version of the attendance board (AttendanceManagement.tsx "הדפס").
// Portaled straight under <body> so the print rules in main.css can drop the
// whole app with `display: none` — the interactive board is a card grid that
// paginates badly, while this is a plain table per station the guide can tick
// by hand at the bus door. Hidden on screen; only rendered while the tab is.
export function AttendancePrintSheet({
  tourTitle,
  tourDate,
  busName,
  session,
  stations,
  stats
}: AttendancePrintSheetProps) {
  return createPortal(
    <div id="printable-attendance" className="hidden print:block text-slate-900" dir="rtl">
      <header className="mb-4 pb-2 border-b-2 border-slate-900">
        <h1 className="text-xl font-black">בדיקת נוכחות - {busName}</h1>
        <p className="text-sm">
          {tourTitle} ({new Date(tourDate).toLocaleDateString('he-IL')}) · {session.title}
        </p>
        <p className="text-xs mt-1">
          {`נוכחים: ${stats.present} / ${stats.total} (${stats.percent}%) · הודפס: `}
          {new Date().toLocaleString('he-IL', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
      </header>

      {stations.map((station) => (
        <section key={station.pickupPoint} className="mb-4">
          <h2 className="text-sm font-black mb-1 break-after-avoid">
            {`${station.pickupPoint} (${station.presentPassengers}/${station.totalPassengers} נוסעים)`}
          </h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className={`${cellClass} w-8`}>✓</th>
                <th className={`${cellClass} text-start`}>שם</th>
                <th className={`${cellClass} text-start`}>מושבים</th>
                <th className={`${cellClass} w-12`}>אנשים</th>
                <th className={`${cellClass} text-start`}>טלפון</th>
              </tr>
            </thead>
            <tbody>
              {station.parties.map((party) => (
                <tr key={party.id} className="break-inside-avoid">
                  <td className={`${cellClass} text-center font-black`}>
                    {party.isPresent ? '✓' : ''}
                  </td>
                  <td className={`${cellClass} font-bold`}>{party.passengerNames.join(', ')}</td>
                  <td className={`${cellClass} font-mono`}>{party.seatPositions.join(', ')}</td>
                  <td className={`${cellClass} text-center`}>{party.partySize}</td>
                  <td className={`${cellClass} font-mono`} dir="ltr">
                    {party.passengerPhone ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>,
    document.body
  )
}
