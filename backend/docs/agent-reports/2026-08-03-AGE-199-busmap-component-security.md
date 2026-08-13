=== SECURITY AGENT REPORT ===

Ticket: AGE-199 (BusMap component)
Date: 2026-08-03
Auditor: Security Agent
Scope audited: frontend/ (BusMap + seat/auth services), backend/tour-service,
backend/user-management-service, both API contracts.

## Summary
CRITICAL: 0   HIGH: 1   MEDIUM: 2   LOW: 2   PASS: many (see checklist)

Overall: **BLOCKED** — one HIGH finding (passenger PII exposed to
unauthenticated callers, which is exactly the endpoint the passenger BusMap
view consumes) plus high/critical dependency vulnerabilities in the frontend
and user-management-service.

The seat-state machine itself is solid: enum-constrained status, atomic
condition-checked transitions, and a real one-success/one-conflict result under
concurrency. The BusMap component is purely presentational and never trusts a
client-computed status. The HIGH finding is about *what the server sends to the
public*, not about client trust.

---

## Findings

### [SEV-001] HIGH — Passenger PII (name + phone) exposed on the public bus endpoint
Location: backend/tour-service/api/bus/bus.service.ts:60-66 (`getBusWithSeats`),
exposed via backend/tour-service/api/bus/bus.routes.ts:10
(`GET /tour/:tourId/buses/:busId` — no `requireAdmin`).
Issue: The passenger seat map (BusMap, non-admin mode) is fed from this
unauthenticated endpoint. It returns the raw `Seat` documents via
`Seat.find({ busId }).lean()`, including `passengerName` and `passengerPhone`
for every pending/taken seat. Any anonymous user who can reach the booking page
can enumerate every passenger's full name and phone number for a tour/bus.
Frontend confirmation: `frontend/src/components/bus/BusMap.tsx:106-108` renders
`seat.passengerName` inside passenger-mode tooltips, so the client already
consumes this leaked field.
Expected: For unauthenticated callers, seat objects should expose only what the
passenger view needs — `position`/seat number, `status`, and layout metadata —
never `passengerName`/`passengerPhone`/`pickupPointName`. Full occupant details
should be admin-only (as the `manifest` route already is).
Actual: `passengerPhone` and `passengerName` are returned verbatim to any
unauthenticated GET.
Fix: In `getBusWithSeats`, project out passenger PII on the public path (e.g.
`.select('-passengerName -passengerPhone -pickupPointName')`, or map to a
sanitized DTO). Serve full occupant data only through an admin-guarded endpoint.
Also drop `passengerName` from the passenger-mode tooltip in BusMap.
Test: documented in `docs/tests/security/seat.security.test.ts`
("Data exposure - public bus-with-seats endpoint (SEV-001)"): the assertion
PASSES while the PII is present; flip to `.toBeNull()` after the fix.

### [SEV-002] MEDIUM — CORS falls back to reflecting any origin (tour-service)
Location: backend/tour-service/api/app.ts:15
Issue: `app.use(cors({ origin: process.env.FRONTEND_URL || true }))`. When
`FRONTEND_URL` is unset, `origin: true` reflects the caller's `Origin` header,
effectively allowing every site to make cross-origin requests to the seat/tour
API. (user-management-service does this correctly: it defaults to an explicit
`http://localhost:5173`.)
Expected: CORS restricted to `process.env.FRONTEND_URL`; fail closed if unset.
Actual: Any origin is reflected when the env var is missing.
Fix: `cors({ origin: process.env.FRONTEND_URL })` (or a fixed default), not
`|| true`.

### [SEV-003] MEDIUM — Auth inputs not type-checked → NoSQL operator injection surface
Location: backend/user-management-service/api/api/auth/auth.service.ts:31,48
Issue: `email`/`password` from `req.body` are passed straight into
`Admin.findOne({ $or: [{ email }, { username }] })` and `Admin.findOne({ email })`
without asserting they are strings. A body like
`{"email":{"$gt":""},"password":{"$ne":null}}` injects Mongo operators. Full auth
bypass is prevented by the subsequent `bcrypt.compare` (a non-string password
fails), but operator objects still enable account enumeration / unexpected query
behavior, and `signup` may throw a 500 instead of a clean 400.
Expected: Reject non-string `email`/`password` with 400 before querying Mongo.
Actual: Operator objects reach the query layer.
Fix: Validate `typeof email === 'string' && typeof password === 'string'` (and a
basic email shape) at the top of `signup`/`login`.

### [SEV-004] LOW — Frontend does not clear auth on 401
Location: frontend/src/services/http.service.ts:16-19
Issue: The 401 response interceptor is a `// TODO` no-op. On an expired/revoked
token the app keeps the stale token in `localStorage`/Preferences and in the
Zustand store instead of clearing it and redirecting to login.
Expected (per checklist): token cleared from storage and store on 401.
Actual: Not implemented.
Fix: In the interceptor, call the auth-slice `clearAuth()` + `utilService.removeItem`
on 401.

### [SEV-005] LOW — Admin occupied↔occupied swap is a non-atomic read-then-write
Location: backend/tour-service/api/seat/seat.service.ts:254-274 (`swapMove`)
Issue: The move path (`to.status === 'available'`) is protected by a
condition-checked `findOneAndUpdate`, but the swap path (both seats occupied)
re-reads with `findOne` and then writes both seats with unconditional
`findOneAndUpdate({ _id, busId })`. Between the read and the writes a concurrent
admin/cancel could change a seat, and the swap would overwrite it. Exploitability
is low (admin-only, no self-service), so LOW rather than CRITICAL, but it is the
one seat transition that is not atomic/condition-guarded.
Expected: Each write re-asserts the expected current status in its filter.
Actual: Swap writes match on `{ _id, busId }` only.
Fix: Include the expected `status` (and ideally an `updatedAt`/version guard) in
each swap `findOneAndUpdate` filter and 409 on mismatch.

---

## Checklist Results

### Backend — tour-service
- [PASS] JWT `requireAdmin` on approve/cancel/toggle-reserve/manual-assign/swap-move (seat.routes.ts:14-18)
- [PASS] JWT `requireAdmin` on tour/bus create/update/delete (tour.routes.ts, bus.routes.ts)
- [PASS] Passenger `seats/bookings` intentionally public; no other seat route left public
- [PASS] `seatStatus` never accepted from client — booking forces `status: "pending"`; enum-constrained in seat.model.ts:23-28 (verified by test)
- [PASS] available→pending and available→taken use atomic `findOneAndUpdate({_id,busId,status:'available'})` (seat.service.ts:38,174)
- [PASS] Concurrency: two simultaneous same-seat bookings → exactly one 200 + one 409 (logic verified; test present)
- [PASS] manual-assign/swap-move re-validate server-side status (move path atomic)
- [FAIL] Swap of two occupied seats is not atomic — see SEV-005 (LOW)
- [PASS] JWT secret from `process.env.JWT_SECRET`, never hardcoded; missing-secret → 500 (auth.middleware.ts:21)
- [PASS] alg:none rejected (jsonwebtoken default; verified by in-package auth test)
- [PASS] Soft delete: list/get/update filter `{ deletedAt: null }` (tour/bus services)
- [FAIL] CORS reflects any origin when FRONTEND_URL unset — see SEV-002 (MEDIUM)
- [FAIL] Public seat exposure leaks passenger PII — see SEV-001 (HIGH). (Admin `manifest` route is correctly protected.)

### Backend — user-management-service
- [PASS] `passwordHash` never returned (auth returns bare JWT string; verified by test)
- [PASS] `passwordHash` excluded from serialization paths
- [PASS] Passwords bcrypt-hashed, 10 rounds (auth.service.ts:5,36)
- [PASS] Wrong password → 401 not 500 (verified by test)
- [PASS] Soft-deleted admin cannot authenticate (admin.model.ts pre-find filter `deletedAt: null`)
- [PASS] JWT expiry set/enforced (`JWT_EXPIRES_IN` default 7d; expired token → 401, verified)
- [PASS] CORS restricted to FRONTEND_URL with explicit default
- [FAIL] Auth inputs not type-validated (NoSQL operator injection surface) — see SEV-003 (MEDIUM)

### Frontend
- [PASS] No `dangerouslySetInnerHTML`; all user strings rendered via React (BusMap uses text nodes only)
- [PASS] No `eval`/`Function` with external data
- [PASS] Token attached/stored only via services (auth.service.ts + util.service.ts); localStorage on web, @capacitor/preferences on native
- [PASS] Token not embedded in any URL
- [PASS] No token/secret in `console.log`
- [PASS] API base URLs from `VITE_*` env vars, no hardcoded URLs (http.service.ts:26-27)
- [PASS] BusMap is presentational; seat map reflects the server response, never a client-computed status
- [FAIL] 401 handling is a TODO — token not cleared on 401 — see SEV-004 (LOW)
- [OBSERVATION] http.service.ts has no request interceptor attaching the admin `Authorization` header; admin seat mutations would currently send no token. Functional gap (not a vuln) — flagged for the frontend/backend owners.

### Secrets & Environment
- [PASS] No `.env.development`/`.env` tracked in git (only `*.env.example` present); `.gitignore` covers env files
- [PASS] No hardcoded secrets in source (test-only secret lives in `__tests__/helpers.ts`)

---

## Security Tests
Location: `docs/tests/security/auth.security.test.ts`, `docs/tests/security/seat.security.test.ts`.

Monorepo execution note: these repo-root files sit outside each package's vitest
`root`, so `npx vitest run` from a package excludes them via its default include
glob (`No test files found`). The equivalent code paths are exercised by the
in-package suites, which were executed and ALL PASS:
- backend/tour-service (`api/__tests__/tour-service.test.ts`): 16 passed / 16
  — seat lifecycle, atomic booking, admin-auth 401s, soft-delete exclusion.
- backend/user-management-service (`api/api/auth/auth.test.ts`): 10 passed / 10
  — 401 without token, wrong-password→401, passwordHash-never-leaked.

auth.security.test.ts:  no-token / expired / tampered / alg:none / injection / passwordHash cases present
seat.security.test.ts:  admin-auth 401s, client-status-ignored, one-success/one-409 concurrency, soft-delete, SEV-001 PII documentation

## Dependency Audit  (npm audit --audit-level=high)
frontend:                    4 high, 2 critical   (via @capacitor/cli → tar; plus vite/esbuild dev chain)
user-management-service:     3 high, 2 critical   (critical: bcrypt → @mapbox/node-pre-gyp → tar; high: vite/esbuild/vitest dev chain)
tour-service:                0 high, 0 critical

Note: most are dev-tooling (vite/esbuild/vitest) and the Capacitor CLI; the one
production-path critical is `tar` reached through `bcrypt`
(@mapbox/node-pre-gyp). Pre-existing baseline issues, not introduced by AGE-199,
but they count against the release gate.

---

## Verdict
STATUS: BLOCKED

Blocking items:
1. SEV-001 (HIGH) — strip passenger PII from the public bus-with-seats endpoint
   and from the passenger-mode BusMap tooltip.  Owner: backend + frontend.
2. Dependency high/critical vulnerabilities in frontend and
   user-management-service (notably bcrypt→tar).  Owner: backend/frontend deps.

Recommended (non-blocking) fixes before next review: SEV-002 (CORS), SEV-003
(auth input typing), SEV-004 (401 handling), SEV-005 (atomic swap).

Re-trigger the Security Agent after SEV-001 and the dependency criticals are
addressed.
