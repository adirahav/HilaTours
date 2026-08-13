# Plan: Implement RBAC in user-management-service (roles/permissions)

Status: draft
Owner: Orchestrator
Last updated: 2026-08-10
Scope-Agents: user-management-service, tour-service, qa, security

## Goal
Close the remaining gaps between the RBAC spec (`.rule/database-rules.md`, `docs/product-definition.md`, `docs/api-contract/api-contract.user-management-service.yaml`) and code: expose the already-modeled `Role`/`Permission` reference data via read-only endpoints, and make `tour-service`'s `requireAdmin` middleware actually authorize on the JWT's `roles` claim instead of merely checking "is this a validly-signed token."

## Scope
- In scope:
  - `backend/user-management-service`: add `GET /roles` and `GET /permissions` read-only endpoints per the API contract (`docs/api-contract/api-contract.user-management-service.yaml` paths `/roles`, `/permissions`), backed by the existing `Role`/`Permission` Mongoose models.
  - `backend/tour-service/api/auth/auth.middleware.ts`: rewrite `requireAdmin` to decode the full JWT payload (via the shared `JwtPayload` shape, mirroring `backend/user-management-service/api/lib/jwt.ts`) and reject (403) any token whose `roles` array does not include `"admin"`, instead of accepting any validly-signed token. Continue to also reject (401) malformed/invalid/expired tokens as today.
  - Tests: `backend/user-management-service/api/auth/auth.test.ts` (or a new `roles.test.ts`) for the two new GET endpoints; `backend/tour-service/api/__tests__/tour-service.test.ts` (or a new middleware test) for `requireAdmin` now rejecting a well-signed `roles: ["user"]` token with 403.
- Out of scope (already implemented — verified in code, not re-done here):
  - `Role`/`Permission` Mongoose models (`backend/user-management-service/api/models/role.model.ts`, `permission.model.ts`) — already exist, match `database-rules.md` shape (uuid/name-or-key/description/permissions-or-category, `toJSON` uuid→id transform).
  - `roles` array field (default `["user"]`) on the account model — already on `backend/user-management-service/api/models/user.model.ts` (`ROLE_ADMIN`/`ROLE_USER` constants; note the model is named `User`, not `Admin` — "admin" is a `user` document with `roles: ["admin"]`, per `database-rules.md`).
  - `backend/user-management-service/api/scripts/seed.ts` — already idempotently upserts the 15 `tour`/`bus`/`seat` permissions and the `admin` (all permissions)/`user` (empty) roles.
  - `signup()` in `backend/user-management-service/api/auth/auth.service.ts` — already hardcodes `roles: [ROLE_USER]`, never spreads `req.body`, so client-supplied `roles` can't escalate privileges.
  - JWT payload — `backend/user-management-service/api/lib/jwt.ts` `JwtPayload` already has `roles: string[]`; both `signup()` and `login()` embed it.
- Explicitly out of scope: adding a role-assignment/promotion endpoint (`PUT /admin/{id}/roles` or similar) — `database-rules.md` and the API contract both list this as an open question / manual-only action today, not part of this task.

## Assumptions
- The task's phrasing "`GET /role` and `GET /permission`" refers loosely to the same read-only lookups the API contract defines as `GET /roles` and `GET /permissions` (plural, under a "Roles & Permissions" tag) — this plan follows the actual contract path names, not the singular forms in the backlog title (flagged in Open Questions).
- `tour-service` has no direct DB access to `role`/`permission` collections (each service owns its own collections per `database-rules.md` Operational Notes) — so "authorize based on role/permissions read from the JWT" means role-based checks against the `roles` claim already embedded at issuance, not a live permission-key lookup. Fine-grained per-permission-key checks (e.g. gating `POST /tour` on `tour:insert` specifically, vs. any `admin`) are not requested by the spec today (JWT only carries `roles`, not resolved `permissions`) and are called out as an open question rather than assumed in scope.
- `backend/tour-service` and `backend/user-management-service` share the same `JWT_SECRET` (already true per the existing `requireAdmin` doc-comment) and the same payload shape (`sub`/`email`/`username`/`roles`), so `tour-service` can decode `roles` without importing user-management-service code (duplicate a minimal local type, consistent with the existing pattern where tour-service already has its own `auth.middleware.ts` independent of user-management-service's).

## Open Questions
- Should `tour-service`'s new role check be a full permission-key check (e.g. `POST /tour` requires `tour:insert`) or the coarser `roles.includes('admin')` check already used by `user-management-service`'s own `requireAdmin`?
  - Recommended: `roles.includes('admin')`, matching the existing `user-management-service` `requireAdmin` implementation and the JWT payload shape (which carries `roles`, not resolved `permissions`) — a full permission-key model would require either embedding `permissions` in the JWT too (a JWT/contract change beyond this task) or `tour-service` calling back into `user-management-service`, which `database-rules.md`'s "authorize locally without calling back into this service" explicitly avoids.
- The backlog task names the endpoints `GET /role` / `GET /permission` (singular); the API contract defines `GET /roles` / `GET /permissions` (plural). Which should the implementation use?
  - Recommended: follow the API contract (`/roles`, `/permissions`) since it's the more detailed, versioned source of truth (`v1.2.0`) and is what `frontend` or any future admin-management UI would be built against.

## Steps
1. `user-management-service` agent:
   - Add `backend/user-management-service/api/roles-permissions/roles-permissions.controller.ts` (or similar) exposing `GET /roles` (returns `Role.find()` sorted by `name`, `toJSON` already strips `_id`/`__v`/renames `uuid`→`id`) and `GET /permissions` (`Permission.find()` sorted by `category`,`key`), both behind `requireAuth` per the contract's `security: [bearerAuth]`.
   - Mount the router in `backend/user-management-service/api/server.ts` under both the gateway-prefixed base (`/user-management-service/api`) and the direct `/api` path, matching the existing `authRouter`/`forgotPasswordRouter` mount pattern.
   - Add tests covering: 401 with no/invalid token, 200 with a valid token returning the seeded `admin`/`user` roles and the 15 seeded permissions (order-independent assertions), and confirming response shape uses `id` not `uuid`/`_id`.
2. `tour-service` agent (parallel with step 1, independent):
   - In `backend/tour-service/api/auth/auth.middleware.ts`, change `requireAdmin` to, after `jwt.verify`, read `payload.roles` and return `403 { message: "Forbidden" }` if it is not an array containing `"admin"` — keep the existing 401 paths (missing/malformed header, invalid/expired token, unresolvable identity) unchanged. Keep populating `req.adminId` as today.
   - Add/adjust tests in `backend/tour-service/api/__tests__/tour-service.test.ts` (or a new middleware-focused test file) asserting: a well-signed token with `roles: ["user"]` gets 403 on an admin-only route (e.g. `POST /tour`), and a well-signed token with `roles: ["admin"]` still succeeds — use the project's existing JWT-signing test helper if one exists in `backend/tour-service/api/__tests__/helpers.ts`, else sign a token with `jsonwebtoken` directly using `process.env.JWT_SECRET`.
3. `qa` agent runs both services' test suites and confirms no regressions in existing admin-route tests (which currently pass with any valid token and would previously have missed a `roles: ["user"]` token being wrongly authorized).
4. `security` agent reviews: that `GET /roles`/`GET /permissions` don't leak anything beyond the documented `Role`/`Permission` shape, and that the tightened `tour-service` `requireAdmin` doesn't introduce a bypass (e.g. missing-roles-array must fail closed, not open).

## Validation
- `backend/user-management-service`: `npm --prefix backend/user-management-service run test`
- `backend/tour-service`: `npm --prefix backend/tour-service run test`

## Risks
- **Silent privilege escalation today (tour-service):** every self-signed-up `roles: ["user"]` account currently passes `tour-service`'s `requireAdmin` on any admin-only route (`POST/PUT/DELETE /tour`, bus/seat/manifest admin routes) because the middleware only checks token validity, not the `roles` claim — this is a live authorization bypass, not just a spec gap, and is the primary reason this task is in scope for `tour-service` (per planning-rules guidance on including a service the Risks section flags even when "no new endpoints" are added).
- Tightening `requireAdmin` could break any existing test or manual flow that relies on a non-admin token being accepted on an admin route — must audit all `requireAdmin`-gated routes in `backend/tour-service/api/{tour,bus,seat,manifest}/*.routes.ts` before merging.
- If `tour-service` and `user-management-service` ever drift on `JWT_SECRET` or payload shape, `roles` could be `undefined` — the new check must fail closed (403/401), not treat a missing `roles` array as "allow."

## Rollout Order
1. `tour-service` `requireAdmin` fix (closes the live authorization bypass — highest priority).
2. `user-management-service` `GET /roles` / `GET /permissions` endpoints.
3. QA verification across both services.
4. Security review.

## Rollback
- Revert branch commits for this task.
- `tour-service`: reverting `requireAdmin` restores prior (broken) behavior — acceptable only as a temporary rollback, not a target state.
- Mark this plan `Status: superseded` if replaced by a later plan.
