# 035 — Allow destructive BusType change on existing buses via PUT /tour/:tourId/buses/:busId

Status: draft
Owner: orchestrator
Last updated: 2026-08-22
Scope-Agents: tour-service, security, qa

## Goal

When an admin updates an existing bus (`PUT /api/tour/:tourId/buses/:busId`) and includes `busTypeId` in the request body, `tour-service` must resolve that BusType, regenerate the bus's `seatLayout` from it, and **hard-delete + recreate** the bus's `Seat` documents to match the new layout — discarding any existing seat state (`available`/`pending`/`taken`/`reserved`) for seats that no longer map 1:1. This mirrors what `insertBus` already does on `POST`, and matches the frontend, which already always sends `busTypeId` on both create and update, and already gates this destructive action behind an explicit confirm checkbox in the admin UI (`BusModal.tsx`). This is a backend-only change to catch up `bus.service.ts`/`bus.controller.ts` to the already-updated API contract and already-shipped frontend behavior.

## Scope

- Backend: `backend/tour-service/api/bus/bus.service.ts`, `backend/tour-service/api/bus/bus.controller.ts` (controller likely unchanged — service already receives full `req.body` — but listed for review).
- No changes expected in `backend/tour-service/api/busType/*` (reuse the existing `seatLayoutForBusTypeUuid` helper as-is).
- No frontend changes: `frontend/src/**/BusModal.tsx` and `frontend/src/**/bus.service.ts` already send `busTypeId` on update and already implement the warning/confirm-checkbox UX per the task description.
- Docs: `docs/api-contract/api-contract.tour-service.yaml` already updated per the task description — verify wording matches the final implementation, adjust only if the implementation deviates from what's documented.

## Assumptions

- The task description refers to a "`seatLayoutFromBusType`" helper "built for POST"; the actual existing function is `seatLayoutForBusTypeUuid` in `backend/tour-service/api/busType/busType.service.ts`, already imported into `bus.service.ts` and used by `createBus`. This plan treats that as the same helper referenced by the task.
- `busTypeId: null` (explicit null) on update means "no template" and should behave like `busTypeId` absent (no seatLayout change) — this plan treats presence as `input.busTypeId !== undefined && input.busTypeId !== null`, matching the existing `hasBusTypeId` check pattern used in `createBus`.
- Hard-delete of `Seat` documents for the destructive path is correct per the task's explicit instruction ("hard-delete all existing Seat documents ... this is intentional data loss, not a bug") — this deliberately diverges from `softDeleteBus`'s soft-delete pattern elsewhere in the same file, and from `resizeSeats`'s occupied-seat protection. That divergence is intentional and scoped only to the `busTypeId`-present branch of `updateBus`.
- `resizeSeats` (the existing non-destructive resize-by-diff path used when raw `seatLayout` is sent directly, without `busTypeId`) is unaffected and continues to protect occupied seats — this plan does not touch that function or its call site for the `input.seatLayout`-only branch.
- No design/Figma files apply — this is a pure backend behavior change with no new UI. `raw_from_ai_studio/src/components/BusModal.tsx` (if present) is informational only, confirming the existing confirm-checkbox UX already referenced in the task description, not something this plan implements.

## Open Questions

1. Should `updateBus` reject the request with 400 if the caller sends **both** `busTypeId` and a raw `seatLayout` in the same PUT body (mirroring `createBus`'s mutual-exclusivity check), or should `busTypeId` simply take precedence and silently ignore `seatLayout`?
   - Recommended: Reject with 400 ("Supply either seatLayout or busTypeId, not both"), reusing the same mutual-exclusivity guard already written for `createBus`, so update and create have one consistent, unambiguous contract.
2. Should the destructive reseed run inside a MongoDB transaction (delete-then-insert atomically) to avoid a window where the bus has zero Seat documents if the process crashes mid-operation?
   - Recommended: Yes if the existing Mongo connection already supports transactions (replica set) — check how other multi-write operations in `tour-service` (e.g. `seat.service.ts` approve/cancel/swap) handle this and reuse the same pattern for consistency; if no existing precedent uses transactions, match that precedent (Mongo standalone deployments often don't support them) rather than introducing a new pattern for just this one path.
3. Should the endpoint response include any signal that a destructive reseed happened (e.g. `seatsReset: true`), or is silently returning the updated bus (as `createBus`/`updateBus` already do) sufficient?
   - Recommended: No new response field — the frontend already knows it sent `busTypeId` and already warned the admin before submitting, so the existing `toClientBus` response shape is sufficient and keeps the contract unchanged for this task's scope.

## Steps

1. `backend/tour-service/api/bus/bus.service.ts` — `updateBus`:
   - Add the same `hasSeatLayout`/`hasBusTypeId` mutual-exclusivity guard as `createBus` (pending answer to Open Question 1).
   - When `hasBusTypeId` is true: resolve the seatLayout via `await seatLayoutForBusTypeUuid(input.busTypeId)`, set `update.seatLayout = seatLayout`, then call a new helper (e.g. `reseedSeatsFromLayout(existing._id, seatLayout)`) instead of `resizeSeats`.
   - Add `reseedSeatsFromLayout(busId, seatLayout)`: compute positions via the existing `seatPositionsFromLayout(seatLayout)`, throw 400 if empty (matching `insertBus`'s guard), then `await Seat.deleteMany({ busId })` (hard delete, no `deletedAt` filter — remove every seat for this bus regardless of status) followed by `await Seat.insertMany(positions.map(position => ({ busId, position, status: "available" })))` — mirrors `insertBus`'s seat-creation block exactly.
   - Leave the existing `input.seatLayout`-only branch (raw seatLayout, no `busTypeId`) calling `resizeSeats` exactly as today — non-destructive resize behavior is unchanged.
   - Leave the `input.name`/`input.pickupPoints`-only branch (no `busTypeId`, no `seatLayout`) completely unchanged.
2. `backend/tour-service/api/bus/bus.controller.ts` — `update`: review only; the controller already forwards the full `req.body` (including `busTypeId`) to `busService.updateBus`, so no code change is expected unless Step 1's guard needs a distinct HTTP status mapping (it doesn't — `HttpError` already flows through the existing error middleware).
3. Update the JSDoc comment on `BusInput.busTypeId` in `bus.service.ts` (currently states "Ignored on update...") to describe the new destructive-update behavior, so the code comment doesn't contradict the implementation.
4. Cross-check `docs/api-contract/api-contract.tour-service.yaml`'s `/tour/{tourId}/buses/{busId}` PUT description (already updated per the task) against the final implementation; adjust only if wording drifts (e.g. mutual-exclusivity error, hard-delete semantics).

## Validation

- Unit/integration tests in `backend/tour-service` (wherever existing `bus.service`/`bus.controller` tests live) covering:
  - PUT with `busTypeId` on a bus that has seats in every status (`available`/`pending`/`taken`/`reserved`) → all old Seat docs gone (hard-deleted, not soft-deleted — verify via `Seat.countDocuments` including any `deletedAt`-scoped query bypass), new Seat docs created matching the BusType's layout, all `status: "available"`.
  - PUT with `busTypeId` pointing to a nonexistent/soft-deleted BusType uuid → 404, no seats touched (verify `resolveBusDoc`'s existing resolution semantics for BusType, likely reusing `seatLayoutForBusTypeUuid`'s own not-found handling).
  - PUT with both `busTypeId` and `seatLayout` → 400 per Open Question 1, no seats touched.
  - PUT with `busTypeId: null` (or omitted) and only `name`/`pickupPoints` → unchanged seatLayout, unchanged Seat documents (existing behavior, regression check).
  - PUT with raw `seatLayout` only (no `busTypeId`) on a bus with occupied seats being shrunk → still rejected with 400 via `resizeSeats`'s existing occupied-seat guard (regression check — confirms this plan didn't accidentally loosen the non-destructive path).
- Manual/QA pass through the admin UI: edit an existing bus, change its bus type on a bus with taken/pending/reserved seats, confirm the warning checkbox flow, submit, and verify the seat map fully resets to the new layout with all seats `available`.

## Risks

- **Data-integrity / irreversible data loss (tour-service):** this is an intentional, product-approved destructive operation, but a bug in the mutual-exclusivity guard or in resolving the wrong `busId` could hard-delete seats unexpectedly. Mitigated by scoping the delete strictly to `{ busId: existing._id }` (matching the already-resolved, tour-scoped bus) and by test coverage in Validation.
- **Security/authorization (admin-only mutation):** `PUT /tour/:tourId/buses/:busId` already requires admin auth per existing routing — confirm no regression to that guard while touching `bus.controller.ts`; flagged for the `security` agent given this is an admin mutation with PII-adjacent impact (destroys passenger seat assignments, even though passenger PII in `Seat` documents is also deleted as a side effect, which is arguably a privacy-positive but should be confirmed intentional).
- **Concurrency:** no seat-level locking is introduced here; a booking request (`POST .../seats/bookings`) racing with this destructive update could theoretically insert/act on a seat mid-reseed. Existing `tour-service` concurrency patterns (see `seat-concurrency-layer` skill) should be checked for whether this path needs the same protection — likely low risk since Open Question 2 (transactions) already covers the atomicity angle, but call out explicitly since PRD seat-concurrency rules exist for a reason.

## Rollout Order

1. Backend (`tour-service`) implementation and tests first — this is the only functional change; ship independently since the frontend contract (`busTypeId` always sent) and API contract docs are already in place.
2. No frontend deploy needed — `BusModal.tsx`/`bus.service.ts` already send the required payload shape per the task description.
3. QA validation pass after backend deploy, against a staging bus with occupied seats, before considering this done.

## Rollback

- Revert the `tour-service` change (Step 1) to restore the prior "seatLayout is intentionally not remapped on update" behavior for `busTypeId` on `PUT`. Since the frontend already always sends `busTypeId`, a rollback here would silently restore the *old* no-op-on-busTypeId behavior — no separate frontend rollback is needed, but note that reverting reintroduces the mismatch between docs/frontend behavior and backend behavior that this plan is meant to fix, so rollback should be a deliberate, short-lived measure only.
