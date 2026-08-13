Security audit complete.

**Key finding (HIGH):** The signup page is functionally safe on the frontend and `user-management-service` side (roles always forced to `["user"]`, no leakage, no auto-admin session), but it exposes a pre-existing gap in `backend/tour-service/api/auth/auth.middleware.ts`: its `requireAdmin` only checks JWT signature/expiry, never the `roles` claim. Since self-signup now hands out valid `roles: ["user"]` JWTs to anyone, this becomes an exploitable privilege-escalation path — any self-registered account can create/update/delete tours and buses. Proven live with passing tests.

Also found: email-enumeration via signup's error message, and no rate limiting on signup/login (both MEDIUM, proven with passing tests).

Tests written to `docs/tests/security/` (`signup-privilege-escalation.test.ts`, `signup-enumeration-and-abuse.test.ts`), report at `docs/agent-reports/2026-08-10-AGE-294-signup-page-security.md`.

STATUS: DONE