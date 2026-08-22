Backend implementation is complete and verified. All work stayed inside `backend/tour-service/**` — I did not touch `frontend/**` (the frontend agent already shipped its side under AGE-306) or the other services.

**What I built**

- **`api/models/busType.model.ts`** — own top-level `busType` collection, `applyUuidIdentity` + `pre(/^find/)` soft-delete scoping, exactly mirroring `bus.model.ts`.
- **`api/busType/busType.service.ts`** — CRUD + the authoritative `seatLayoutFromBusType` generator. Numbering (row → cols 1-4 → back bench, skipping doorway cols 3-4 and disabled slots) matches `frontend/src/lib/busTypeLayout.ts` exactly; both back-bench key forms (`14-2` and legacy `back-2`) are honoured. `totalSeats` is always recomputed server-side and never read from the request body. Single-`isDefault` exclusivity is one `updateMany` scoped to `_id: { $ne: winner }`, so concurrent edits converge on one winner rather than leaving two flagged.
- **`api/busType/busType.controller.ts` + `.routes.ts`** — mounted in `app.ts`; every route admin-only per the contract's `security` blocks, gated on new `busType:view/insert/update/delete` keys added to `api/auth/permissions.ts`.
- **`api/bus/bus.service.ts`** — `BusInput.busTypeId`; `createBus` enforces the F11 XOR (both → 400, neither → 400, unknown/soft-deleted template → 404). Conversion is a one-time copy, so `updateBus` deliberately ignores `busTypeId` and existing seat maps are never remapped.
- **`api/lib/clientShape.ts`** — `toClientBusType`, keeping `_id`/`uuid` internal.

**Three things needing action outside my scope**

1. `backend/user-management-service/api/scripts/seed.ts` doesn't seed `busType:*` permission rows. Authorization still works today (the JWT carries only `roles`, and tour-service resolves those locally), but the RBAC admin UI won't list these four permissions until seeded.
2. `docs/api-contract/api-contract.tour-service.yaml` has no `GET /busType/{busTypeId}`, though PRD F11 lists `GET` on that path. I implemented it (PRD-backed, `busType:view`); the contract should gain that path for consistency. The contract also has no `/duplicate` path — the frontend does duplicate as a plain `POST /busType`, so I built no duplicate endpoint despite the plan mentioning one.
3. `.rule/database-rules.md` doesn't document the new `busType` collection.

=== BACKEND AGENT REPORT ===
```
Ticket: AGE-308
Service: tour-service
Date: 2026-08-22

Endpoints implemented:
GET    /tour-service/api/busType                     ✓ (busType:view)
POST   /tour-service/api/busType                     ✓ (busType:insert)
GET    /tour-service/api/busType/:busTypeId          ✓ (busType:view — PRD F11; not yet in contract)
PUT    /tour-service/api/busType/:busTypeId          ✓ (busType:update)
DELETE /tour-service/api/busType/:busTypeId          ✓ (busType:delete, soft-delete)
POST   /tour-service/api/tour/:tourId/buses          ✓ (extended: seatLayout XOR busTypeId)

Mongoose models: BusType (new, collection "busType"); Tour, Bus, Seat (unchanged)

Unit tests: 115 passed, 0 failed (27 new in api/__tests__/busType.test.ts)
Type-check: tsc clean

To run:
cd backend/tour-service && npm run dev   # port 3033

STATUS: DONE
```

STATUS: DONE