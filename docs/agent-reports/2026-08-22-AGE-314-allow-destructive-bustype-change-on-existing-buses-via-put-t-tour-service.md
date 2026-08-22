Implementation complete and consistent with the already-updated API contract (which describes reseed-by-position, matching my implementation).

**What changed** — `backend/tour-service/api/bus/bus.service.ts` only:

- New `reseedSeatsByPosition(busId, seatLayout)`: matches old/new positions by exact string. Common positions keep their existing Seat doc completely untouched (status + all passenger PII/timestamps survive), positions only in the new layout are inserted `available`, positions only in the old layout are hard-deleted with their occupant. Deletes run before inserts so the `busId + position` unique index can't collide.
- `updateBus`: when `busTypeId` is present (non-null), it resolves the template via the existing `seatLayoutForBusTypeUuid` **first** (so an unknown/soft-deleted uuid 404s before any seat is touched), sets `update.seatLayout`, then reseeds. `busTypeId` takes precedence and silently ignores a raw `seatLayout` in the same body (Open Q1 human answer). The raw-`seatLayout`-only branch still calls `resizeSeats` unchanged, and the name/pickupPoints-only branch is untouched.
- Corrected the now-contradictory `BusInput.busTypeId` JSDoc ("Ignored on update").

`bus.controller.ts` needed no change — it already forwards the full body, and `HttpError` flows through existing middleware. No transactions: I checked, `tour-service` has zero `startSession`/`withTransaction` precedent, so per Open Q2 I matched existing practice rather than introducing a new pattern.

**Note on the task description vs. the approved plan:** your brief said hard-delete *all* seats and recreate. I implemented the **approved plan** (035), which explicitly supersedes that after human review — blanket-wiping would lose a passenger in seat "1" even when switching to a bigger type that still has seat "1".

**Out of my scope, still open:** plan steps 4–5 (`frontend/src/modals/BusModal.tsx` warning text and `frontend/src/services/bus.service.ts` comment) still claim ALL assignments are lost — that wording is now inaccurate and needs the frontend agent. Step 6 (contract) was already done correctly.

=== BACKEND AGENT REPORT ===
```
Ticket: AGE-314
Service: tour-service
Date: 2026-08-22

Endpoints implemented:
PUT /tour/{tourId}/buses/{busId} ✓ (busTypeId now regenerates seatLayout + reseeds seats by position)
  - all other bus/tour/seat/manifest/busType routes unchanged, re-verified green

Mongoose models: Tour, Bus, Seat, BusType (no schema changes)

Unit tests: 122 passed, 0 failed (7 new in api/__tests__/bus-reseed.test.ts)
  - bigger template: occupant at seat "1" preserved, new tail seats available, 67 total
  - smaller template: seat "55" occupant hard-deleted, seat "2" occupant preserved, 43 total
  - pending/taken/reserved at common positions all preserved with PII
  - unknown busTypeId -> 404, zero seats touched
  - busTypeId + seatLayout together -> busTypeId wins, seatLayout ignored
  - name/pickupPoints only (busTypeId null) -> same Seat _id, untouched
  - regression: raw seatLayout shrink below occupied seat still 400 via resizeSeats

tsc --noEmit: clean

To run:
cd backend/tour-service && npm run dev   # port 3033
```
STATUS: DONE