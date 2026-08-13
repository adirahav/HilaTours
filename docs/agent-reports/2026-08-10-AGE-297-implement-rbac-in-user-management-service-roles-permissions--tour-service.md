All 73 tests pass and the TypeScript build is clean.

**What I did (tour-service only — the other service's directory is off-limits per my CLAUDE.md, and the plan confirms its RBAC models/seed/JWT work is already done, with `GET /role`+`GET /permission` owned by the user-management-service agent):**

- **`api/auth/permissions.ts` (new)** — local mirror of the 15 seeded permission keys and the `admin` (all) / `user` (none) role→permission map, plus `resolvePermissions()` which fails closed on a missing/non-array/unknown `roles` claim and honours a future `permissions` claim (intersected with known keys).
- **`api/auth/auth.middleware.ts`** — replaced the "any validly-signed token = admin" `requireAdmin` with `requirePermission(key)`: verifies the JWT (401 on missing/malformed/invalid/expired/unresolvable identity), decodes the full `JwtPayload` (`sub`/`email`/`username`/`roles`), resolves permissions, and returns **403 `{ message: "Forbidden" }`** when the required key isn't granted. Still populates `req.adminId`; also attaches `req.roles`/`req.permissions`.
- **Routes** — every admin route now gates on its own key per the human's answer (full permission-key check): `tour:insert/update/delete`, `bus:insert/view/update/delete`, `seat:approve/cancel/toggleReserve/manualAssign/swapMove`, manifest on `seat:view`. Public routes (`GET /tour`, `GET /tour/:id`, `GET .../buses`, `seats/bookings`) untouched.
- **Tests** — `__tests__/helpers.ts` now signs `roles: ["admin"]` and adds `userToken()`/`tokenWithRoles()`; new `__tests__/rbac.test.ts` covers the `roles:["user"]` → 403 bypass closure across all 12 admin routes, 401-vs-403 separation, fail-closed cases (missing roles, unknown role, non-array roles), public routes still open, and `resolvePermissions` unit cases.

I also removed a stray `api/backend/...` tree I accidentally created mid-run via a relative path.

=== BACKEND AGENT REPORT ===
```
Ticket: AGE-297
Service: tour-service
Date: 2026-08-10

Endpoints implemented (authorization tightened, no contract changes):
GET    /tour                                        ✓ public
POST   /tour                                        ✓ tour:insert
GET    /tour/:tourId                                ✓ public
PUT    /tour/:tourId                                ✓ tour:update
DELETE /tour/:tourId                                ✓ tour:delete
GET    /tour/:tourId/buses                          ✓ public
POST   /tour/:tourId/buses                          ✓ bus:insert
GET    /tour/:tourId/buses/:busId                   ✓ bus:view
PUT    /tour/:tourId/buses/:busId                   ✓ bus:update
DELETE /tour/:tourId/buses/:busId                   ✓ bus:delete
POST   /tour/:tourId/buses/:busId/seats/bookings    ✓ public
POST   .../seats/approve                            ✓ seat:approve
POST   .../seats/cancel                             ✓ seat:cancel
POST   .../seats/toggle-reserve                     ✓ seat:toggleReserve
POST   .../seats/manual-assign                      ✓ seat:manualAssign
POST   .../seats/swap-move                          ✓ seat:swapMove
GET    .../manifest                                 ✓ seat:view

Mongoose models: Tour, Bus, Seat (unchanged — role/permission are owned by user-management-service)

Unit tests: 73 passed, 0 failed

To run:
cd backend/tour-service && npm run dev   # port 3033

STATUS: DONE
```

STATUS: DONE