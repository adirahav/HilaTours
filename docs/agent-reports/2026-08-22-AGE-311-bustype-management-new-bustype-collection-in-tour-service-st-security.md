Security audit for AGE-311 (BusType management) complete. Summary:

- **0 CRITICAL, 0 HIGH, 0 MEDIUM findings** — 1 LOW (non-security data-quality nit in `disabledSeatSlots` coercion).
- All `/busType` routes are correctly auth-gated per-permission, JWT verification is sound (no `alg:none`/expired/tampered bypass), uuid resolution prevents NoSQL injection, `totalSeats` is always server-derived, the `busTypeId`/`seatLayout` mutual-exclusion on Bus creation is enforced with a real 400, soft-deleted templates 404/are excluded from lists, and no internal Mongo ids leak.
- Frontend: `localStorage` persistence fully removed and replaced with the real API/store; no XSS sinks; no secrets in logs; auth handled centrally.
- Wrote 20 new tests to `docs/tests/security/busType.security.test.ts` (repo guardrail routes security-agent test writes there instead of `tests/security/`) — all 20 pass.
- Dependency audit found pre-existing high/critical transitive vulnerabilities (`tar`, `bcrypt`/node-pre-gyp, `nanoid`) unrelated to this feature — noted but not blocking, consistent with prior audit precedent.

Report: `docs/agent-reports/2026-08-22-AGE-311-bustype-management-new-bustype-collection-in-tour-service-st-security.md`

STATUS: DONE