# Security Report — AGE-244: Admin Dashboard page

- Ticket: https://linear.app/agents-example/issue/AGE-244/sec-admin-dashboard-page
- Plan: `.plan/021-2026-08-07-admin-dashboard-page.md`
- Scope: `frontend/src/pages/AdminDashboardPage.tsx` and everything it depends
  on for auth/authorization — `tour-service` (tour/bus/seat/manifest routes),
  `user-management-service` (admin auth), and the two API contracts.
- Tests added:
  - `docs/tests/security/age244-admin-dashboard.security.test.ts` (+ `vitest.age244-admin-dashboard.config.ts`) — tour-service
  - `docs/tests/security/age244-signup-open.security.test.ts` (+ `vitest.age244-signup-open.config.ts`) — user-management-service
  - Both run green today (16/16); several tests are *documentation* tests for
    findings below and are annotated accordingly (they should be flipped to
    assert the fixed behavior once remediated).

## Summary

The `AdminDashboardPage` container itself has no auth logic — it correctly
delegates all authorization to (a) the client-side `ProtectedRoute` guard and
(b) the `tour-service` admin routes it calls. Verified: every tour/bus CRUD
route and every seat admin action (approve/cancel/toggle-reserve/manual-assign)
the dashboard's child components invoke is `requireAdmin`-guarded, rejects
missing/tampered/`alg:none`/wrong-secret tokens, resists NoSQL-operator
injection in path params, ignores client-supplied trust fields on
create/update (no mass assignment), and scopes buses to their parent tour
(no cross-tour IDOR). The tour-delete cascade correctly removes seat PII
along with soft-deleted buses.

However, the *value* of that server-side enforcement is undermined by the
account-creation surface it trusts: **`user-management-service`'s
`POST /auth/signup` is completely open** — no invite code, no
existing-admin approval, no email verification, and no rate limiting. Anyone
who can reach that endpoint can mint a fully valid admin JWT and get
everything the Admin Dashboard offers: create/edit/delete tours and buses,
approve/cancel bookings, manually assign seats, and view the passenger
manifest (PII: name + phone). This is the standout finding for this ticket,
since it's the actual gate standing between "internet stranger" and
"full admin dashboard access."

Separately, a wiring gap was found on the frontend: the shared Axios clients
(`frontend/src/services/http.service.ts`) never attach an `Authorization`
header to any outgoing request. `authToken` is stored in the Zustand store
and in `localStorage` (`hila_admin_token`) but nothing reads it back onto
requests. As built today this means every admin mutation the dashboard issues
(tour/bus save & delete, seat approve/cancel/etc.) will be rejected with 401
by the (correctly-enforcing) backend — i.e. the feature is currently
non-functional for its intended admin user, not exploitable by an attacker.
Flagging it here because (a) it's adjacent to the auth surface this ticket
is meant to audit and (b) a rushed fix (e.g. a global `axios.defaults.headers`
assignment, or `withCredentials` cookie forwarding to the wrong origin) could
easily reintroduce a real vulnerability — the fix should be a scoped Axios
request interceptor that reads `useStore.getState().authToken` per request.

## Findings

### AGE-244-SEV-001 — CRITICAL — Unrestricted admin self-registration (`POST /auth/signup`)
- **Where:** `backend/user-management-service/api/api/auth/auth.controller.ts`,
  `auth.service.ts::signup`; contract:
  `docs/api-contract/api-contract.user-management-service.yaml` (`/auth/signup`
  has no `security` block, by design per the contract).
- **Issue:** The endpoint requires only `email` + `password` (any values) and
  returns a fully valid, long-lived (7d) admin JWT. There is no invite code,
  admin-approval workflow, email verification, domain allowlist, or rate
  limit. Every admin-gated route in both services (`requireAdmin`) trusts any
  token signed with the shared `JWT_SECRET`, so self-registration is
  equivalent to a full admin account.
- **Impact:** Full, unauthenticated takeover of the Admin Dashboard's
  capabilities: create/rename/delete tours and buses (including cascading
  deletes), approve/cancel/manually-assign passenger seats, and read the
  passenger manifest (name + phone PII) for every tour.
- **Evidence:** `age244-signup-open.security.test.ts` — anonymous signup
  succeeds (200) and immediately logs in; a bogus/absent invite field has no
  effect; `age244-admin-dashboard.security.test.ts` shows a UMS-shaped token
  is sufficient to create/update/delete tours end-to-end via tour-service.
- **Recommendation:** Gate `/auth/signup` behind one of: (a) disable public
  signup entirely and seed/manage admin accounts out-of-band, (b) require a
  server-held invite code / admin-approval step before the account is usable,
  or (c) require verified-email + manual promotion to "admin" role (i.e. stop
  treating "has an Admin document" as sufficient for `requireAdmin`). Add
  rate limiting regardless of which option is chosen.

### AGE-244-SEV-002 — LOW — No password strength policy on signup
- **Where:** `auth.service.ts::signup` — only checks `email && password` truthiness.
- **Issue:** A one-character password is accepted.
- **Evidence:** `age244-signup-open.security.test.ts` ("accepts a
  single-character password").
- **Recommendation:** Enforce a minimum length/complexity policy server-side
  (client-side validation alone is not a control).

### AGE-244-SEV-003 — LOW — No login throttling / lockout
- **Where:** `POST /auth/login` (`auth.controller.ts` / `auth.service.ts`).
- **Issue:** Ten consecutive wrong-password attempts against the same account
  all return a plain 401 with no backoff, lockout, or 429.
- **Evidence:** `age244-signup-open.security.test.ts` ("10 consecutive
  wrong-password attempts...").
- **Recommendation:** Add per-account/per-IP rate limiting (e.g.
  `express-rate-limit` in front of `/auth/login`, or an account lockout after
  N failures) — becomes more urgent once SEV-001 is fixed and signup is no
  longer the trivial path to an account.
- **Note:** This compounds SEV-001 today — since anyone can also just sign up
  a fresh account, brute-forcing an existing one is a secondary concern until
  SEV-001 is closed.

### AGE-244-SEV-004 — MEDIUM (wiring gap, not currently exploitable) — Frontend never sends the admin JWT
- **Where:** `frontend/src/services/http.service.ts` (`createClient`) —
  no request interceptor attaches `Authorization: Bearer <token>`;
  `frontend/src/services/auth.service.ts` stores the token in
  `localStorage`/Zustand but nothing reads it back onto outgoing requests.
- **Issue:** As implemented, `AdminDashboardPage`'s tour/bus save/delete calls
  and the seat-management admin actions will always be sent without a
  bearer token, so the correctly-enforcing backend will reject them (401).
  This is primarily a functional bug today, but it's the exact seam where a
  quick, unreviewed fix could introduce a real vulnerability (e.g. attaching
  the token globally to *every* client including ones that shouldn't see it,
  or switching to cookie-based auth without `httpOnly`/`SameSite` review).
- **Recommendation:** Add a single Axios request interceptor on
  `tourClient`/`userManagementClient` that reads `useStore.getState().authToken`
  and sets the `Authorization` header only for that client — keep it in
  `http.service.ts` so it's one reviewable change, and add a frontend test
  asserting the header is present on an authenticated call and absent when
  logged out. Also implement the existing `// TODO: session-expiry handling`
  in the 401 response interceptor (currently a no-op) so an expired/invalid
  token clears auth state and redirects to `/login` instead of silently
  failing each request.

### Informational — JWT storage & lifetime
- Admin JWTs are stored in `localStorage` (`hila_admin_token`) rather than an
  `httpOnly` cookie, and are valid for 7 days by default
  (`JWT_EXPIRES_IN`) with no refresh/revocation mechanism (logout only clears
  a cookie that is never actually set by this flow — the token itself remains
  valid until expiry if captured). This is a standard SPA trade-off, but it
  does mean any XSS elsewhere in the app has a 7-day blast radius on the
  admin session. No `dangerouslySetInnerHTML` usage was found in the audited
  components, which limits current XSS exposure, but this is worth revisiting
  if the token/account model changes as part of SEV-001's remediation.
- `requireAdmin` in `tour-service` returns `500` with the message "JWT secret
  not configured" if `JWT_SECRET` is unset, which is a minor
  misconfiguration-disclosure (reveals server config state) rather than an
  exploitable issue — acceptable for now but worth a generic message if this
  code path is ever hit in production monitoring.

## What was verified as sound

- Every tour/bus mutation route (`tour.routes.ts`, `bus.routes.ts`) and every
  seat admin action (`seat.routes.ts`) requires `requireAdmin`; the manifest
  endpoint (`manifest.routes.ts`) is also `requireAdmin`-guarded.
- `requireAdmin`/`requireAuth` reject missing tokens, tampered signatures,
  `alg: none` tokens, and tokens signed with the wrong secret (401 in all
  cases — no path reaches the DB layer with untrusted claims).
- Tour/bus `create`/`update` allowlist fields explicitly (no mass assignment
  of `_id`, `createdBy`, `deletedAt`, `tourId`, etc.).
- Bus routes are scoped to their parent tour (`{ _id: busId, tourId, ... }`)
  — a bus cannot be fetched, updated, or deleted through a foreign tour's URL
  (no IDOR).
- All Mongo id path params are validated with `Types.ObjectId.isValid(...)`
  before querying — operator-injection payloads (`{"$ne":null}`, etc.) in
  `:tourId`/`:busId` are rejected as invalid ids rather than reaching the
  driver.
- Seat lifecycle mutations (`approve`, `cancel`, `toggle-reserve`,
  `manual-assign`, `swap-move`) are condition-checked atomic updates
  (`findOneAndUpdate` with a status guard), matching the concurrency-safety
  goals in `.rule/database-rules.md`.
- Tour delete cascades to soft-delete buses and hard-delete their seats — no
  orphaned passenger PII is left reachable after a delete.
- CORS on both services is a fixed allowlist from `FRONTEND_URL` (no origin
  reflection).
- Signup/login never leak `passwordHash`; passwords are hashed with bcrypt
  (10 rounds); login returns a generic 401 for both "unknown email" and
  "wrong password" (no user-enumeration via status code); `forgot-password`
  always responds success without revealing account existence.
- No `dangerouslySetInnerHTML`/unsafe HTML sinks found in the audited
  frontend components; no CSV/manifest export path exists yet, so no
  CSV-injection surface currently.

## Pre-existing, out-of-scope findings observed in passing

These were not introduced by this ticket and are already tracked/documented
elsewhere in the repo's security suite — noted here only for completeness:
- `docs/tests/security/seat.security.test.ts` / `backend/docs/tests/security/seat.security.test.ts`
  document that the unauthenticated `GET /tour/:tourId/buses/:busId` endpoint
  (used by the public passenger view) returns passenger PII
  (`passengerName`/`passengerPhone`) to anonymous callers (SEV-001 in that
  suite). This endpoint is also used by the admin dashboard's `SeatManagement`
  tab but the underlying exposure is a pre-existing, separately-tracked issue.
- `docs/tests/security/age234-tourmanagement.security.test.ts` documents a
  currently-failing regression guard for unbounded `seatLayout` input on bus
  create (authenticated DoS surface) — unrelated to this page's scope but
  worth keeping on the backlog.

## Recommendation priority

1. **SEV-001 (critical):** close open admin self-registration before this
   feature reaches anything but a fully trusted/internal environment.
2. **SEV-004 (medium):** wire the `Authorization` header through the frontend
   Axios clients so the (correct) server-side enforcement can actually be
   exercised by legitimate admins, and implement the pending 401
   session-expiry handling.
3. **SEV-002/SEV-003 (low):** add a password policy and login throttling —
   more impactful once SEV-001 is closed and account creation is no longer
   trivial.
