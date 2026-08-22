# 037 — Fix: custom BusType grid gaps (disabled seat slots) lost by the time the seat map renders

Status: draft
Owner: orchestrator
Last updated: 2026-08-22
Scope-Agents: tour-service, frontend, qa

## Goal

Reproduce and fix the admin-reported bug (screenshots, 2026-08-22): a mini-bus `BusType` back row configured with a gap in the middle (e.g. seat 2, empty slot, seat 4) renders as packed consecutive seats on the passenger/admin seat map instead of showing the gap. Implement the human-approved final fix direction from `.plan/036-2026-08-22-preserve-custom-bustype-grid-gaps-disabled-slots-in-seatlayout.md`: persist `busTypeId` permanently on `Bus`, and derive the rendered grid (row/col, including gaps) by joining LIVE to the current `BusType` document at render time — never by snapshotting.

This plan supersedes `.plan/036-2026-08-22-preserve-custom-bustype-grid-gaps-disabled-slots-in-seatlayout.md` (marked `Status: superseded` below) and turns its already-approved fix direction into concrete, file-level steps, resolving both of its Open Questions.

## Scope

- `backend/tour-service/api/models/bus.model.ts`: add persistent `busTypeId: Types.ObjectId | null` field (`ref: "BusType"`, `default: null`), distinct from the existing transient `BusInput.busTypeId` write-input.
- `backend/tour-service/api/bus/bus.service.ts`: `createBus`/`updateBus` (the `busTypeId`-present branch) additionally persist `busTypeId` onto the `Bus` document itself, alongside the already-existing `seatLayout`/`Seat` reseed logic (unchanged). Manual buses (raw `seatLayout`, no template) store `busTypeId: null`.
- `backend/tour-service/api/busType/busType.service.ts`: add a new resolver (e.g. `resolveBusTypeForBusRender`) that calls `resolveDoc(BusType, busTypeUuid, message)` with **no** `{ deletedAt: null }` filter — so a bus referencing a soft-deleted template still resolves it. Keep `resolveBusTypeDoc`/`getBusType`/`listBusTypes`/`seatLayoutForBusTypeUuid` unchanged (those stay scoped to non-deleted templates, which is correct for the admin picker and for new-bus creation).
- `backend/tour-service/api/lib/clientShape.ts` (`toClientBus`): resolve and expose the referenced `BusType`'s live grid alongside the bus so callers never need a second authenticated fetch. Concrete resolution of Open Question 2 below: **do the row/col join server-side** and embed the resulting per-seat `row`/`col` (or the raw grid: `standardRowsCount`/`doorRow`/`backRowSeatsCount`/`disabledSeatSlots`) directly on the bus response — both the public (`GET /tour`, `GET /tour/:tourId`) and admin (`GET /tour/:tourId/buses/:busId`) shapes, since passengers never authenticate and can't fetch `/busType` themselves. Emit `busTypeId: string uuid | null` too (external identity, not the internal ObjectId), so the admin UI can still show "built from template X" if useful later.
- `backend/tour-service/api/busType/busType.service.ts` (`seatPositionsFromBusType`/`buildNumberedGrid`-equivalent): extract a shared **row/col/gap walk** function reusable both for seat counting (existing) and for producing a `{ seatNumber, row, col }[]` map (new) — this is the one algorithm the render join calls, so there is exactly one place that numbers a template's seats, never two copies that could drift.
- `frontend/src/lib/tourMapper.ts` (`mapSeats`/`mapSeatsInternal`): when the raw bus payload carries a grid (from the new server-side join), use the server-supplied `row`/`col` per seat instead of calling `generateBusSeats(totalSeats)`. When absent (manual bus, `busTypeId: null`), keep today's `generateBusSeats` fallback — unchanged, so regression risk for manually-configured buses is zero.
- `frontend/src/types/bus.types.ts` / `frontend/src/lib/tourMapper.ts` (`RawBus`/`RawSeat`): add the new optional grid/row/col fields to the raw shapes.
- `frontend/src/components/BusTypeManagement.tsx` (or wherever a `BusType` is edited): add a warning shown when editing a template that is referenced by one or more buses (e.g. "דגם זה בשימוש ב-N אוטובוסים; שינויים כאן ישנו מיידית את מפת המושבים שלהם."), per the human's "warn, don't block" direction. Requires a small count-by-`busTypeId` lookup — either a new lightweight backend endpoint/field (e.g. `busCount` on the `BusType` list response) or a client-side count over the already-loaded bus list in the store, whichever is cheaper to wire correctly; decide during implementation (see Open Question 1 below is resolved, this one is a smaller implementation-order detail, not a design open question).
- `frontend/src/components/BusMap.tsx`: audit the hardcoded back-row column range (today driven by `BACK_ROW_SEAT_COUNT = 5` from `busLayoutHelper.ts`) — for a BusType-derived bus, render the back row using the actual `backRowSeatsCount`/gaps from the joined grid, not the hardcoded constant. This is Open Question 1 from plan 036, resolved as an implementation task, not left open.
- `docs/api-contract/api-contract.tour-service.yaml`: add `busTypeId: string, format: uuid, nullable: true` to the `Bus` schema, plus the new grid fields on seats/bus (exact shape finalized during implementation — either per-seat `row`/`col` or a nested `busTypeGrid` object; both are additive, non-breaking).
- `.rule/database-rules.md`: document the new persistent `Bus.busTypeId` field and the live-join behavior (retroactive edits, soft-delete-tolerant resolution).
- `docs/PRD.md` (F11) and any BusType doc language claiming "editing a BusType never retroactively changes buses already created from it" (plan 034's Open Question 2, the BusType schema doc): correct to state the opposite — edits DO retroactively change the rendered seat map of every bus referencing that template, and the admin is warned (not blocked) before saving such an edit.

## Assumptions

- No production data exists yet (per plan 036's Rollback note), so no migration/backfill is needed for the new `Bus.busTypeId` field — existing test/dev buses simply have `busTypeId: null` and keep rendering via the unchanged `generateBusSeats` fallback.
- The existing `seatLayout.standardRowsCount`/`doorRow`/`backRowSeatsCount`/`disabledSeatSlots` fields already persisted as "provenance" by `seatLayoutFromBusType` (see `backend/tour-service/api/busType/busType.service.ts`) are a frozen snapshot from creation time and are **not** the source of truth for rendering going forward — the live `BusType` join (via `busTypeId`) is. These snapshot fields are left in place (harmless, ignored by the new render path) rather than removed, to avoid an unrelated migration in this fix.
- `Seat.position` stays a flat, sequential string ("1".."N") — no schema change needed there; only the row/col *presentation* derived from it changes.
- The shared row/col/gap walk (backend `seatPositionsFromBusType`-adjacent, frontend `busTypeLayout.ts`'s `buildNumberedGrid`) must number seats identically to how `seatLayoutFromBusType` originally produced `positions` — this is already documented as a shared convention in both files' comments, so extending it is additive, not a redesign.

## Open Questions

1. Does `BusMap.tsx`'s back-row rendering need to become driven by the actual `backRowSeatsCount`/gap positions from the joined `BusType`, rather than the hardcoded `BACK_ROW_SEAT_COUNT = 5` from `busLayoutHelper.ts`, for BusType-derived buses?
   - Recommended: yes — resolved in Scope above as a concrete `BusMap.tsx` audit/fix step; `busLayoutHelper.ts`'s hardcoded generic layout remains correct and untouched for manual (non-BusType) buses only.
2. Should the row/col join happen client-side (frontend re-derives grid from a fetched `BusType`) or server-side (backend embeds the resolved grid/row/col on the bus response)?
   - Recommended: server-side. Passengers never authenticate and today have no path to fetch `/busType`, so a client-side join would require either a new public BusType-read endpoint (widening the public API surface for template internals) or duplicating two algorithms that must never drift (the exact class of bug this ticket is about). Embedding the resolved grid on the existing public/admin bus responses is additive, keeps the numbering algorithm in exactly one place (backend), and needs no new route.

## Steps

1. **tour-service — schema**: add `busTypeId` to `backend/tour-service/api/models/bus.model.ts`.
2. **tour-service — write path**: `backend/tour-service/api/bus/bus.service.ts` `createBus`/`updateBus` persist `busTypeId` onto the `Bus` doc when the `busTypeId`-present branch runs; `null` otherwise (explicit, not just omitted, so old docs and manual buses are unambiguous).
3. **tour-service — soft-delete-tolerant resolver**: add the new resolver in `backend/tour-service/api/busType/busType.service.ts` (no `deletedAt` filter), used only by the render join, never by the admin picker/list.
4. **tour-service — shared numbering helper**: extract the row/col/gap walk in `busType.service.ts` into a reusable function producing `{ seatNumber, row, col }[]`, used by both `seatPositionsFromBusType` (existing count) and the new render join.
5. **tour-service — response shape**: wire the join into `toClientBus` (`backend/tour-service/api/lib/clientShape.ts`), covering all three read paths: `listBuses`, `listBusesWithPublicSeats` (public, PII-safe), `getBusWithSeats` (admin). Update `docs/api-contract/api-contract.tour-service.yaml`.
6. **frontend — types & mapper**: extend `RawBus`/`RawSeat` in `frontend/src/lib/tourMapper.ts` / `frontend/src/types/bus.types.ts`; `mapSeatsInternal` prefers server-supplied row/col when present, falls back to `generateBusSeats` otherwise.
7. **frontend — BusMap back row**: audit and fix `frontend/src/components/BusMap.tsx` per Open Question 1's resolution.
8. **frontend — edit warning**: add the "in use by N buses" warning to `frontend/src/components/BusTypeManagement.tsx`.
9. **docs**: correct `docs/PRD.md` F11 and `.rule/database-rules.md` per Scope.

## Validation

- Unit test (`backend/tour-service/api/__tests__/busType.test.ts` or new): create a `BusType` with a back row of 4 seats and a gap in the middle (mirroring the admin's screenshot), instantiate a `Bus` from it, confirm `Bus.busTypeId` persisted, fetch the bus via each of the three read paths, and confirm the returned grid has a gap at the expected cell — no seat at that column.
- Unit test: soft-delete that `BusType`, re-fetch the bus, confirm the grid still resolves correctly (join survives soft-delete) while `listBusTypes`/`getBusType` correctly no longer surface the template to the admin picker.
- Unit test: a bus created from raw `seatLayout` (no `busTypeId`) still returns `busTypeId: null` and no server-side grid — frontend fallback path exercised.
- Frontend test (`frontend/src/lib/tourMapper.test.ts`): `mapSeatsInternal` uses server-supplied row/col when present; falls back to `generateBusSeats` when absent.
- Manual/QA: reproduce the exact reported scenario — mini-bus BusType, 4-seat back row with a middle gap — create a bus from it, open the passenger seat map, visually confirm the gap renders as blank space.
- Manual/QA: edit that same BusType (move the gap or change `backRowSeatsCount`) after the bus exists; confirm the admin sees the "in use by N buses" warning before saving, and confirm the bus's seat map changes accordingly after the edit (live-join, not frozen).
- Regression: a manually-configured bus (`seatLayout.positions`, no `busTypeId`) still renders identically to today via the unchanged `generateBusSeats` fallback.

## Risks

- **tour-service — data-integrity/backward-compat risk**: the new resolver must be scoped precisely (soft-delete-tolerant only for the render join, never accidentally reused by `listBusTypes`/create-bus resolution) — reusing the wrong resolver in the wrong place would either let a soft-deleted template be picked for a *new* bus (wrong) or 404 an existing bus's render (the exact bug class this plan fixes, just moved). This is why `tour-service` is in scope even though "no new client-facing endpoints" are added — it's a response-shape and resolver-scoping change with real correctness risk, not a no-op.
- **tour-service — concurrency**: none new — this fix only affects read-side derivation and the existing create/update write paths already covered by plan 035's tested reseed logic; no new mutation path is introduced.
- **frontend — algorithm drift**: if the shared numbering helper (Step 4) isn't actually shared — i.e. if the frontend ever re-implements its own numbering instead of consuming the server's embedded row/col — this exact bug reappears in a new form. Server-side join (Open Question 2) is chosen specifically to eliminate this risk by construction.
- **security — response surface**: embedding grid data on the public (`GET /tour`) bus response must stay PII-safe — grid/row/col are structural (not passenger data), so this doesn't reopen SEV-001, but the implementer must add the fields to `listBusesWithPublicSeats`'s response carefully, not by widening `PUBLIC_SEAT_FIELDS`/accidentally piping through admin-only fields.

## Rollout Order

1. `tour-service` — schema (`busTypeId` on `Bus`), soft-delete-tolerant resolver, shared numbering helper, response-shape join, API contract update.
2. `frontend` — mapper fallback logic, `BusMap.tsx` back-row fix, BusTypeManagement edit-in-use warning.
3. `qa` — validation per above, including the exact screenshot scenario and the live-edit-propagation scenario.
4. `docs` — PRD/database-rules corrections (can land alongside step 1, not blocking).

## Rollback

- Fully additive on the backend (`busTypeId` is a new nullable field on `Bus`; grid fields are new optional fields on the bus/seat response) — reverting drops back to today's generic-fallback rendering with no data loss, since no production data exists yet. Frontend revert removes the server-grid consumption and the edit-in-use warning UI, restoring today's (buggy) generic fallback for all BusType-created buses.
