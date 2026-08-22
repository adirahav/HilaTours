# 036 — Preserve custom BusType grid (gaps/disabled slots) all the way into the rendered seat map

Status: superseded — see .plan/037-2026-08-22-fix-custom-bustype-grid-gaps-disabled-seat-slots-in-the-midd.md
Owner: orchestrator
Last updated: 2026-08-22
Scope-Agents: tour-service, frontend, qa

## Goal

A bus created from a custom `BusType` whose grid has a gap (a `disabledSeatSlots` entry that removes a seat from the *middle* of a row — e.g. a 4-seat back row with an empty slot between seat 2 and seat 4, per the admin's report on 2026-08-22 with a screenshot) must render that gap as a blank cell in the passenger-facing seat map. Today it doesn't: seats render packed consecutively with no gap, because the row/column/gap information the admin configured in the BusType is destroyed before it ever reaches the rendered map.

## Root Cause (confirmed via code investigation, 2026-08-22)

1. `backend/tour-service/api/busType/busType.service.ts` (`seatPositionsFromBusType`) correctly *counts* seats around `disabledSeatSlots`/gaps, but the only thing persisted onto the `Bus` document is a flat `seatLayout.positions: string[]` — sequential labels `"1".."N"`. No row/column/gap information survives into storage — a "1..N" list can't represent "there's a hole between logical seat 2 and 3."
2. `frontend/src/lib/tourMapper.ts` then reconstructs each seat's `row`/`col` for rendering by calling `generateBusSeats(totalSeats)` in `frontend/src/lib/busLayoutHelper.ts` — a **hardcoded generic layout** (fixed `BACK_ROW_SEAT_COUNT = 5`, fixed `BACK_DOOR_ROW = 8`, strict 4-per-row packing) that only knows the bus's total seat count. It has no idea the bus was built from a custom BusType, let alone which one or where its gap was.
3. `BusMap.tsx` itself is not the bug — it renders explicit `seat.col === N` grid lookups and *would* show a correct blank cell if the seat data actually had a gap in it. The gap is lost upstream, long before rendering.

## Fix Direction (human-approved, 2026-08-22 — final, supersedes this plan's earlier draft)

**Store `busTypeId` on the `Bus` document as a persistent field (not just a transient create/update input), and derive the rendered grid (row/col, including gaps) by joining to the live `BusType` document whenever the bus is rendered — never by duplicating/snapshotting the grid onto the bus.**

This was chosen over the earlier draft of this plan (which proposed snapshotting a `cells: [{position,row,col}]` grid onto `Bus.seatLayout` at creation time) after discussing the tradeoff directly with the human:
- **Editing a `BusType` after buses were created from it DOES retroactively change those buses' rendered seat maps** (the grid is always derived live from the current `BusType` state, not a frozen snapshot). This is a deliberate reversal of plan 034's Open Question 2 ("no reference is kept... allow free deletion") and of the BusType schema doc's earlier statement that "editing a BusType never retroactively changes buses already created from it" — both should be corrected to match this decision.
- Human's reasoning: the admin already sees a confirm warning when changing a bus's type (plan 035's `BusModal.tsx` flow) — the same spirit of "warn, don't silently protect" applies to editing a `BusType` itself. If seats visually move because the admin edited the template, that's acceptable as long as the admin is warned when editing a `BusType` that's already in use.
- **Soft-deleting a `BusType`** that buses still reference is fine and requires no special handling — the human's framing: "it's soft delete, so not a big deal, it's technically still there." The join must bypass the normal soft-delete list-filter for this specific lookup-by-id case (buses need to keep resolving their `busTypeId` even after the template is soft-deleted) — this is the one behavioral nuance to get right, see Scope below.

## Scope

- `.rule/database-rules.md` / `backend/tour-service/api/models/bus.model.ts`: add a new persistent field `busTypeId — ObjectId, ref: 'BusType', default: null` to the `bus` collection (distinct from today's transient `BusInput.busTypeId`, which is only used at request time to resolve+generate `seatLayout.positions` — now it must ALSO be stored on the document itself, permanently, so later reads can join back to the template). Exposed to clients as `busTypeId: string uuid | null` (resolved uuid, not the internal ObjectId, per the existing external-identity convention).
- `backend/tour-service/api/bus/bus.service.ts`: `createBus`/`updateBus` (the `busTypeId`-present branch from plan 035) must persist `busTypeId` onto the `Bus` document itself (in addition to generating `seatLayout.positions` and reseeding `Seat` documents, both unchanged from plan 035 — `Seat.position` stays a flat string, no grid data needed on it). Manually-configured buses (raw `seatLayout`, no `busTypeId`) store `busTypeId: null`, as today implicitly.
- `backend/tour-service/api/busType/busType.service.ts` (or wherever a `BusType` is resolved by uuid): the lookup used to serve a bus's `busTypeId` join **must not filter out soft-deleted `BusType`s** — a bus referencing a soft-deleted template must still resolve it and render correctly. This is different from `listBusTypes` (which correctly excludes soft-deleted templates from the admin's picker) — do not accidentally reuse the list-scoped resolver for this join.
- `docs/api-contract/api-contract.tour-service.yaml`: add `busTypeId: string, format: uuid, nullable: true` to the `Bus` schema (a real, persisted, readable field — not just a write-only input). Revert/correct the earlier (mistaken) `seatLayout` description edit from this plan's first draft — no new `cells` shape needed; `seatLayout` keeps its existing `{positions}`/`{rows,columns}` shapes.
- `frontend/src/types/bus.types.ts` / `frontend/src/lib/tourMapper.ts`: `Bus.busTypeId` becomes a real mapped field. `tourMapper.ts`'s seat-to-row/col derivation: when `bus.busTypeId` is set, look up the matching `BusType` from the store (`useStore.getState().busTypes` — already loaded for the admin dashboard; confirm it's also available/loaded wherever the passenger-facing map hydrates, since passengers also need this join, not just admins) and derive each seat's `row`/`col` by walking the SAME grid-generation algorithm the BusType admin UI already uses for its live preview (`generateNumberedGrid`-equivalent — extract this into a shared helper so the admin preview and the passenger seat map can never drift apart), mapping `Seat.position` (a sequential number matching that walk order) to its `row`/`col`, correctly skipping `disabledSeatSlots` as gaps. When `bus.busTypeId` is null (manual bus), fall back to the existing `generateBusSeats(totalSeats)` — unchanged.
- **Shared grid-walk helper (new):** extract the row/col/gap-walking logic currently duplicated between `busType.service.ts` (backend, for seat counting) and wherever `BusTypeManagement.tsx`'s live preview computes its grid, into one canonical algorithm description that both the backend seat-position generator and the new frontend row/col deriver implement identically — a mismatch between the two would silently reintroduce this exact bug in a new form (e.g. off-by-one between "seat N" as counted server-side vs. as walked client-side).
- `frontend/src/components/admin/BusTypeManagement.tsx` (or wherever a `BusType` is edited): **new warning when editing a `BusType` that has one or more buses already referencing its `busTypeId`** — e.g. "דגם זה בשימוש ב-N אוטובוסים; שינויים כאן ישנו מיידית את מפת המושבים שלהם." This is the human-specified safeguard replacing the "protect existing buses" approach — warn, don't block. Needs a way to count/list buses by `busTypeId` (new lookup, likely a small backend query or reusing the already-loaded bus list in the store).
- `docs/PRD.md` (F11) / any BusType doc language claiming edits don't affect existing buses: correct to state edits DO retroactively affect the seat map of buses referencing that template, and that the admin is warned before editing an in-use template.

## Open Questions

1. Does `BusMap.tsx`'s back-row rendering (hardcoded to columns `[1,2,3,4,5]` via `BACK_ROW_SEAT_COUNT`) already render a correct blank cell for any column with no seat present, or does it assume exactly 5 columns unconditionally and needs to become driven by the actual max column derived from the join?
   - Recommended: audit during implementation — likely needs to iterate the real column range derived from the `BusType`'s `backRowSeatsCount`, not a hardcoded 5.
2. Where exactly does the passenger-facing (unauthenticated) flow load `busTypes` from, if at all — today `busTypes` in the store appears to be admin-dashboard-loaded. If passengers never fetch the `BusType` list, the row/col join described above can't happen client-side for them.
   - Recommended: audit — if passengers don't have `busTypes` loaded, either (a) make `GET /tour`/`GET /tour/:tourId` public routes also embed enough BusType grid info per bus for the join (their own small nested shape, not a separate authenticated `/busType` fetch), or (b) have the server do this row/col join once and embed `row`/`col` directly on each `PublicSeat`/`Seat` in the response — pushing the derivation server-side removes the client-side "keep two algorithms in sync" risk entirely and may be the better call; flag for a follow-up decision during implementation, this plan doesn't resolve it definitively.

## Validation

- Unit test: create a `BusType` with a back row of 4 seats and a gap in the middle (mirroring the admin's screenshot), instantiate a `Bus` from it (confirm `Bus.busTypeId` persisted), fetch the bus, and confirm the derived row/col (wherever computed, per Open Question 2) has a gap at the expected grid cell — no seat at that column.
- Manual/QA: reproduce the exact reported scenario — mini-bus BusType, 4-seat back row with a middle gap — create a bus from it, open the passenger seat map, and visually confirm the gap renders as blank space, not packed seats.
- Manual/QA: edit that same `BusType` (e.g. move the gap, or change `backRowSeatsCount`) after the bus exists, confirm the admin sees the "in use by N buses" warning before saving, and confirm the bus's seat map changes accordingly after the edit (live-join behavior, not frozen).
- Manual/QA: soft-delete that `BusType`, confirm the existing bus's seat map still renders correctly (join must survive soft-delete).
- Regression: a bus created from `seatLayout.positions` directly (manual entry, no `busTypeId`) still renders correctly via the existing `generateBusSeats` fallback — unchanged behavior.

## Rollout Order

1. `tour-service` — persist `busTypeId` on `Bus`, non-soft-delete-filtered `BusType` resolver for the join, API contract update.
2. `frontend` — resolve Open Question 2 (client-side vs. server-side row/col derivation), implement the shared grid-walk helper, wire `tourMapper.ts` (and/or backend response shape per the chosen resolution), add the "in use by N buses" edit warning to `BusTypeManagement.tsx`.
3. `qa` — validation per above, including the exact screenshot scenario and the live-edit-propagation scenario.

## Rollback

- Additive on the backend (`busTypeId` is a new nullable field) — reverting drops back to the current generic-fallback rendering with no data loss (no migration needed, no production data yet). Frontend revert removes the join and the edit-warning UI, restoring today's (buggy) generic fallback for all BusType-created buses.
