# Error Handling Rules

## Purpose
- Define consistent patterns for detecting, classifying, logging, and displaying errors in the Hila Tours frontend.

## Core Principles
- Fail fast on invalid input (validate before calling the API).
- Show safe, actionable messages to the user — never raw API/error payloads.
- Keep internal details (stack traces, raw response bodies) in logs, not in the UI.

## Error Categories
- Validation errors — **displayed inline (red text under the field), never via `sonner`**
  - Input is missing, malformed, or out of allowed range (caught client-side before the API call) — e.g. no pickup point selected, no seat selected.
- API/response errors — **displayed via `sonner`**
  - The API returns a non-2xx status or an error payload from `user-management-service` or `tour-service`.
- Network/infrastructure errors — **displayed via `sonner`**
  - Request timeout, offline, DNS/connection failure.
- Authorization and authentication errors — **displayed via `sonner`** (except the 401 global-redirect flow, which doesn't need a toast at all — see below)
  - Missing/expired admin token, 401/403 from an admin-only route (`tour`, `bus` writes; `seat` approve/cancel/reserve/manual-assign/swap-move).
- Seat-conflict errors (domain-specific) — **displayed via `sonner`**
  - A passenger's booking request or an admin's manual-assign/swap-move targets a seat that is no longer `available` (e.g. someone else's request was just approved, or the seat was just set to `reserved`). Treat this as a distinct, expected case — not a generic API error — since it happens in normal concurrent use.

## Consuming API Errors
- Never surface the raw `error.message`/status body from the API directly to the user; map it to a clear, hardcoded Hebrew message (no remote-config/phrase layer exists in this app — see `.rule/ui-component-layer` skill).
- Treat `401` as session expiry, not a generic error — handled globally (see below), not per-call. Remember: this only applies to admin sessions, since passengers currently have no auth token.
- Treat a seat-conflict response (e.g. `409`) as its own case: show a clear "this seat was just taken — pick another" message and refresh the seat map, rather than a generic error toast.
- Never log or display secrets, tokens, or raw provider payloads.

## Frontend and UX Rules
- Never let raw errors reach the UI; always catch at the call site (page/hook) and translate to a clear, hardcoded Hebrew message — no `getPhrase`/remote-phrase layer exists in this app (see `ui-component-layer` skill).
- Use sonner (toast.success(...) / toast.error(...), imported from 'sonner') for submit-level success/failure feedback. A single <Toaster /> is mounted once at the app root (src/layouts/AppLayout.tsx) — do not render additional Toaster instances per page.
- **Client-side validation errors never use `sonner`.** Show them as red inline text directly beneath the relevant field (e.g. `<p className="text-danger text-sm mt-1">יש לבחור מושב</p>`), driven by local `useState` field-level `error` state — never a toast for a validation failure the client itself caught before calling the API.
- **`sonner` is reserved for server/API outcomes only** — anything that required a network round-trip to know: API/response errors, network/infrastructure errors, auth errors, and seat-conflict (`409`) errors. If the client can determine the problem without calling the server (missing required field, invalid format, no seat selected), it's a validation error and must render inline, not as a toast.
- Wrap async operations in the standard pattern: setIsLoading(true) → try { await service.call(); toast.success('הפעולה בוצעה בהצלחה') } catch { toast.error('משהו השתבש, נסה שוב') } finally { setIsLoading(false) } — replace the example strings with the specific, hardcoded Hebrew message for that action. This pattern is for the server-error path only; run client-side validation *before* this block and short-circuit with the inline red-text error if it fails, without ever entering the try/catch.
- For seat-map actions specifically (request, approve, cancel, toggle-reserve, manual-assign, swap-move), re-fetch or re-sync the affected bus's seat map after both success and seat-conflict failure, so the UI never shows a stale seat state.
- Do not add local try/catch in service functions unless the failure must be handled differently there (e.g. a local retry flow). By default let errors propagate from services to the calling page/hook.
- Log all caught errors with a tagged `console.log('[TAG] message')` (e.g. `[LOGIN]`, `[BOOKING]`, `[SEAT]`, `[API]`) so they're captured by `frontend/src/utils/logger.ts`. Never log raw tokens, passwords, or full response bodies.
- `http.service.ts` already handles admin session expiry globally (401 → save pending action, clear auth state, redirect to `/login`). Do not duplicate 401 handling in individual services or pages.
- There is currently no global React error boundary — an uncaught render-time error will produce a blank/broken screen. Treat this as a known gap; if adding new top-level routes/pages, consider whether they need local safeguards until a boundary is introduced.

## Open Questions / TBD
- Confirm the actual HTTP status `tour-service` returns for a seat-conflict (`409` assumed above) so the frontend can branch on it correctly.