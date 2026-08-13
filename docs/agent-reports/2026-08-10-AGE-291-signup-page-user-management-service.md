Done. All work stayed within `backend/user-management-service/`.

**What I changed:**

1. **`api/models/admin.model.ts`** — added `roles: [String], required, default ['user'], index: true`, plus exported `ROLE_ADMIN` / `ROLE_USER` / `DEFAULT_SIGNUP_ROLES` constants. Matches `.rule/database-rules.md` (which already specified this field and the `admins.roles` index).

2. **`api/lib/jwt.ts`** — added `roles: string[]` to `JwtPayload`, so `tour-service` can authorize locally without calling back into this service (per the contract's "Roles & permissions" section).

3. **`api/auth/auth.service.ts`** — `signup()` now always creates the account with `roles: ['user']`, building the document field-by-field with no `...req.body` spread, so a client-supplied `roles` can never reach the DB. `login()` reads roles fresh from the DB at each login, so an out-of-band promotion takes effect on next login only.

4. **`api/auth/auth.middleware.ts`** — added `requireAdmin`, which checks `roles.includes('admin')` and returns **403** (not 401 — the caller is authenticated, just unauthorized).

**Tests:** 21 passed, 0 failed. Added 8 covering default role assignment, the `roles: ['admin']` escalation attempt in the signup body, JWT claims at signup and login, promotion-on-next-login, the client projection, and all three `requireAdmin` branches. `tsc --noEmit` is clean.

**Two things I did not act on, flagged for you:**

- **This service has no admin-only routes to gate.** Plan step 2 said "confirm/add `requireAdmin` checks so any existing admin-only route actually checks roles" — the only authenticated route here is `POST /auth/logout`, which correctly needs authentication only. `requireAdmin` is exported and tested but currently applied nowhere. **The routes that actually need it are all in `tour-service`** (tour/bus/seat writes), which is outside my allowed paths. Unless the tour-service agent applies `requireAdmin` on its side, the privilege gap in the plan's Risks section is only half-closed — the roles now exist and are in the JWT, but nothing enforces them yet.
- **Contract drift:** `GET /roles` and `GET /permissions` are in the contract, and `database-rules.md` defines `roles`/`permissions` collections plus a `seed.js` requirement — none of it is implemented. That's outside the approved plan's scope, so I left it alone rather than expanding the ticket.
- **Misplaced files:** `backend/user-management-service/docs/agent-reports/` contains two security reports (AGE-199, AGE-244) that have no copy at the repo root. My CLAUDE.md says a `docs/` folder under `backend/` must never exist. I did not move them — the filenames fall outside my single permitted write path — but they should be relocated to `docs/agent-reports/`.

=== BACKEND AGENT REPORT ===
```
Ticket: AGE-291
Service: user-management-service
Date: 2026-08-10

Endpoints implemented (pre-existing, verified against contract):
POST /api/auth/signup            ✓  (now always assigns roles: ["user"])
POST /api/auth/login             ✓  (now embeds current roles in JWT)
POST /api/auth/logout            ✓
POST /api/auth/forgot-password   ✓
(also mounted under /user-management-service/api/auth/* gateway prefix)

Not implemented (in contract, outside approved plan scope):
GET /roles                       ✗
GET /permissions                 ✗

Mongoose models: Admin (added `roles` field + index)

Unit tests: 21 passed, 0 failed

To run:
cd backend/user-management-service && npm run dev   # port 3032
```

STATUS: DONE