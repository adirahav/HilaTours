All checks pass. Verified the only `localStorage`/`lib/storage` occurrences are explanatory comments, not usage.

## Summary

The prior run hit a session limit partway through, so most of the frontend was already written. I verified all of it, then found and fixed the two things that were genuinely incomplete or broken:

**1. The API contract was missing all four `/attendance` paths.** The prior run wrote the `AttendanceSession`/`AttendanceRecord`/`AttendanceSessionInput`/`AttendancePresenceRequest` schemas but was cut off before the `paths:` section. I added `/attendance/session` (GET/POST), `/attendance/session/{sessionId}` (GET/DELETE), `.../reset` (POST), and `.../presence` (POST), documenting the permission split, the admin-room-only socket emission, and the deliberate absence of a server-side date gate.

**2. The route guard broke the AdminDashboardPage test suite.** Adding `useNavigate()` for the attendance redirect made all 6 tests fail — the suite's `react-router-dom` mock only stubbed `useLocation`. This was a real regression from this ticket, so I fixed the mock, stubbed `AttendanceManagement`, and added three tests covering the date guard (renders on the tour date, redirects otherwise, and does *not* redirect before the first tour fetch resolves — that last one protects the deliberate `tours.length > 0` condition that stops a boot-time empty list from bouncing the guide off the tab).

**One incidental fix:** the contract was unparseable YAML even at `HEAD` — `SeatManualAssignRequest` had a duplicate `required:` key listing `passengerPhone` as required, directly contradicting its own description ("Only `passengerName` is required"). I removed the stray block; the contract now parses.

**On the test suite:** 37 tests across 9 files still fail. I confirmed via a clean `git stash` baseline that these are **pre-existing and unrelated** — identical failures in identical files at `HEAD` (BusMap, GatewayAdminLogin, PassengerManifestReport, SeatManagement, TourManagement, BusModal, GatewayPage, PassengerViewPage, bus.service). My changes took passing tests from 232 → 260. I restored the stash afterward and verified the working tree is intact. I did not commit anything.

=== FRONTEND AGENT REPORT ===
```
Ticket: AGE-324
Pages built/changed: AdminDashboardPage.tsx (attendance tab + date route guard), App.tsx (/admin/attendance route)
Components built/changed: components/AttendanceManagement.tsx (new, adapted from raw_from_ai_studio — localStorage removed), components/common/Header.tsx (conditional day-of-tour tab), components/SeatManagement.tsx (mirrors tour selection into store)
Services built/changed: services/attendance.service.ts (new), services/socket.service.ts (attendance:update listener)
Store slices built/changed: store/slices/attendance.slice.ts (new), store/store.ts
Libs/hooks: lib/attendanceGrouping.ts (new), lib/selectedTour.ts (new), lib/tourDate.ts (isTourToday), hooks/useAttendanceSocket.ts (new), types/attendance.types.ts (new)
Lint: PASS
Build: PASS
Tests: 260 passed, 37 failed — all 37 pre-existing and unrelated (verified identical at HEAD via clean stash baseline; 232 passed before my changes)
  New tests: lib/attendanceGrouping.test.ts (21), lib/tourDate.test.ts isTourToday (5), pages/AdminDashboardPage.test.tsx date guard (3)
API contracts:
  - docs/api-contract/api-contract.tour-service.yaml

Handoff to Backend Agent:
- Implement the five endpoints per the contract above; all gated by attendance:view / attendance:manage, with NO server-side date check (UI-only gate, plan 038 OQ2)
- POST /presence is the single mutation behind individual, party, and station-batch gestures; it must return the FULL session
- attendance:update must broadcast to the per-bus ADMIN room only — records carry passenger PII (SEV-001)
- DELETE hard-deletes session + records (no soft-delete)
- Frontend maps the record's pickup field from `pickupPointName` (Seat-schema naming)
- See .rule/database-rules.md for collection schemas

STATUS: DONE
```

STATUS: DONE