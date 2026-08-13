All tests pass (29/29) and typecheck is clean.

Most of the RBAC scope was already in code (verified, not re-done): `Role`/`Permission` models, `roles` default `["user"]` on the account model, seed.ts upserting the 15 permissions + `admin`/`user` roles, `signup()` hardcoding `roles: [ROLE_USER]`, and `JwtPayload.roles` embedded at signup/login. The remaining gap in this service was the two read-only lookup endpoints. The `tour-service` `requireAdmin` fix is out of my allowed paths (separate agent per the plan).

=== BACKEND AGENT REPORT ===
```
Ticket: AGE-296
Service: user-management-service
Date: 2026-08-10

Endpoints implemented:
POST /auth/signup            ✓ (pre-existing; roles ["user"] enforced, roles in JWT)
POST /auth/login             ✓ (pre-existing; roles embedded in JWT payload)
POST /auth/logout            ✓ (pre-existing)
POST /auth/forgot-password   ✓ (pre-existing)
GET  /role                   ✓ (new — requireAuth, sorted by name)
GET  /permission             ✓ (new — requireAuth, sorted by category,key)

All mounted under both /user-management-service/api and /api.

Mongoose models: User (roles: string[], default ["user"]), Role, Permission

Files changed:
- api/roles-permissions/roles-permissions.controller.ts (new)
- api/roles-permissions/roles-permissions.test.ts (new, 8 tests)
- api/server.ts (mount rolesPermissionsRouter at api base)

Unit tests: 29 passed, 0 failed
Typecheck: clean

To run:
cd backend/user-management-service && npm run dev   # port 3032
```

STATUS: DONE