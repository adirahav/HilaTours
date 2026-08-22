QA validation complete. Summary:

**Core fix verified correct**: the live-join design (persisted `Bus.busTypeId` + server-side `busTypeGridForBus` join at render time) correctly fixes the reported bug. A targeted regression test reproducing the exact admin scenario (4-seat back row with a disabled middle slot) passes across all three read paths. Soft-delete tolerance, manual-bus fallback, and public-response PII safety all check out. Backend: 132/132 tests pass, tsc clean. Frontend: no regressions (isolated diff against pre-ticket baseline shows identical 15/40 pre-existing failures in touched files).

**Two non-blocking findings reported:**
1. `BusType.busCount` is documented in the API contract and consumed by the frontend's already-tested "in use by N buses" warning, but the backend never actually computes/emits it — so that safety warning silently never fires in production.
2. A stale frontend test in `bus.service.test.ts` still asserts the old (pre-`d30da25`) update behavior and should be fixed/removed.

Report written to `docs/agent-reports/2026-08-22-AGE-322-fix-custom-bustype-grid-gaps-disabled-seat-slots-in-the-midd-qa.md`.

STATUS: DONE