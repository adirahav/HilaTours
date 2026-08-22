The frontend side of the fix is complete. Summary of what I changed:

**The fix, end to end (frontend half):**
- `Bus` now carries `busTypeId` and a `grid` (`BusGrid`) — the live-joined BusType layout the backend resolves at read time.
- `mapSeatsInternal` prefers the server-supplied per-seat `row`/`col` and only falls back to `generateBusSeats` when they're absent — so numbering is never re-derived client-side for a template-derived bus (the drift risk plan 037 called out). A half-supplied `row`/`col` pair is treated as absent rather than placing a seat at a plausible-but-wrong cell.
- `BusMap` now derives its row count, door row and back-bench width from the grid when present. The bench is laid out by `col` across the template's declared width, so a disabled mid-bench slot renders as an empty cell instead of being packed out — the exact reported bug. Rows whose slots are all disabled still render, preserving vertical gaps too. Manual buses keep the hardcoded `BACK_DOOR_ROW`/`BACK_ROW_SEAT_COUNT` path untouched.
- Added `role="group"` + Hebrew `aria-label`s to each row and to the bench (a11y win, and gave the tests a stable hook).
- `BusTypeManagement` warns (never blocks) when editing a template referenced by N buses, driven by a new server-computed `BusType.busCount`. Also corrected the delete-confirmation copy, which claimed buses "won't change" — with a live join that's now false.

**Two judgment calls worth flagging:**
1. For the in-use count I chose a server-computed `busCount` on the BusType response over counting client-side, since the admin store doesn't hold buses across all tours. It degrades to `0` (warning hidden) if the backend hasn't shipped it — never a wrong count.
2. I corrected several now-false "editing a BusType never retroactively changes existing buses" claims in the contract (BusType schema, `PUT /busType/{id}`) and in code comments, since the live join inverts that guarantee.

**On the test suite — please read:** the repo has a **pre-existing broken baseline of 37 failing tests across 9 files**, including files this ticket never touched (`GatewayAdminLogin`, `GatewayPage`). They fail because tests reference UI that doesn't exist in the components (e.g. BusMap's "מצב העברה" toggle, SeatManagement's bulk-approve button). I did **not** fix these — they're outside this ticket and look like separate unfinished work. My change introduced zero new failures: failures stayed at exactly 37 while passing rose 217 → 232 (+15 new tests). I did not stash/revert to prove the baseline, per your standing preference that I not run mutating git commands; the evidence is that untouched files fail identically.

=== FRONTEND AGENT REPORT ===
```
Ticket: AGE-318
Pages built/changed: PassengerViewPage.tsx (passes bus grid to BusMap)
Components changed: bus/BusMap.tsx (grid-driven rows/door/bench), BusTypeManagement.tsx (in-use warning + corrected delete copy), SeatManagement.tsx (passes grid)
Services built/changed: busType.service.ts (busCount mapping, corrected soft-delete comment)
Store slices built/changed: none
Types changed: bus.types.ts (BusGrid, Bus.busTypeId/grid), busType.types.ts (busCount)
Lib changed: tourMapper.ts (server row/col preference, busTypeGrid mapping)
Lint: PASS
Build: PASS
Tests: 232 passed, 37 failed — all 37 pre-existing and unrelated (unchanged from baseline; 15 new tests added, all passing)
API contracts:
  - docs/api-contract/api-contract.tour-service.yaml

Handoff to Backend Agent:
- Emit Bus.busTypeGrid (standardRowsCount/doorRow/backRowSeatsCount/disabledSeatSlots) and per-seat row/col on all three read paths (listBuses, listBusesWithPublicSeats, getBusWithSeats)
- Add row/col to PublicSeat explicitly — do NOT widen PUBLIC_SEAT_FIELDS (SEV-001)
- Emit BusType.busCount for the admin edit-in-use warning
- Render join must resolve soft-deleted BusTypes; admin picker/list must not
- See .rule/database-rules.md for collection schemas

STATUS: DONE
```