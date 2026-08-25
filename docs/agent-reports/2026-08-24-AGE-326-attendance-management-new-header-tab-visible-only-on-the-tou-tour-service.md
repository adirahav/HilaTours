All 155 tests pass and `tsc --noEmit` is clean.

**What I built** (`backend/tour-service`, all additive):

- **Models** — `attendanceSession.model.ts` (`tourId`/`busId` refs, free-form `title`, internal-only `createdBy`, index `{tourId,busId}`) and `attendanceRecord.model.ts` (per-passenger snapshot + `isPresent`/`checkedInAt`, index `{sessionId}`). Both deliberately **not** soft-deleted — sessions are disposable working documents, so `DELETE` hard-removes session + records.
- **`attendance.service.ts`** — `createSession` snapshots only `taken`/`reserved` seats carrying a `passengerName` (a `pending` seat is an unapproved request, so counting that passenger as "missing" would be wrong). `deriveBookingGroupId` implements the prototype's party chain (explicit id → phone digits ≥6 → name) and **stores** the key at snapshot time so a later phone edit can't re-shuffle an in-progress check-in. `setRecordsPresence` is the single code path behind individual/party/station gestures; it's scoped to `sessionId` and rejects a partial id match with 400 rather than half-applying a party toggle.
- **Routes/controller** — the five contract endpoints under `attendance:view`/`attendance:manage` (new permission keys, granted to `admin`). No server-side date gate, per Open Question 2.
- **`emitAttendanceUpdate`** — admin-room only, no public variant. The payload carries passenger names/phones, so a public emit would reopen SEV-001.

Two things worth flagging:

1. **Pre-existing failing test, fixed.** `busType-grid.test.ts` asserted the public seat projection was exactly `id/position/status`, but plan 037 added `row`/`col` — which the contract's own `PublicSeat` schema explicitly lists as structural coordinates. The assertion was stale, not the code, so I updated it rather than narrowing the projection. Unrelated to this ticket; mentioning it so it isn't a surprise.
2. **The API contract already contained the full attendance spec** (schemas + all five paths) when I started, so I implemented against it rather than writing it. My implementation matches it field-for-field, including `pickupPointName` (not the plan's `pickupPoint`) and the `notes` field the plan omitted but the prototype's search filter needs.

=== BACKEND AGENT REPORT ===
```
Ticket: AGE-326
Service: tour-service
Date: 2026-08-25

Endpoints implemented:
GET    /attendance/session                      ✓  (attendance:view)
POST   /attendance/session                      ✓  (attendance:manage)
GET    /attendance/session/{sessionId}          ✓  (attendance:view)
DELETE /attendance/session/{sessionId}          ✓  (attendance:manage, 204)
POST   /attendance/session/{sessionId}/reset    ✓  (attendance:manage)
POST   /attendance/session/{sessionId}/presence ✓  (attendance:manage)

Socket: attendance:update -> per-bus ADMIN room only (no public variant)
Permissions added: attendance:view, attendance:manage (granted to admin)

Mongoose models: AttendanceSession, AttendanceRecord (+ existing Tour, Bus, Seat, BusType)

Unit tests: 155 passed, 0 failed (34 new in attendance.test.ts)

To run:
cd backend/tour-service && npm run dev   # port 3033

STATUS: DONE
```

STATUS: DONE