All 132 tests pass and `tsc --noEmit` is clean. Here's what I changed in `tour-service`:

**`api/models/bus.model.ts`** — added `busTypeId: ObjectId | null` (`ref: "BusType"`, indexed, `default: null`), documented as a *live* reference, not a snapshot.

**`api/busType/busType.service.ts`**
- Extracted `seatGridFromBusType()` — the single row/col/gap walk, returning `{ position, row, col }[]`. `seatPositionsFromBusType()` is now just `.map(s => s.position)` over it, so counting and rendering can never drift (that drift *is* the bug).
- `resolveBusTypeForBusRender()` — soft-delete-tolerant (`deletedAt: { $exists: true }` opts out of the model's implicit live-only scope). Returns `null` instead of throwing on a dangling ref, so a bad ref degrades to the fallback rather than 404-ing a valid bus. `resolveBusTypeDoc`/`listBusTypes`/`getBusType`/`seatLayoutForBusTypeUuid` are untouched and still live-only.
- `busTypeGridForBus()` — the read-side entry point; `resolveBusTypeObjectId()` for the write side.

**`api/lib/clientShape.ts`** — `toClientBus` takes an optional pre-resolved grid and emits `busTypeId` (uuid, never the ObjectId) + `busTypeGrid`.

**`api/bus/bus.service.ts`** — `createBus`/`updateBus` persist `busTypeId`; all three read paths (`listBuses`, `listBusesWithPublicSeats`, `getBusWithSeats`) attach the live grid.

Two judgment calls worth your attention:

1. **A raw `seatLayout` on update now clears `busTypeId`.** Not in the plan, but without it a bus converted from template → hand-made layout would keep having the stale template's grid override what the admin just configured. Covered by a test.
2. **I did not add a `busCount` field/endpoint** for the "in use by N buses" edit warning. The plan left that open between a backend field and a client-side count; a backend field needs a contract change I can't make (below), and the frontend already has the bus list loaded — so client-side counting is the cheaper correct wiring.

**Three files the plan assigns to this ticket are outside my write scope** and need to be picked up by you or another agent:
- `docs/api-contract/api-contract.tour-service.yaml` — needs `busTypeId` (uuid, nullable) and `busTypeGrid` (nullable object: `standardRowsCount`, `doorRow`, `backRowSeatsCount`, `disabledSeatSlots`, `seats: [{position, row, col}]`) on the `Bus` schema. Both additive/non-breaking. **The implementation currently runs ahead of the contract.**
- `.rule/database-rules.md` — new `Bus.busTypeId` field + live-join semantics.
- `docs/PRD.md` F11 — still claims editing a BusType never retroactively affects existing buses; that is now the opposite of the truth.

I also corrected the same stale claim in `busType.model.ts`'s docblock and `softDeleteBusType`'s comment, both of which are in my scope.

=== BACKEND AGENT REPORT ===
```
Ticket: AGE-320
Service: tour-service
Date: 2026-08-22

Endpoints implemented (response-shape change only — no new routes):
GET  /api/tour/:tourId                      ✓ (public: buses now carry busTypeId + busTypeGrid)
GET  /api/tour/:tourId/buses                ✓
GET  /api/tour/:tourId/buses/:busId         ✓
POST /api/tour/:tourId/buses                ✓ (persists busTypeId)
PUT  /api/tour/:tourId/buses/:busId         ✓ (re-points or clears busTypeId)
DELETE /api/busType/:busTypeId              ✓ (no longer orphans referencing buses)

Mongoose models: Tour, Bus (+busTypeId), Seat, BusType

Unit tests: 132 passed, 0 failed (18 new in api/__tests__/busType-grid.test.ts)
Type-check: tsc --noEmit clean

To run:
cd backend/tour-service && npm run dev   # port 3033
```
STATUS: DONE