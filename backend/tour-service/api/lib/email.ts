import { Resend } from "resend"

const TAG = "email"

// Render's free tier blocks all outbound SMTP traffic (ports 25/465/587) as
// of Sept 2025 (https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)
// — confirmed via ETIMEDOUT on every attempt in production despite working
// locally. Resend sends over HTTPS (port 443, never blocked), so it's used
// here instead of nodemailer/Gmail SMTP.
//
// The "from" address must be on a domain verified with Resend — a plain
// gmail.com address can never be verified (Resend doesn't own that domain),
// so this uses their built-in test sender until a real domain is set up.
// Override via RESEND_FROM_ADDRESS once a verified domain exists.
const DEFAULT_FROM = "onboarding@resend.dev"

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

let resend: Resend | undefined

function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY)
  }
  return resend
}

export interface EmailAttachment {
  filename: string
  content: Buffer
  /** If set, embeds inline — reference it in the HTML as `cid:<cid>`. */
  cid?: string
}

/**
 * Best-effort email send: a failure here (missing API key, Resend rejecting
 * the send, network error) must never fail the caller's actual request (e.g.
 * a passenger's seat booking) — so this never throws. Errors are only logged.
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  attachments?: EmailAttachment[],
): Promise<void> {
  try {
    const { error } = await getResend().emails.send({
      from: process.env.RESEND_FROM_ADDRESS || DEFAULT_FROM,
      to,
      subject,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentId: a.cid,
      })),
    })
    if (error) {
      console.log(`[${TAG}] Resend rejected email to ${Array.isArray(to) ? to.join(", ") : to}`, error)
    }
  } catch (err) {
    console.log(`[${TAG}] failed to send email to ${Array.isArray(to) ? to.join(", ") : to}`, err)
  }
}
