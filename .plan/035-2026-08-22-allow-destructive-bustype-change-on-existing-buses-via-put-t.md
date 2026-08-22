# 035 — Allow destructive BusType change on existing buses via PUT /tour/:tourId/buses/:busId

Status: done
Owner: orchestrator
Last updated: 2026-08-22
Scope-Agents: tour-service, frontend, security, qa

## Goal

When an admin updates an existing bus (`PUT /api/tour/:tourId/buses/:busId`) and includes `busTypeId` in the request body, `tour-service` must resolve that BusType, regenerate the bus's `seatLayout` from it, and **reseed-by-position**: for every `position` that exists in both the old and new layout, carry over the existing Seat document's full state (`status`, `passengerName`, `passengerPhone`, `pickupPointName`, `notes`, `requestedAt`, `approvedAt`, `assignedBy`, `bookingGroupId` — everything except `_id`/`busId`/`position` itself) onto the new Seat document at that same position; positions that are new in the new layout are created `available`; positions that existed before but no longer exist in the new layout are dropped (their occupant, if any, is genuinely lost — this is the only actual data loss).

**This replaces the originally-drafted "hard-delete everything, recreate all-available" approach** — a human review of this plan (2026-08-22) pointed out that blanket-wiping every seat is wrong: if a passenger (e.g. "עדי") sits in seat "1" and the admin switches to a *bigger* bus type that still has a seat "1" (e.g. more rows appended at the back), there is no reason to lose that passenger's assignment. Only positions that genuinely stop existing (e.g. shrinking, or a door-row change that renumbers seats) should lose their occupant.

This matches the frontend, which already always sends `busTypeId` on both create and update, and already gates this action behind an explicit confirm checkbox in the admin UI (`BusModal.tsx`) — that checkbox/warning text must also be corrected to reflect "positions no longer in the new layout" rather than "all seats," per the same human review (see Scope below for the frontend follow-up this implies).

## Scope

- Backend: `backend/tour-service/api/bus/bus.service.ts`, `backend/tour-service/api/bus/bus.controller.ts` (controller likely unchanged — service already receives full `req.body` — but listed for review).
- No changes expected in `backend/tour-service/api/busType/*` (reuse the existing `seatLayoutForBusTypeUuid` helper as-is).
- **Frontend (already done, 2026-08-22, superseding the earlier draft of this line):** `frontend/src/modals/BusModal.tsx` no longer shows an always-visible inline warning banner. It now tracks `initialBusTypeId` (the template snapshotted when the edit modal opened) vs. the currently selected `busTypeId`, and on submit — only when `busTypeChanged && hasOccupiedSeats` — opens a confirm **modal** (`showChangeConfirm`) with the accurate, by-position risk wording ("מושבים שקיימים גם בדגם החדש ישמרו את השיוך שלהם... מושבים שלא קיימים בדגם החדש יאבדו..."), with "ביטול"/"אשר ושמור" actions; the save only actually fires (`commitSave`) after the admin clicks "אשר ושמור". This is more precise than the earlier "always show a banner whenever editing an occupied bus" behavior — the modal only appears when a real bus-type change is being submitted, not merely when editing a bus that happens to have occupied seats. `frontend/src/services/bus.service.ts`'s comment was corrected to match the by-position (not blanket-wipe) semantics.
- Docs: `docs/api-contract/api-contract.tour-service.yaml`'s `/tour/{tourId}/buses/{busId}` PUT description needs the same correction — currently describes a blanket wipe, must describe reseed-by-position instead.

## Assumptions

- The task description refers to a "`seatLayoutFromBusType`" helper "built for POST"; the actual existing function is `seatLayoutForBusTypeUuid` in `backend/tour-service/api/busType/busType.service.ts`, already imported into `bus.service.ts` and used by `createBus`. This plan treats that as the same helper referenced by the task.
- `busTypeId: null` (explicit null) on update means "no template" and should behave like `busTypeId` absent (no seatLayout change) — this plan treats presence as `input.busTypeId !== undefined && input.busTypeId !== null`, matching the existing `hasBusTypeId` check pattern used in `createBus`.
- Reseed-by-position (not blanket hard-delete) is correct per human review (2026-08-22) — see Goal. Positions absent from the new layout are still hard-deleted (their occupant, if any, is genuinely and intentionally lost — there is no way to place them anywhere in the new layout). This still diverges from `softDeleteBus`'s soft-delete pattern and from `resizeSeats`'s occupied-seat *blocking* (this path never blocks — it always proceeds, only losing occupants for positions that stop existing), and that divergence remains intentional and scoped only to the `busTypeId`-present branch of `updateBus`.
- `resizeSeats` (the existing non-destructive resize-by-diff path used when raw `seatLayout` is sent directly, without `busTypeId`) is unaffected and continues to protect occupied seats — this plan does not touch that function or its call site for the `input.seatLayout`-only branch.
- No design/Figma files apply — this is a pure backend behavior change with no new UI. `raw_from_ai_studio/src/components/BusModal.tsx` (if present) is informational only, confirming the existing confirm-checkbox UX already referenced in the task description, not something this plan implements.

## Open Questions

1. Should `updateBus` reject the request with 400 if the caller sends **both** `busTypeId` and a raw `seatLayout` in the same PUT body (mirroring `createBus`'s mutual-exclusivity check), or should `busTypeId` simply take precedence and silently ignore `seatLayout`?
   - Recommended: Reject with 400 ("Supply either seatLayout or busTypeId, not both"), reusing the same mutual-exclusivity guard already written for `createBus`, so update and create have one consistent, unambiguous contract.
   - *HUMAN ANSWER:* `busTypeId` should simply take precedence and silently ignore `seatLayout`
2. Should the destructive reseed run inside a MongoDB transaction (delete-then-insert atomically) to avoid a window where the bus has zero Seat documents if the process crashes mid-operation?
   - Recommended: Yes if the existing Mongo connection already supports transactions (replica set) — check how other multi-write operations in `tour-service` (e.g. `seat.service.ts` approve/cancel/swap) handle this and reuse the same pattern for consistency; if no existing precedent uses transactions, match that precedent (Mongo standalone deployments often don't support them) rather than introducing a new pattern for just this one path.
   - *HUMAN ANSWER:* as recommended
3. Should the endpoint response include any signal that a destructive reseed happened (e.g. `seatsReset: true`), or is silently returning the updated bus (as `createBus`/`updateBus` already do) sufficient?
   - Recommended: No new response field — the frontend already knows it sent `busTypeId` and already warned the admin before submitting, so the existing `toClientBus` response shape is sufficient and keeps the contract unchanged for this task's scope.
   - *HUMAN ANSWER:* as recommended

## Steps

1. `backend/tour-service/api/bus/bus.service.ts` — `updateBus`:
   - Add the same `hasSeatLayout`/`hasBusTypeId` mutual-exclusivity guard as `createBus` (pending answer to Open Question 1 — human answer says `busTypeId` takes precedence and silently ignores `seatLayout`, so implement that, not a 400).
   - When `hasBusTypeId` is true: resolve the new seatLayout via `await seatLayoutForBusTypeUuid(input.busTypeId)`, set `update.seatLayout = seatLayout`, then call a new helper `reseedSeatsByPosition(existing._id, seatLayout)` instead of `resizeSeats`.
   - Add `reseedSeatsByPosition(busId, newSeatLayout)`:
     1. Compute `newPositions = seatPositionsFromLayout(newSeatLayout)`; throw 400 if empty (matching `insertBus`'s guard).
     2. Load all existing `Seat` docs for this bus: `const existingSeats = await Seat.find({ busId })`, keyed by `position` (`Map<string, SeatDoc>`).
     3. For each `position` in `newPositions`: if `existingSeats` has that position, keep the existing document as-is (no write needed — its `_id`/state is already correct and unaffected by the layout change). If not present in `existingSeats`, it's a brand-new position — insert a fresh `Seat` doc `{ busId, position, status: "available" }`.
     4. Any `existingSeats` entries whose `position` is NOT in `newPositions` are positions that no longer exist — hard-delete exactly those: `await Seat.deleteMany({ busId, position: { $nin: newPositions } })`.
     5. Net effect: seats at positions common to both layouts are untouched (occupant preserved); new positions are added `available`; removed positions are deleted (occupant, if any, lost — this is the only real data loss, and only for positions the new layout genuinely can't represent).
   - Leave the existing `input.seatLayout`-only branch (raw seatLayout, no `busTypeId`) calling `resizeSeats` exactly as today — unrelated, unchanged.
   - Leave the `input.name`/`input.pickupPoints`-only branch (no `busTypeId`, no `seatLayout`) completely unchanged.
2. `backend/tour-service/api/bus/bus.controller.ts` — `update`: review only; the controller already forwards the full `req.body` (including `busTypeId`) to `busService.updateBus`, so no code change is expected unless Step 1's guard needs a distinct HTTP status mapping (it doesn't — `HttpError` already flows through the existing error middleware).
3. Update the JSDoc comment on `BusInput.busTypeId` in `bus.service.ts` (currently states "Ignored on update...") to describe the new reseed-by-position behavior, so the code comment doesn't contradict the implementation.
4. `frontend/src/modals/BusModal.tsx` — correct the warning banner text (currently claims ALL seat assignments are lost) to describe the accurate, narrower risk: only seats at positions absent from the new layout lose their passenger; matching positions keep their occupant. Keep the `confirmReset` checkbox gate.
5. `frontend/src/services/bus.service.ts` — correct the `toBusInput`/`save` code comment to match (currently says "discarding any existing seat assignments").
6. `docs/api-contract/api-contract.tour-service.yaml`'s `/tour/{tourId}/buses/{busId}` PUT description — correct to describe reseed-by-position, not a blanket wipe.

## Validation

- Unit/integration tests in `backend/tour-service` (wherever existing `bus.service`/`bus.controller` tests live) covering:
  - PUT with `busTypeId` pointing to a **bigger** template that is a strict superset of positions (e.g. same front rows, more rows appended at the back) on a bus with occupied seats → occupied seats at matching positions (e.g. seat "1") keep their exact `status`/`passengerName`/`passengerPhone`/etc.; new trailing positions are created `available`; total seat count matches the new BusType.
  - PUT with `busTypeId` pointing to a **smaller** template, or one whose door-row/disabled-slots shift numbering, on a bus with occupied seats at positions that no longer exist in the new layout → those specific Seat docs are hard-deleted (occupant lost); occupied seats at positions still present are preserved untouched.
  - PUT with `busTypeId` on a bus that has seats in every status (`available`/`pending`/`taken`/`reserved`) at positions common to both layouts → each preserves its exact status/PII, confirmed via `Seat.findOne({ busId, position })` before/after.
  - PUT with `busTypeId` pointing to a nonexistent/soft-deleted BusType uuid → 404, no seats touched.
  - PUT with both `busTypeId` and `seatLayout` → `busTypeId` wins, `seatLayout` silently ignored (per Open Question 1's human answer), reseed-by-position runs as normal.
  - PUT with `busTypeId: null` (or omitted) and only `name`/`pickupPoints` → unchanged seatLayout, unchanged Seat documents (existing behavior, regression check).
  - PUT with raw `seatLayout` only (no `busTypeId`) on a bus with occupied seats being shrunk → still rejected with 400 via `resizeSeats`'s existing occupied-seat guard (regression check — confirms this plan didn't accidentally loosen the non-destructive `resizeSeats` path, which is unrelated to the new `reseedSeatsByPosition` path).
- Manual/QA pass through the admin UI: edit an existing bus with a named occupied seat (e.g. "עדי" in seat 1), switch to a bigger bus type that still contains position "1", submit, and confirm "עדי" is still shown in seat 1 afterward — this is the exact scenario the human review flagged, so it must be checked explicitly, not just inferred from unit tests.

## Risks

- **Data-integrity / irreversible data loss (tour-service):** loss is now scoped to positions genuinely absent from the new layout (intentional, product-approved), but a bug in the position-matching logic (e.g. comparing normalized vs. non-normalized position strings) could wrongly treat a still-valid position as removed and delete an occupied seat that should have been preserved — this is the main new failure mode introduced by this plan and needs explicit test coverage (see Validation's "bigger template" case). Mitigated by scoping every delete strictly to `{ busId: existing._id, position: { $nin: newPositions } }` and by exact-string position matching (no fuzzy/partial matching).
- **Security/authorization (admin-only mutation):** `PUT /tour/:tourId/buses/:busId` already requires admin auth per existing routing — confirm no regression to that guard while touching `bus.controller.ts`; flagged for the `security` agent given this is an admin mutation with PII-adjacent impact (destroys passenger seat assignments, even though passenger PII in `Seat` documents is also deleted as a side effect, which is arguably a privacy-positive but should be confirmed intentional).
- **Concurrency:** no seat-level locking is introduced here; a booking request (`POST .../seats/bookings`) racing with this destructive update could theoretically insert/act on a seat mid-reseed. Existing `tour-service` concurrency patterns (see `seat-concurrency-layer` skill) should be checked for whether this path needs the same protection — likely low risk since Open Question 2 (transactions) already covers the atomicity angle, but call out explicitly since PRD seat-concurrency rules exist for a reason.

## Rollout Order

1. Backend (`tour-service`) implementation and tests first — this is the only functional change; ship independently since the frontend contract (`busTypeId` always sent) and API contract docs are already in place.
2. No frontend deploy needed — `BusModal.tsx`/`bus.service.ts` already send the required payload shape per the task description.
3. QA validation pass after backend deploy, against a staging bus with occupied seats, before considering this done.

## Rollback

- Revert the `tour-service` change (Step 1) to restore the prior "seatLayout is intentionally not remapped on update" behavior for `busTypeId` on `PUT`. Since the frontend already always sends `busTypeId`, a rollback here would silently restore the *old* no-op-on-busTypeId behavior — no separate frontend rollback is needed, but note that reverting reintroduces the mismatch between docs/frontend behavior and backend behavior that this plan is meant to fix, so rollback should be a deliberate, short-lived measure only.
