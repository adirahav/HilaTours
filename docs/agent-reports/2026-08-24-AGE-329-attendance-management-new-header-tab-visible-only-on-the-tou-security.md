Security audit for AGE-329 (Attendance Management) is complete.

**Result: BLOCKED** — but not due to the attendance feature itself.

Summary:
- The attendance feature code (backend `attendance.routes/controller/service`, models, and the frontend `AttendanceManagement.tsx`/`attendance.service.ts`/`attendance.slice.ts`) has **zero CRITICAL and zero HIGH findings**: every route is JWT+permission-gated (`attendance:view`/`attendance:manage`), passenger data is always re-derived server-side from the seat snapshot (never trusted from client input), NoSQL-injection-shaped inputs are rejected, cross-tenant/IDOR attempts are rejected, no PII leaks to unauthenticated callers, and the prototype's localStorage persistence was correctly replaced by a server-backed session API with socket sync.
- 48 security tests pass (25 new in `docs/tests/security/attendance.security.test.ts` + 23 existing feature tests re-verified).
- 1 MEDIUM: pre-existing high/critical `npm audit` findings in frontend, user-management-service, and tour-service — all transitive (`tar` via `@capacitor/cli`/`bcrypt`, `nanoid`), unrelated to this ticket's code, but they trip the "zero high/critical dependency vulns" gate.
- 1 LOW: unsanitized `passengerPhone` interpolated into a `tel:` href (defense-in-depth recommendation only).

Report written to `docs/agent-reports/2026-08-24-AGE-329-attendance-management-new-header-tab-visible-only-on-the-tou-security.md`. Recommend a separate dependency-bump ticket for `bcrypt`/`@capacitor/cli`/`nanoid` so future audits of unrelated features aren't blocked by this pre-existing debt.

STATUS: DONE