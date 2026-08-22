Security review complete. Summary:

- Reviewed the actual implementation (which correctly follows the approved plan's **reseed-by-position** design, not the blanket hard-delete described in the original task text — plan 035 superseded that after human review).
- Verified auth/authz (`requirePermission("bus:update")`), tenant-scoped bus resolution, 404-before-mutation ordering, no mass-assignment, no internal-ID leakage, and safe handling of malformed `busTypeId` input.
- No blocking vulnerabilities found — only two informational notes (no transaction around delete/insert; BusType templates are intentionally global/non-tenant-scoped).
- Added 12 passing security tests at `docs/tests/security/2026-08-22-AGE-317-bus-type-update-authz.test.ts` covering authn/authz, IDOR/tenant isolation, and injection/mass-assignment hardening.
- Report written to `docs/agent-reports/2026-08-22-AGE-317-allow-destructive-bustype-change-on-existing-buses-via-put-t-security.md`.

STATUS: DONE