QA validation complete — **Pass with issues**.

**Highlights:**
- AC-12/13/14 all correctly implemented and verified (date-gated tab, station/party toggle grouping, WhatsApp copy summary).
- Backend (`tour-service`): attendance models/service/controller/routes, permissions, admin-room-only socket broadcast all correct. 155/155 tests pass, `tsc` clean.
- Frontend: no localStorage remains, grouping logic (bookingGroupId→phone→name) correct, lint/build clean, 260/260 relevant tests pass (37 pre-existing unrelated failures independently verified).
- API contract matches implementation; common-service correctly out of scope.

**Bug found (low severity):** `backend/tour-service/api/attendance/attendance.service.ts:88-92` — seat lookup filters `deletedAt: { $exists: true }` instead of `deletedAt: null`, which matches all seats (including soft-deleted ones) rather than excluding them. Should be fixed before shipping.

**Gap (pre-existing):** no e2e suite exists in the repo at all; coverage here is unit/component-level only, and two-device real-time sync was verified by code inspection rather than live testing.

Report written to `docs/agent-reports/2026-08-24-AGE-328-attendance-management-new-header-tab-visible-only-on-the-tou-qa.md`.

STATUS: DONE