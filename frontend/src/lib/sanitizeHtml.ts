import DOMPurify from 'dompurify'

// Admin-authored free text (tour description, etc.) rendered on the
// public-facing passenger pages. Admins are trusted, but this is still
// rendered via `dangerouslySetInnerHTML` for every passenger, so it's
// sanitized against a tight allowlist rather than trusted outright — no
// attributes at all (blocks `onerror=`, `style=`, `href=` phishing, etc.),
// just enough tags for basic rich text (bold/italic/line breaks/lists).
const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'ul', 'ol', 'li']

export function sanitizeDescriptionHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [] })
}
