QA validation complete. Summary:

**Backend (tour-service)** — implementation matches the human-approved plan (reseed-by-position, not blanket wipe): `updateBus`/`reseedSeatsByPosition` correctly preserve occupied seats at positions common to old/new layouts, hard-delete only dropped positions, 404 on unknown busTypeId before touching seats, `busTypeId` wins over raw `seatLayout`. All 122 backend tests pass (incl. 7 dedicated reseed tests). API contract doc matches.

**Frontend** — `BusModal.tsx`/`bus.service.ts` correctly implement the new always-send-busTypeId + confirm-checkbox UX; `tsc --noEmit` clean. But found **stale tests** not updated to match: `bus.service.test.ts` still asserts the old "never sends busTypeId on update" contract, and 5 `BusModal.test.tsx` tests query removed UI elements (old radio-group bus-size picker). One unrelated `BusMap.test.tsx` failure looks like a pre-existing flake (file untouched this session).

**e2e** — no e2e suite exists in this repo.

Report written to `docs/agent-reports/2026-08-22-AGE-316-allow-destructive-bustype-change-on-existing-buses-via-put-t-qa.md`, flagging the stale frontend tests for the frontend agent to fix.

STATUS: DONE