import { Bus } from "../models/bus.model"
import { Tour } from "../models/tour.model"
import { Seat } from "../models/seat.model"
import { sendEmail, getBookingNotificationRecipients } from "../lib/email"
import { renderSeatMapPng } from "../lib/seatMapImage"

interface BookedSeat {
  id: string
  position?: string
}

// Every value interpolated into the email HTML below is either passenger-
// supplied (name, phone, pickup point, notes) or admin-supplied (tour/bus
// name) — none of it is trusted. Escape before interpolation so a passenger
// typing "<script>" or similar into their name/notes can't inject markup
// into the recipients' email client.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Notifies BOOKING_NOTIFICATION_RECIPIENTS (env-configured) whenever a passenger requests seats,
 * with one-click Approve/Reject links back into the admin app. Best-effort:
 * called fire-and-forget from the bookings controller, never awaited in a
 * way that could delay or fail the passenger's own booking response.
 */
export async function sendBookingNotification(
  tourUuid: string,
  busUuid: string,
  seats: BookedSeat[],
  passenger: { name: string; phone?: string | null; pickupPointName?: string | null; notes?: string | null },
): Promise<void> {
  const [tour, bus] = await Promise.all([
    Tour.findOne({ uuid: tourUuid }).select("name").lean(),
    Bus.findOne({ uuid: busUuid }).select("name").lean(),
  ])
  if (!tour || !bus) return // shouldn't happen — the booking itself already resolved both

  const tourName = (tour as any).name as string
  const busName = (bus as any).name as string
  const seatIdsParam = seats.map((s) => s.id).join(",")
  const seatPositions = seats.map((s) => s.position ?? s.id).join(", ")

  // Best-effort visual snapshot of the seat map with the requested seats
  // highlighted — a rendering failure must not block the email itself.
  const totalSeats = await Seat.countDocuments({ busId: (bus as any)._id })
  const highlightNumbers = seats
    .map((s) => Number(s.position))
    .filter((n) => Number.isInteger(n))
  const seatMapPng =
    totalSeats > 0 && highlightNumbers.length > 0
      ? await renderSeatMapPng(totalSeats, highlightNumbers).catch((err) => {
          console.log("[bookingNotification] seat map image render failed", err)
          return null
        })
      : null

  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "")
  const linkBase = `${frontendUrl}/admin/seat-action?tourId=${encodeURIComponent(tourUuid)}&busId=${encodeURIComponent(busUuid)}&seatIds=${encodeURIComponent(seatIdsParam)}`
  const approveUrl = `${linkBase}&action=approve`
  const rejectUrl = `${linkBase}&action=cancel`

  const safeName = escapeHtml(passenger.name)
  const safePhone = passenger.phone ? escapeHtml(passenger.phone) : "—"
  const safePickup = passenger.pickupPointName ? escapeHtml(passenger.pickupPointName) : "—"
  const safeNotes = passenger.notes && passenger.notes.trim() ? escapeHtml(passenger.notes.trim()) : null
  const safeTourName = escapeHtml(tourName)
  const safeBusName = escapeHtml(busName)

  const subject = `${passenger.name} בחרה מושבים לטיול ${tourName}`
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b;">
      <h2 style="margin-bottom: 4px;">${safeName} בחרה מושבים לטיול ${safeTourName}</h2>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">טיול:</td><td><strong>${safeTourName}</strong></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">אוטובוס:</td><td><strong>${safeBusName}</strong></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">שם נוסע:</td><td><strong>${safeName}</strong></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">טלפון:</td><td><strong>${safePhone}</strong></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">נקודת איסוף:</td><td><strong>${safePickup}</strong></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">מושבים שנבחרו:</td><td><strong>${seatPositions}</strong></td></tr>
        ${safeNotes ? `<tr><td style="padding: 4px 12px 4px 0; color: #64748b;">הערות:</td><td><strong>${safeNotes}</strong></td></tr>` : ""}
      </table>
      ${seatMapPng ? '<img src="cid:seatmap" alt="מפת מושבים" style="max-width: 100%; border: 1px solid #e2e8f0; border-radius: 12px;" />' : ""}
      <div style="margin-top: 20px;">
        <a href="${approveUrl}" style="display:inline-block; background:#059669; color:#ffffff; text-decoration:none; font-weight:bold; padding:10px 20px; border-radius:8px; margin-inline-end:10px;">אישור</a>
        <a href="${rejectUrl}" style="display:inline-block; background:#dc2626; color:#ffffff; text-decoration:none; font-weight:bold; padding:10px 20px; border-radius:8px;">דחייה</a>
      </div>
      <p style="color:#94a3b8; font-size:12px; margin-top:20px;">אם עדיין לא מחוברים למערכת הניהול, תתבקשו להתחבר לפני ביצוע הפעולה.</p>
    </div>
  `

  const recipients = getBookingNotificationRecipients()
  if (recipients.length === 0) return // BOOKING_NOTIFICATION_RECIPIENTS not configured — nothing to send

  await sendEmail(
    recipients,
    subject,
    html,
    seatMapPng ? [{ filename: "seat-map.png", content: seatMapPng, cid: "seatmap" }] : undefined,
  )
}
