Security audit complete for AGE-299 (RBAC in user-management-service).

**Summary:** The RBAC implementation (Role/Permission models, `roles` field, seed.ts, JWT `roles` claim, `GET /role`/`GET /permission`, and tour-service's tightened `requirePermission` middleware) was already implemented by the other scoped agents. My review confirmed:

- The **critical privilege-escalation bug** flagged in AGE-294 (any self-signed-up `roles:["user"]` account could hit tour-service admin routes) is **fixed** — `requireAdmin` was replaced with a per-route `requirePermission(key)` check that fails closed.
- `signup()` cannot be used to self-assign `roles:["admin"]` (verified with injection-shaped payloads too).
- Fail-closed behavior holds under every malformed JWT `roles` shape (missing, empty, non-array, unknown role, forged signature).
- `GET /role`/`GET /permission` are correctly auth-gated (not admin-gated, per contract) and leak no internal Mongo fields.
- No new vulnerabilities introduced.

Wrote 15 new regression tests to `docs/tests/security/AGE-299-rbac-privilege-escalation.test.ts` (repo guardrail blocks security-agent writes to `tests/security/`, so used the established `docs/tests/security/` convention) — all 15 pass, plus re-ran the existing 14+8 in-repo RBAC tests with no regressions. Full report at `docs/agent-reports/2026-08-10-AGE-299-implement-rbac-in-user-management-service-roles-permissions--security.md`.

STATUS: DONE