import dns from "dns"
import nodemailer, { type Transporter } from "nodemailer"
import type Mail from "nodemailer/lib/mailer"

const TAG = "email"

// Render (and many hosts) have no outbound IPv6 route. `dns.setDefaultResultOrder`
// does NOT fix this for nodemailer: its SMTP transport (nodemailer/lib/shared)
// never calls Node's dns.lookup() — it resolves A and AAAA itself via its own
// `new dns.Resolver()` instance, concatenates both address lists, and then
// picks *one at random* to connect to (see formatDNSValue in that file). That
// random pick is exactly why sending "worked sometimes" — it succeeds whenever
// it happens to roll an IPv4 address and fails with ENETUNREACH on IPv6.
//
// There is no supported nodemailer option to disable IPv6 resolution, so this
// disables it at the source: any dns.Resolver instance's resolve6/resolveAny
// (which is what `new dns.Resolver()` uses under the hood) now always reports
// "no AAAA records", so nodemailer's own address pool only ever contains IPv4
// addresses and the random pick can no longer land on IPv6. This only affects
// IPv6 *DNS resolution* process-wide — nothing here needs IPv6 for anything.
const originalResolve6 = dns.Resolver.prototype.resolve6
dns.Resolver.prototype.resolve6 = function patchedResolve6(...args: unknown[]) {
  const callback = args[args.length - 1] as (err: NodeJS.ErrnoException | null, addresses?: string[]) => void
  const err = new Error("queryAaaa ENOTFOUND (IPv6 resolution disabled — see email.ts)") as NodeJS.ErrnoException
  err.code = "ENOTFOUND"
  callback(err)
} as typeof originalResolve6

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
