All checks complete. Summary of what I built:

**New files**
- `frontend/src/types/busType.types.ts` — `BusType` / `BusTypeInput` matching the contract's schemas.
- `frontend/src/lib/busTypeLayout.ts` — pure layout math (`calculateTotalSeatsFromLayout`, `buildNumberedGrid`, `createDefault55BusTypeInput`), numbering identical to the server's template→`seatLayout` order (row by row, col 1→4, then bench; doorway cols 3-4 and disabled slots skipped).
- `frontend/src/services/busType.service.ts` — `query/create/update/duplicate/remove` over `/busType`, mapping raw docs and writing the store itself. `totalSeats` is never sent (server-derived).
- `frontend/src/store/slices/busType.slice.ts` — `busTypes`, `selectedBusTypeId`, upsert (mirrors single-default exclusivity), remove.
- `frontend/src/components/BusTypeManagement.tsx` — adapted from the design source: grid/door/back-row visual builder and RTL layout kept as-is; **all `lib/storage` + `data/initialData` usage removed** (no `localStorage`, no "reset to presets" — there is no seeded-preset concept server-side), `window.confirm`/`alert` replaced with `ConfirmModal` + inline validation, API failures via `sonner`, tagged `[BUS_TYPE]` logs.
- Tests: `busTypeLayout.test.ts`, `busType.service.test.ts`, `BusTypeManagement.test.tsx`.

**Changed**
- `Header.tsx` / `App.tsx` / `AdminDashboardPage.tsx` — new top-level admin tab `ניהול דגמי אוטובוס` at `/admin/bus-types` (per Open Question 3's human answer); the bus-types tab renders even with zero tours, since templates are tour-independent.
- `BusModal.tsx` — "create from BusType" dropdown on create only (preselects the `isDefault` template); editing never sends `busTypeId`, so existing seat maps are never remapped.
- `bus.service.ts` — `save(tourId, bus, busTypeId?)` sends `busTypeId` **xor** `seatLayout`, never both (F11's 400 rule).
- Fixed two now-stale assertions in `BusModal.test.tsx` and `Header.test.tsx` (the latter targeted the commented-out report tab and was already failing).

Two notes: **duplicate** is implemented as `POST /busType` with a copied layout + `(עותק)` name — the contract exposes no `/duplicate` path, and a copy keeps no reference to its source, so it's equivalent and still persisted server-side immediately. No contract edits were needed; `/busType` paths and `BusInput.busTypeId` were already present.

31 test failures remain in 7 pre-existing files (PassengerManifestReport, SeatManagement, TourManagement, GatewayPage, PassengerViewPage, BusMap, GatewayAdminLogin) — all unrelated to this ticket (missing-text/role assertions against components I didn't touch); the count went from 33 → 31 because I fixed the two my change touched.

=== FRONTEND AGENT REPORT ===
```
Ticket: AGE-306
Pages built/changed: AdminDashboardPage.tsx (new 'bus-types' tab), App.tsx (/admin/bus-types route)
Components built/changed: BusTypeManagement.tsx (new, adapted from raw_from_ai_studio), common/Header.tsx (new admin tab), modals/BusModal.tsx (create-from-template)
Services built/changed: busType.service.ts (new), bus.service.ts (busTypeId XOR seatLayout)
Store slices built/changed: busType.slice.ts (new), store.ts (slice wired in)
Lib: busTypeLayout.ts (new)
Types: busType.types.ts (new)
Lint: PASS
Build: PASS
Tests: 223 passed, 31 failed (all 31 pre-existing and unrelated; every new/touched test passes — 5 BusTypeManagement, 7 busType.service, 9 busTypeLayout, 14 BusModal, 18 Header)
API contracts:
  - docs/api-contract/api-contract.tour-service.yaml (already contained /busType paths + BusInput.busTypeId; no changes required)

Handoff to Backend Agent:
- Implement endpoints per service contract above
- Frontend calls: GET /busType, POST /busType, PUT /busType/:id, DELETE /busType/:id
- Duplicate is a client-side copy sent as POST /busType — no /duplicate endpoint needed
- POST /tour/:tourId/buses receives either busTypeId or seatLayout, never both
- See .rule/database-rules.md for collection schemas

STATUS: DONE
```

STATUS: DONE