# 038 — Attendance Management (בדיקת נוכחות): new `Header` tab, tour-day-only, server-persisted sessions

Status: done
Owner: orchestrator
Last updated: 2026-08-24
Scope-Agents: frontend, tour-service, qa, security

## Goal
Give the guide/admin a mobile-friendly, real-time attendance tool for the day of a tour: a new top-level `Header` tab ("בדיקת נוכחות") that is visible **only** when the current date equals the selected tour's date, and hidden otherwise. Attendance sessions and per-passenger records are persisted server-side in `tour-service` (new `attendanceSession`/`attendanceRecord` collections, broadcast over the existing socket.io channel) so multiple devices watching the same bus stay in sync in real time — replacing the prototype's `localStorage`/tab-sync approach in `raw_from_ai_studio/src/components/AttendanceManagement.tsx`. Per PRD Screen 5 / F12–AC-12..14.

## Scope
- `backend/tour-service/api/models/attendanceSession.model.ts` (new): uuid identity, soft-delete-free (sessions are hard-deleted per PRD "sessions can be ... deleted"), fields `tourId` (ObjectId ref Tour), `busId` (ObjectId ref Bus), `title`, `createdAt`, `createdBy` (admin uuid string, internal-only like `Seat.assignedBy`).
- `backend/tour-service/api/models/attendanceRecord.model.ts` (new): uuid identity, `sessionId` (ObjectId ref AttendanceSession), snapshot fields captured at session-creation time — `seatId` (ObjectId ref Seat), `seatPosition`, `passengerName`, `passengerPhone`, `pickupPoint`, `bookingGroupId` (nullable — mirrors `Seat`'s existing party-grouping signal if present, else derived at snapshot time the same way the prototype does: phone, else name), `isPresent: boolean` (default `false`), `checkedInAt: Date | null`.
- `backend/tour-service/api/attendance/attendance.service.ts`, `attendance.controller.ts`, `attendance.routes.ts` (new): mirrors `busType`/`bus` module conventions (`resolveObjectId`/`resolveDoc`, `toClientX` shaping, `requirePermission`).
  - `createSession(tourId, busId, title, adminUuid)`: snapshots every `taken`/`reserved` `Seat` with a non-null `passengerName` on that bus into `AttendanceRecord`s.
  - `listSessions(tourId, busId)`, `getSession(sessionId)` (records included/populated).
  - `resetSession(sessionId)`: sets every record's `isPresent=false`, `checkedInAt=null`.
  - `deleteSession(sessionId)`: hard-deletes the session and its records.
  - `setRecordsPresence(sessionId, recordIds[], isPresent)`: single mutation used for individual toggle, party toggle (multiple `recordIds`), and station batch-check (caller resolves the id list from station membership) — one code path, no separate per-station DB method.
- `backend/tour-service/api/app.ts`: mount new `attendanceRouter`.
- `backend/tour-service/api/lib/socket.ts`: add `attendance:update` broadcast (admin-room only, per-bus — reuses `adminRoom(busUuid)`; no public/PII-stripped variant needed since this tab is admin/guide-only) emitted after every mutating attendance call, so a second device viewing the same bus's attendance tab updates live instead of polling.
- `backend/tour-service/api/auth/permissions.ts`: add `attendance:view`/`attendance:manage` permissions, granted to the existing admin role the same way `bus:*`/`busType:*` were (plan 032/034 pattern).
- `docs/api-contract/api-contract.tour-service.yaml`: add `AttendanceSession`/`AttendanceRecord` schemas and `/attendance/session` (`GET`/`POST`), `/attendance/session/{sessionId}` (`GET`/`DELETE`), `/attendance/session/{sessionId}/reset` (`POST`), `/attendance/session/{sessionId}/presence` (`POST`, body `{recordIds: string[], isPresent: boolean}`) paths.
- `frontend/src/types/attendance.types.ts` (new), `frontend/src/services/attendance.service.ts` (new), `frontend/src/store/slices/attendance.slice.ts` (new) — mirrors `busType.types.ts`/`busType.service.ts`/`busType.slice.ts`, plus a socket listener for `attendance:update` (mirrors the existing seat socket-sync pattern) instead of the prototype's `storage` tab-sync event.
- `raw_from_ai_studio/src/components/AttendanceManagement.tsx` → adapted into `frontend/src/components/admin/AttendanceManagement.tsx`: remove `lib/storage` (`getAttendanceSessions`/`createAttendanceSession`/`batchCheckGroupSeats`/`batchCheckPickupPoint`/`resetAttendanceSession`/`deleteAttendanceSession`) usage entirely; wire to the new store slice/service/socket. Keep the visual structure (session pills, station cards, party toggle cards, search bar, copy-summary button) as-is — only the persistence layer changes.
- `frontend/src/components/common/Header.tsx`: add a new `AdminTab` entry `'attendance'` → `/admin/attendance`, rendered conditionally — only shown when `today === selectedTour.date` (date-only compare, ignoring time-of-day) for the currently selected tour; hidden from both the desktop `nav` and the mobile tab bar otherwise. Route guard in the page/router layer redirects away from `/admin/attendance` if the date condition stops holding (e.g. tab left open past midnight).
- `frontend/src/App.tsx` (or wherever `/admin/*` routes are declared — confirm exact router file during implementation): add the `/admin/attendance` route rendering the new component, gated by the same date check server-side isn't needed (read-only UI gate), but the underlying API endpoints are still permission-gated regardless of date (date is a UI convenience, not a security boundary — see Open Question 2).
- No changes to `user-management-service` or `common-service`.

## Assumptions
- `attendanceSession`/`attendanceRecord` are new top-level Mongo collections in `tour-service` (same DB as `Tour`/`Bus`/`Seat`), not embedded documents — consistent with how `busType` was added as its own collection in plan 034, and needed because records reference seats by `ObjectId`.
- "Missing" status in the PRD is represented as `isPresent: false` (boolean), not a tri-state enum — the prototype only ever shows present/missing, never a third state, so a boolean is sufficient and simpler than introducing a `status` enum.
- A session snapshot is a **point-in-time copy**: later changes to `Seat.passengerName`/`pickupPointName` (e.g. an admin edits a booking after the session was created) do **not** retroactively update existing `AttendanceRecord`s. This matches the prototype's snapshot semantics ("Creating a session snapshots every taken/reserved seat ... at that moment").
- `bookingGroupId` does not currently exist on the `Seat` model (confirmed: `seat.model.ts` has no such field). The party-grouping fallback chain from the prototype (`bookingGroupId` → phone → name) is preserved, but in production `bookingGroupId` will simply always be absent until/unless a future ticket adds real booking-group linkage to `Seat` — so today's grouping effectively degrades to phone-then-name. This is called out explicitly rather than silently dropping the `bookingGroupId` tier, so no rework is needed if that field is added later.
- Real-time sync only needs to reach other **admin** clients (the guide/office viewing the same bus's attendance from two phones) — there is no passenger-facing attendance view, so only the existing `adminRoom` broadcast pattern is reused; no new public/stripped variant is needed.
- The `/admin/attendance` tab reuses the existing tour/bus selector pattern (`selectedTourId`/`selectedBusId` from the store) already used by `SeatManagement`/`AttendanceManagement`'s own prototype props, rather than inventing a new selector.

## Open Questions (resolved 2026-08-24)
1. Should the tour-day visibility check use the server's/browser's local date or a fixed timezone (e.g. Asia/Jerusalem), given tours could be viewed by an admin abroad?
- Recommended: compare using the browser's local date against the tour's stored date at day granularity (`toDateString()`-style comparison) — simplest, matches how the rest of the app already renders dates (`toLocaleDateString('he-IL')`), and the guide/admin using this feature in the field is always physically local to the tour.
- *HUMAN ANSWER:* Approved as recommended — browser-local date, day-granularity compare.

2. Should the `/attendance/*` API endpoints themselves enforce "only callable on the tour's date," or is that purely a UI-level tab-visibility convenience with no server-side date gate?
- Recommended: UI-only gate — the server enforces the existing `attendance:view`/`attendance:manage` permission checks (same as every other admin endpoint) but does not additionally reject requests based on date, since a guide might legitimately review yesterday's session after midnight, or an admin might reasonably need to pre-create a session shortly before the tour date rolls over; a hard server-side date lock adds complexity with no real security benefit (date is not a trust boundary here).
- *HUMAN ANSWER:* Approved as recommended — UI-only gate, no server-side date enforcement.

3. Does creating a new session need to block/warn if an identical-purpose session (e.g. same title) already exists for that bus, or is unlimited free-form session creation fine as in the prototype?
- Recommended: no blocking — keep the prototype's behavior of unlimited free-form sessions per bus (multiple sessions are an explicit PRD feature: "one for morning departure, one for the evening return"), with no uniqueness constraint on `title`.
- *HUMAN ANSWER:* Approved as recommended — no blocking, unlimited free-form sessions, no title uniqueness constraint.

## Steps
1. **backend/tour-service — models** (tour-service agent):
   - `models/attendanceSession.model.ts` and `models/attendanceRecord.model.ts` per Scope, both using `applyUuidIdentity` like every existing model; add indexes `{ tourId: 1, busId: 1 }` on session and `{ sessionId: 1 }` on record for fast per-bus/per-session lookups.
2. **backend/tour-service — permissions** (tour-service agent):
   - `auth/permissions.ts`: add `attendance:view`, `attendance:manage`; grant to admin role alongside existing `bus:*`/`busType:*` grants.
3. **backend/tour-service — service/controller/routes** (tour-service agent):
   - `attendance/attendance.service.ts`: `createSession` (snapshot logic reading `Seat.find({busId, status: {$in: ["taken","reserved"]}, passengerName: {$ne: null}})`, deriving `bookingGroupId` fallback per Assumptions), `listSessions`, `getSession`, `resetSession`, `deleteSession`, `setRecordsPresence`.
   - `attendance.controller.ts` + `attendance.routes.ts`: REST endpoints under `requirePermission("attendance:view"|"attendance:manage")` per method, mirroring `busType.routes.ts` structure.
   - `app.ts`: mount `attendanceRouter`.
4. **backend/tour-service — realtime** (tour-service agent):
   - `lib/socket.ts`: add `emitAttendanceUpdate(busUuid, session)` (admin-room only); call it from every mutating `attendance.controller.ts` handler after a successful write.
5. **docs/api-contract/api-contract.tour-service.yaml** (tour-service agent):
   - Add `AttendanceSession`/`AttendanceRecord` schemas and the five paths listed in Scope.
6. **frontend/src/types/attendance.types.ts, services/attendance.service.ts, store/slices/attendance.slice.ts** (frontend agent):
   - Mirror `busType.*` conventions; slice subscribes to `attendance:update` socket events (reuse the existing socket client already used for `seat:update`) to merge live updates into store state.
7. **frontend/src/components/admin/AttendanceManagement.tsx** (frontend agent, adapted from `raw_from_ai_studio/src/components/AttendanceManagement.tsx`):
   - Remove all `lib/storage` imports/usage; replace `getAttendanceSessions`/`createAttendanceSession`/`batchCheckGroupSeats`/`batchCheckPickupPoint`/`resetAttendanceSession`/`deleteAttendanceSession` calls with the new slice/service calls (batch-check-station and party-toggle both call the single `setRecordsPresence` action with the appropriate `recordIds` list, per Scope's `attendance.service.ts` design).
   - Keep grouping-by-pickup-point, grouping-by-party (bookingGroupId → phone → name fallback), search filter, `tel:` links, and `handleCopySummary` WhatsApp-text-report logic exactly as in the prototype — only the data source changes.
8. **frontend/src/components/common/Header.tsx** (frontend agent):
   - Add `'attendance'` to `ADMIN_TABS`, computed conditionally (not a static array entry) based on `today` vs. the selected tour's `date` per Open Question 1's recommendation; hide from both desktop `nav` and mobile tab bar when the condition is false.
9. **frontend router file (confirm exact path, e.g. `frontend/src/App.tsx`)** (frontend agent):
   - Add `/admin/attendance` route; if a user navigates there directly on a non-matching day, redirect to `/admin/seats` (defensive UI-only guard, consistent with Open Question 2).
10. **security** (security agent): review new `attendance:*` permission wiring on all five endpoints, confirm the admin-room-only socket broadcast never reaches a non-admin/public socket (no PII leak of passenger names/phones), and confirm hard-delete-on-session-delete doesn't orphan any `Seat` reference (records only reference seats, never the reverse).

## Validation
- `backend/tour-service`: `npm --prefix backend/tour-service run test` covering `attendance.service.ts` — session creation snapshot correctness (only `taken`/`reserved` seats with a passenger are captured), party-grouping fallback chain, `setRecordsPresence` for individual/party/station-batch cases, reset (clears all `isPresent`), delete (removes session + records).
- `frontend`: `npm --prefix frontend run lint`; manually confirm no `localStorage`/`lib/storage` reads remain in the adapted `AttendanceManagement.tsx`.
- Manual (two-device real-time check): open the same bus's attendance tab on two browser windows, check in a passenger on one, confirm the other updates without a manual refresh.
- Manual (date gating): confirm the "בדיקת נוכחות" tab is visible in `Header` only when the selected tour's date is today, and disappears/redirects when a different tour (or day) is selected.

## Risks
- **Permission gap**: new `attendance:*` mutation endpoints (create/reset/delete/presence) must be gated the same way `bus:*`/`busType:*` routes are, or an authenticated-but-unprivileged user could see or alter passenger presence/PII — flagged for the security agent (Scope-Agents includes `security`).
- **PII over-broadcast**: `attendance:update` socket payload carries `passengerName`/`passengerPhone`/`pickupPoint` — must only ever be emitted to the admin room (never the public seat room), or this reintroduces the exact PII leak the SEV-001 split in `socket.ts` was built to prevent.
- **Snapshot staleness vs. live seat edits**: because `AttendanceRecord` is a point-in-time copy (per Assumptions), an admin who edits a passenger's name/phone/pickup point on the seat map *after* a session was created will see stale data in that already-created session — acceptable per PRD's own "snapshots ... at that moment" wording, but worth flagging so it isn't mistaken for a bug during QA.
- **Concurrent presence toggles**: two guides tapping the same party card on two phones near-simultaneously could race on `setRecordsPresence` — low real-world impact (idempotent boolean set, not a counter), but note it's a last-write-wins operation, not a merge.

## Rollout Order
1. `tour-service` (backend agent) — models, permissions, service/controller/routes, socket broadcast, API contract update. Independently testable via unit tests before any frontend change.
2. `frontend` (frontend agent) — types/service/slice with socket listener, adapted `AttendanceManagement.tsx`, `Header.tsx` conditional tab, new route. Depends on step 1's routes/socket event existing (or can be stubbed against the contract in parallel, then wired once live).
3. `security` — review permission wiring and socket PII scoping once both sides are in place.
4. `qa` — end-to-end validation: create session → check in a party → batch-check a station → copy summary → reset → delete; two-device real-time sync check; date-based tab visibility check.

## Rollback
- All new backend code is additive (two new models, one new route module, two new permissions, one new socket event) — revert via git with no impact on existing `tour`/`bus`/`seat` flows.
- Frontend changes are additive (new types/service/slice files, one adapted component, one new conditional tab entry, one new route) — revert via git; no existing admin flows are removed, only extended.
