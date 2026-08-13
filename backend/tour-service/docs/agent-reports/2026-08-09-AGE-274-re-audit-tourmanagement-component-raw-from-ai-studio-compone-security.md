# Security Report — AGE-274: Re-audit TourManagement component

- Linear: https://linear.app/agents-example/issue/AGE-274/sec-re-audit-tourmanagement-component-raw-from-ai
- Plan: `.plan/027-2026-08-09-re-audit-tourmanagement-component-raw-from-ai-studio-compone.md`
- Scope: `frontend/src/components/TourManagement.tsx`, `frontend/src/pages/AdminDashboardPage.tsx`,
  `backend/tour-service/api/tour/*`, `backend/tour-service/api/bus/*`,
  `backend/tour-service/api/auth/auth.middleware.ts`, `docs/api-contract/api-contract.tour-service.yaml`,
  `docs/api-contract/api-contract.user-management-service.yaml`.
- Nature: this component was previously built and merged without ever having run through the
  Security agent. This is that missing audit, done read-only against existing code — no rebuild.

## Summary

No unauthenticated-mutation risk and no XSS risk found. All six mutations the component can
trigger (add/edit/delete tour, add/edit/delete bus) route through `tourService`/`busService` →
`httpService`, which attaches the admin JWT; the component itself holds no token logic and no
`dangerouslySetInnerHTML`. Server-side, every tour/bus create/update/delete route is behind
`requireAdmin`, verified with new tests (401 without token, 401 with a forged/mis-signed token).
`DELETE` on tours/buses is a genuine soft-delete (`deletedAt`) and deleted items are excluded from
subsequent `GET` responses — also verified.

One genuine finding was surfaced and is **not** fixed in this task (see Scope note below): deleting
a bus, or a tour (which cascades to its buses), permanently hard-deletes the `Seat` documents for
that bus, including any passenger PII (`passengerName`, `passengerPhone`) attached to
`pending`/`taken` seats. This contradicts the tour-service API contract's own wording for
`DELETE /tour/{tourId}` ("the data is retained") and the soft-delete pattern `database-rules.md`
uses for every other collection (tours, buses, admins). See Finding SEC-AGE274-01.

## Checks performed (per plan Scope)

1. **Client-side JWT usage** — `TourManagement.tsx` is presentational; no token logic. All six
   handler props bubble to `AdminDashboardPage.tsx`, which calls `tourService`/`busService`
   (`frontend/src/services/tour.service.ts`, `bus.service.ts`), both of which go through
   `httpService`/`tourClient` — the shared authenticated HTTP client. ✅ Pass.
2. **Server-side admin-auth enforcement** — `backend/tour-service/api/tour/tour.routes.ts` and
   `bus.routes.ts`: `POST`/`PUT`/`DELETE` on both `/tour` and `/tour/:tourId/buses` are behind
   `requireAdmin` (`auth.middleware.ts`, verifies JWT signature + presence of an id claim). `GET`
   routes are intentionally public (passengers browse tours pre-login — matches the API contract
   and the AGE-264 re-audit's findings). Verified with new tests: 401 with no header, 401 with a
   token signed with the wrong secret, for all 6 mutation routes. ✅ Pass.
3. **Soft-delete correctness** — `softDeleteTour`/`softDeleteBus` in `tour.service.ts`/`bus.service.ts`
   set `deletedAt` and keep the Tour/Bus documents; both models auto-filter `deletedAt: null` on
   find (`pre(/^find/)` hooks), so deleted items disappear from `GET /tour`, `GET /tour/:tourId`,
   `GET /tour/:tourId/buses` without a hard delete. Verified with new tests plus the existing
   `tour-service.test.ts` suite (`"Tour/bus deletion is a soft-delete, excluded from reads"`). ✅ Pass.
4. **Orphaned/hard-deleted passenger data on delete** — ❌ **Finding SEC-AGE274-01** (see below).
5. **Free-text field rendering (XSS)** — `tour.title`, `bus.description`, `bus.pickupPoints[]` are
   all rendered as plain JSX children (`{tour.title}`, `{bus.description}`, `{pt}`), never through
   `dangerouslySetInnerHTML` or a raw-HTML sink. React escapes these by default. Confirmed by
   existing `TourManagement.test.tsx` test `'renders pickup-point tags and free-text fields as
   escaped text, not HTML'`, which asserts `<script>`/`<img onerror>` payloads render as literal
   text and `container.querySelector('script'|'img')` is null. ✅ Pass, already covered — no gap.
6. **"Main bus" index-derived flag** — `Bus` model (`backend/tour-service/api/models/bus.model.ts`)
   has no explicit main/primary field; `isFirstBus = busIdx === 0` in `TourManagement.tsx` remains
   the only signal. No drift today. Per plan 019's own risk note, this stays a documented residual
   risk (array order changes if the API ever reorders `buses[]`) — not a defect to fix now.
7. **Delete-confirmation** (plan 019 Open Question) — `AdminDashboardPage.tsx`'s
   `handleDeleteTour`/`handleDeleteBus` open a `ConfirmModal` before calling
   `tourService.remove`/`busService.remove`; the component itself never calls the store directly.
   ✅ Present, matches plan 019's resolved answer (owned by frontend agent's diff, re-confirmed here
   as part of the mutation call-chain audit).

## Finding SEC-AGE274-01 — Deleting a bus/tour with bookings hard-deletes passenger seat data

- **Severity:** Medium (data-loss / accountability gap, not an auth bypass or PII *exposure*).
- **Where:** `backend/tour-service/api/tour/tour.service.ts::softDeleteTour` (line ~78,
  `Seat.deleteMany({ busId: { $in: busIds } })`) and
  `backend/tour-service/api/bus/bus.service.ts::softDeleteBus` (line ~148,
  `Seat.deleteMany({ busId })`).
- **What happens:** An admin deleting a bus (or a tour, which cascades to its buses) permanently
  removes every `Seat` document for that bus via `deleteMany` — including seats in `pending` or
  `taken` status that carry `passengerName`/`passengerPhone`/`notes`/`approvedAt`/`assignedBy`.
  The `Seat` model (`backend/tour-service/api/models/seat.model.ts`) has no `deletedAt` field at
  all, so this data cannot be recovered or even queried after the fact.
- **Why it's a real gap, not by design:**
  - `docs/api-contract/api-contract.tour-service.yaml`'s `DELETE /tour/{tourId}` description says
    the cascade to buses/seats happens "rather than removing documents from the database... the
    data is retained" — this is factually inaccurate for the embedded seat/passenger data.
  - `.rule/database-rules.md` establishes `deletedAt` soft-delete as the pattern for `tours`,
    `buses`, and `admins`; `seats` is the one collection in that same document that's silently
    exempted, with no explicit rationale given.
  - Plan 019's own Risks section flagged "deleting a bus/tour with bookings could orphan or
    hard-delete passenger data" and this task's plan (027) explicitly called out verifying it —
    this audit confirms the risk is real and currently unmitigated.
- **Confirmed by test:** `docs/tests/security/age274-tour-management.security.test.ts`, describe
  block `"AGE-274 FINDING: deleting a bus/tour with an active booking hard-deletes passenger seat
  data"` — books and approves a seat (passenger PII present), deletes the bus (or tour), and shows
  the `Seat` document is `null` afterward.
- **Disposition:** **Not fixed in this task.** This requires a schema-level change (adding
  `deletedAt` to the `Seat` model, updating every seat query/index to account for it, updating the
  unique `{busId, position}` index semantics, and updating the API contract's PublicSeat/Seat
  schemas) — that's a genuine feature change to the seat lifecycle, not a "minimal fix" for a
  presentational component re-audit per this plan's Scope (`TourManagement.tsx` /
  `AdminDashboardPage.tsx` / tour-bus route/service files only, "fixing a genuine, small defect").
  Recommend a follow-up plan/ticket owned by `tour-service` (and coordinated with whoever owns
  `docs/api-contract/api-contract.tour-service.yaml` and `.rule/database-rules.md`) to either (a)
  soft-delete seats too, or (b) explicitly document this as an intentional data-retention tradeoff
  and correct the contract wording ("the data is retained") to stop overstating the guarantee.

## Frontend/API-contract cross-check (informational, no action)

- `Tour`/`Bus` Mongoose models (`tour.model.ts`, `bus.model.ts`) have no `uuid` field and the
  routes/services use the raw Mongo `_id` as the client-facing `id` — which is inconsistent with
  `.rule/database-rules.md`'s "External Identity — uuid, never `_id`" rule (internal ObjectIds
  should never be the client identity). This is a pre-existing, service-wide pattern across all of
  `tour-service` (tours, buses, and seats all use raw `_id`), not something introduced by or
  specific to `TourManagement.tsx`/this component's mutations, and fixing it would require
  reworking every tour/bus/seat route and the API contract — well outside this audit's scope.
  Flagged here for awareness only; not a finding against this component.
- `docs/api-contract/api-contract.user-management-service.yaml` was reviewed for the admin-JWT
  issuance this component's mutations depend on — no changes needed; issuance/verification itself
  was out of scope per plan 027 (already covered by prior AGE-244/AGE-264 audits).

## Tests added

- `docs/tests/security/age274-tour-management.security.test.ts` (+
  `vitest.age274-tour-management.config.ts`) — 11 tests, all passing:
  - 6x "no token → 401" for every TourManagement-triggered mutation route.
  - 1x forged/mis-signed token → 401 (spot-checked on 2 routes).
  - 2x soft-delete verification (tour, bus): `deletedAt` set, document retained, excluded from GET.
  - 2x hard-delete-of-passenger-data reproduction (Finding SEC-AGE274-01), one via direct bus
    delete, one via tour-delete cascade.
- No gaps found in existing `frontend/src/components/TourManagement.test.tsx` (XSS-safe rendering,
  disabled first-bus delete with non-color cues, full handler wiring already covered) or existing
  `backend/tour-service/api/__tests__/tour-service.test.ts` (auth-401 and soft-delete-retention
  already covered for the general tour/bus CRUD surface) — no duplicate tests added there.

## Test run

```
cd backend/tour-service && npx vitest run --config ../../docs/tests/security/vitest.age274-tour-management.config.ts
Test Files  1 passed (1)
     Tests  11 passed (11)
```

## Code changes

None. This was a pure audit; the one genuine finding (SEC-AGE274-01) is a schema-level change
outside this task's "minimal fix" scope and is being handed off as a follow-up recommendation
rather than patched here, per the plan's own boundary between "small defect fix" and "rebuild/new
development."

STATUS: DONE
