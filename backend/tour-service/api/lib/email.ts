import { setDefaultResultOrder } from "dns"
import nodemailer, { type Transporter } from "nodemailer"
import type Mail from "nodemailer/lib/mailer"

const TAG = "email"

// Render (and many hosts) have no outbound IPv6 route, but Node's DNS can
// still resolve smtp.gmail.com to an IPv6 address first on some platforms —
// connecting to it then fails with ENETUNREACH. This reorders the process's
// default DNS resolution to try IPv4 first (Node 18+), which nodemailer's
// SMTP transport has no dedicated option to control directly.
setDefaultResultOrder("ipv4first")

// Comma-separated list in the BOOKING_NOTIFICATION_RECIPIENTS env var, e.g.
// "hilab2013@gmail.com,adirahav76@gmail.com". Read live (not cached at
// import time) so a Render env change takes effect on the next booking
// without a redeploy.
export function getBookingNotificationRecipients(): string[] {
  return (process.env.BOOKING_NOTIFICATION_RECIPIENTS || "")
    .split(",")
    .map((addr) => addr.trim())
    .filter(Boolean)
}

let transporter: Transporter | undefined

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_ADDRESS,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }
  return transporter
}

/**
 * Best-effort email send: a failure here (missing credentials, Gmail
 * rejecting the send, network error) must never fail the caller's actual
 * request (e.g. a passenger's seat booking) — so this never throws. Errors
 * are only logged.
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  attachments?: Mail.Attachment[],
): Promise<void> {
  const from = process.env.EMAIL_ADDRESS
  try {
    await getTransporter().sendMail({ from, to, subject, html, attachments })
  } catch (err) {
    console.log(`[${TAG}] failed to send email to ${Array.isArray(to) ? to.join(", ") : to}`, err)
  }
}
