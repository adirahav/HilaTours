# 028 — Add UUID identity layer, stop exposing Mongo `_id` to clients

Status: done
Owner: orchestrator
Last updated: 2026-08-09
Scope-Agents: frontend, user-management-service, tour-service, qa, security

## Goal

Every persisted entity (Admin, Tour, Bus, Seat) gets a server-generated
`uuid` field (unique, indexed) that becomes its public identity. Mongo's
`_id` stays purely internal (primary key + cross-collection refs like
`Bus.tourId`, `Seat.busId`, `Tour.createdBy`, `Seat.assignedBy`) and is
never serialized to a client. Every API response transforms `uuid` → `id`
and strips `_id` (and `__v`), the same way `Admin.passwordHash` is already
kept out of client-facing responses today. Every controller/service that
receives a client-supplied id (route param or body field) resolves
`uuid → _id` before querying Mongo. Frontend types/services already model
entities with an `id: string` field (see `frontend/src/lib/tourMapper.ts`,
which currently maps Mongo `_id` onto `id`) — after this change `id` is a
real opaque uuid end-to-end instead of a Mongo ObjectId string, and the
now-redundant `_id`-mapping fallback logic can be simplified/removed.

## Scope

- `backend/user-management-service/api/models/admin.model.ts` — add `uuid`
  field + toJSON transform (id projection, strip `_id`/`passwordHash`/`__v`).
- `backend/user-management-service/api/api/auth/auth.service.ts` /
  `auth.controller.ts` — `signToken` currently embeds `admin.id` (Mongo `_id`
  via Mongoose virtual `.id`) as `sub`; must embed `admin.uuid` instead so
  the JWT `sub` claim is a uuid, not a Mongo id.
- `backend/tour-service/api/models/tour.model.ts`,
  `backend/tour-service/api/models/bus.model.ts`,
  `backend/tour-service/api/models/seat.model.ts` — add `uuid` field
  (unique, indexed) + toJSON transform to each.
- `backend/tour-service/api/tour/tour.service.ts`,
  `backend/tour-service/api/tour/tour.controller.ts`,
  `backend/tour-service/api/tour/tour.routes.ts` — route params
  (`:tourId`) are uuids now; resolve to `_id` before querying; `createdBy`
  stored as Mongo `_id` (ref to Admin) resolved from `req.adminId`, which
  itself must now be a uuid resolved to Admin `_id` (or kept as-is if
  `req.adminId` is repurposed — see Open Questions).
- `backend/tour-service/api/bus/bus.service.ts`,
  `backend/tour-service/api/bus/bus.controller.ts`,
  `backend/tour-service/api/bus/bus.routes.ts` — same for `:busId`;
  `PUBLIC_SEAT_FIELDS`/`toPublicSeat` must project/expose `uuid` (as `id`)
  instead of `_id`; `Bus.tourId` ref resolution.
- `backend/tour-service/api/seat/seat.service.ts`,
  `backend/tour-service/api/seat/seat.controller.ts`,
  `backend/tour-service/api/seat/seat.routes.ts` — `seatIds`,
  `fromSeatId`/`toSeatId` in manual-assign/swap-move payloads are
  client-supplied uuids now; every internal `Seat.findOne({ _id: ... })` /
  `updateOne({ _id: ... })` call needs a uuid→`_id` resolution step first.
- `backend/tour-service/api/manifest/manifest.service.ts`,
  `backend/tour-service/api/manifest/manifest.controller.ts` — `:busId`
  param resolution; manifest rows must expose seat `id` (uuid), not `_id`.
- `backend/tour-service/api/auth/auth.middleware.ts` — `req.adminId` is
  extracted from JWT `payload.id || payload.sub || payload._id`; once the
  token embeds a uuid, `req.adminId` becomes a uuid and every downstream
  consumer (`Seat.assignedBy`, `Tour.createdBy`) needs the same
  uuid→`_id` resolution before being stored as a ref.
- New shared helper, one per service (or one shared lib if the two
  services already share code — verify): a `resolveIdsToObjectIds`-style
  utility that takes a uuid (or array of uuids) + Mongoose model and
  returns the corresponding `_id`(s), throwing a 404-style `HttpError` when
  a uuid doesn't resolve. Suggested locations:
  `backend/tour-service/api/lib/resolveId.ts`,
  `backend/user-management-service/api/lib/resolveId.ts` (mirror, since the
  two services don't currently share a lib package — confirm during
  implementation).
- `docs/api-contract/api-contract.tour-service.yaml`,
  `docs/api-contract/api-contract.user-management-service.yaml` — the
  contract already documents `id` (not `_id`) on `Tour`/`Bus` schemas
  (implementation currently violates its own contract); update all path
  param descriptions (`{tourId}`, `{busId}`) to state they are uuids, and
  add `id`/uuid documentation to any schema still missing it (`Seat`,
  `Admin`, manifest rows).
- `frontend/src/lib/tourMapper.ts` (+ `tourMapper.test.ts`) — simplify the
  `raw._id ?? raw.id ?? ...` fallback chains now that the backend always
  returns `id`; keep tolerant mapping during rollout (see Rollout Order)
  but plan the follow-up cleanup.
- `frontend/src/services/*.ts` (`tour.service.ts`, `bus.service.ts`,
  `seat.service.ts`, `manifest.service.ts`, `auth.service.ts`) — any
  place constructing request bodies/URLs from an entity's id already uses
  `.id` per the mapper; verify none of them reach into `._id` directly
  (grep found none in non-test source, only in tests/fixtures that
  intentionally simulate the raw backend shape — those fixtures should be
  updated to use `id` once the backend change ships, or kept as a
  regression test for backward-compat tolerance, per Open Questions).
- `frontend/src/types/*.types.ts` — already model `id: string`; no type
  shape change expected, just confirms the contract now matches reality.

## Assumptions

- A `uuid` npm package (or Node's built-in `crypto.randomUUID()`) is
  available/acceptable; no existing `uuid` dependency was found in either
  service's `package.json`. Recommend `crypto.randomUUID()` (Node >=14.17,
  no new dependency) over adding the `uuid` package.
- This is a schema-additive change for existing data: since the project is
  still pre-launch (per `.plan/` history, no production data migration
  concerns have been raised), backfilling existing documents is not a
  concern — assume dev/test DBs can be dropped and reseeded rather than
  requiring a migration script. Flagged explicitly in Open Questions in
  case the user has real seeded data to preserve.
- `Types.ObjectId.isValid(...)` checks currently used to validate route
  params (e.g. `bus.service.ts` `assertTourExists`, `getBusWithSeats`)
  must be replaced with uuid-format validation (or simply "does it resolve
  to a document" — a failed resolution already implies 404), since
  incoming ids are no longer ObjectId strings.
- `Seat.assignedBy` and `Tour.createdBy` (refs to Admin `_id`) continue to
  store Mongo `_id` internally; only the JWT/API surface changes to uuid.
- The manifest service's search (`manifest.service.ts`) does not currently
  search by seat/bus id text, only name/phone/pickup/position, so no id
  format assumptions there beyond the `:busId` route param.

## Open Questions

1. Should existing dev/staging Mongo data be migrated (backfill script
   adding `uuid` to existing docs) or is a full reseed acceptable?
   - Recommended: reseed — no evidence of production data to preserve yet
     per PRD status ("In Development"); a backfill script adds complexity
     for no current benefit and can be added later if real data exists
     before this ships.
   - *HUMAN ANSWER:* as recommended  
2. Use Node's built-in `crypto.randomUUID()` or add the `uuid` npm
   package as a dependency?
   - Recommended: `crypto.randomUUID()` — zero new dependency, already
     RFC4122 v4 compliant, sufficient for this use case.
   - *HUMAN ANSWER:* as recommended  
3. Should the JWT `sub` claim switch from Admin Mongo `_id` to
   `Admin.uuid`, given `req.adminId` currently flows into `Seat.assignedBy`
   / `Tour.createdBy` as the ref value?
   - Recommended: yes, `sub` becomes the uuid (client-facing identity must
     never be `_id`, and the JWT is a client-visible artifact); add the
     resolveId helper as the single place `auth.middleware.ts` converts
     `req.adminId` (uuid) to the Admin `_id` needed for ref fields, so
     every consumer downstream only ever sees the resolved `_id` when
     writing refs and the uuid when responding to the client.
   - *HUMAN ANSWER:* as recommended  
4. Should the frontend `tourMapper.ts` `_id`-fallback chains be deleted
   entirely in this task, or kept as defensive backward-compat and removed
   in a later cleanup task?
   - Recommended: keep the fallback (`raw._id ?? raw.id`) for this task —
     it's cheap insurance during rollout and removing it is a pure
     follow-up cleanup with no functional risk either way; don't couple it
     to this already-large cross-service change.
   - *HUMAN ANSWER:* as recommended  

## Steps

1. **Shared resolver helper** (both services): add
   `resolveId.ts` exporting `resolveObjectId(Model, uuid): Promise<Types.ObjectId>`
   and `resolveObjectIds(Model, uuid[]): Promise<Types.ObjectId[]>`, each
   throwing `HttpError(404, ...)` (tour-service) / equivalent on miss.
2. **Models** (`backend/user-management-service/api/models/admin.model.ts`,
   `backend/tour-service/api/models/{tour,bus,seat}.model.ts`): add
   `uuid: { type: String, default: () => crypto.randomUUID(), unique: true, index: true }`
   and a `toJSON`/`toObject` transform that sets `id = ret.uuid`, then
   deletes `_id`, `uuid`, `__v` (and, for Admin, `passwordHash`) from the
   serialized output. Note: most existing queries use `.lean()`, which
   bypasses Mongoose document transforms — audit every `.lean()` call site
   in this task's scope and either (a) map the lean object manually through
   a shared `toClientShape()` helper, or (b) drop `.lean()` where transform
   behavior is required. Prefer (a) for performance parity with current code.
3. **Auth service** (`user-management-service`): `signup`/`login` sign
   `admin.uuid` (not `admin.id`) as JWT `sub`. Update `auth.test.ts`
   PII-leak test to also assert `_id` is absent from responses (mirroring
   the existing `passwordHash` assertion), and add a case asserting the
   response's `id` is a uuid, not an ObjectId string.
4. **Auth middleware** (`tour-service/api/auth/auth.middleware.ts`):
   `req.adminId` is now the JWT `sub` = Admin uuid. Any code that writes it
   into an Admin-ref field (`Seat.assignedBy`, `Tour.createdBy`) must call
   `resolveObjectId(Admin, req.adminId)` first — but tour-service doesn't
   import the Admin model today (cross-service boundary); confirm during
   implementation whether `assignedBy`/`createdBy` should instead store the
   uuid directly (denormalized) rather than a resolved ObjectId ref, since
   tour-service has no local Admin collection to resolve against. This is
   a design fork — flag prominently in the PR/report if it changes the
   `Seat`/`Tour` schema's `assignedBy`/`createdBy` type from ObjectId ref
   to plain uuid string.
5. **Tour service/controller/routes** (`tour-service`): resolve `:tourId`
   uuid → `_id` at the top of every controller/service function
   (`getTour`, `updateTour`, `softDeleteTour`, `createTour` doesn't need
   it). Update `listBusesWithPublicSeats`/embedded-bus logic to expose
   `bus.id`/`seat.id` (post-transform) not `_id`.
6. **Bus service/controller/routes**: same uuid resolution for `:tourId`
   and `:busId`; update `PUBLIC_SEAT_FIELDS` (`"_id position status"` →
   `"uuid position status"`) and `toPublicSeat` to emit `id` instead of
   `_id`; `Seat.insertMany` in `createBus` still uses Mongo `_id` for
   `busId` ref internally (no change needed there — refs stay internal).
7. **Seat service/controller/routes**: resolve `:busId` (uuid→`_id`) and
   every client-supplied seat id (`seatIds[]`, `fromSeatId`, `toSeatId` in
   manual-assign/swap-move bodies) via `resolveObjectId(Seat, ...)` before
   any `Seat.findOne`/`updateOne`/`updateMany` call. `resolveSeatNumberToId`
   (seat.service.ts:181-193) should return the resolved `_id` internally,
   but any value returned to the client must be re-mapped to `uuid`.
8. **Manifest service/controller**: resolve `:busId`; manifest rows are
   built from `Seat.find(...).lean()` — apply the same lean→client-shape
   mapping so each row exposes `id`, not `_id`.
9. **API contracts**: update both YAML files — mark all path params as
   uuid format, ensure every schema (`Tour`, `Bus`, `Seat`/`PublicSeat`,
   `Admin` if documented, manifest row) documents `id` and omits `_id`.
10. **Frontend**: re-run `tourMapper.test.ts` fixtures against the new
    backend shape (real integration or updated mocks with `id` instead of
    `_id`) to confirm the existing `id`-first mapping already works
    unchanged; no frontend type changes expected since `id: string` was
    already the modeled shape. Update `tour.service.test.ts` and
    `PassengerViewPage.test.tsx` fixtures to use `id` (dropping the
    `_id`-shaped test fixtures) once the backend contract is confirmed —
    or add a second fixture variant proving the mapper still tolerates the
    old shape, per Open Question 4.
11. **Security pass**: audit every response path in both services (`grep
    -rn "_id"` across non-test backend source) to confirm zero remaining
    `_id` leakage; add/extend a regression test analogous to
    `backend/docs/tests/security/seat.security.test.ts` and
    `auth.test.ts`'s `never leaks passwordHash` test, asserting `_id` never
    appears in any JSON response body across tour/bus/seat/manifest/auth
    endpoints.

## Validation

- Backend: `cd backend/tour-service && npm test` — extend
  `tour-service.test.ts` to assert every response body's tour/bus/seat
  objects have `id` (uuid-shaped) and no `_id`/`uuid` key.
- Backend: `cd backend/user-management-service && npm test` — extend
  `auth.test.ts`'s existing `never leaks passwordHash` test into a
  combined assertion that also checks for absence of `_id`, and add a
  uuid-shape assertion on `id`.
- Backend: new/extended security regression test asserting no controller
  response across both services ever serializes `_id`.
- Manual: exercise the full admin flow (login → create tour → create bus →
  passenger books seat → admin approves/cancels/reserves/manual-assign/
  swap-move → manifest report) using only uuid `id` values end-to-end,
  confirming no code path silently expects a Mongo ObjectId string.
- Frontend: `cd frontend && npm test -- tourMapper` and
  `npm test -- tour.service` and `npm test -- PassengerViewPage` to
  confirm the frontend continues to work against the new `id`-shaped
  responses.
- Manual smoke: run both passenger and admin flows end-to-end against the
  real backend (per `run` skill).

## Risks

- **Auth/security risk (user-management-service, security)**: the JWT
  `sub` claim format changes from Mongo `_id` to uuid; any code (frontend
  or backend) that decoded the old token shape and treated `sub` as an
  ObjectId (e.g. for direct Mongo lookups) breaks silently unless the
  resolver step (Step 4) is applied everywhere `req.adminId` is consumed.
- **Data-integrity / cross-service ref risk (tour-service, security)**:
  `Seat.assignedBy` and `Tour.createdBy` are ObjectId refs into a
  collection (Admin) that lives in a different service/database
  (user-management-service). If tour-service cannot resolve Admin
  uuid→`_id` locally (no shared DB/model access), this task may need to
  change those fields from ObjectId refs to plain uuid strings — a schema
  decision that affects any existing admin-attribution queries. Must be
  resolved explicitly in Step 4, not glossed over.
- **Regression risk across every endpoint (tour-service,
  user-management-service, security)**: this touches nearly every
  controller/service/model in both backend services simultaneously (route
  param resolution, embedded-object projection, and response
  serialization all change at once). High surface area for missed `_id`
  leaks or missed uuid-resolution call sites — mitigated by the Step 11
  grep-driven audit + regression test, but still the largest single risk
  in this plan.
- **Concurrency risk (tour-service)**: seat mutation endpoints
  (approve/cancel/toggle-reserve/manual-assign/swap-move) already handle
  optimistic concurrency via conditional `updateOne`/`findOneAndUpdate`
  filters keyed on `_id` + `status`. Adding a uuid→`_id` resolution step
  before each of these must not introduce a TOCTOU gap (e.g. resolving the
  id in one query and mutating in a second, unguarded query) that weakens
  the existing atomicity guarantees — resolution must only ever be used to
  find the `_id` to filter on, never to bypass the existing conditional
  update pattern.
- **Frontend mapping risk**: the `tourMapper.ts` fallback chain
  (`raw._id ?? raw.id ?? ...`) means a partially-migrated backend (some
  endpoints returning `id`, others still `_id`, mid-rollout) could produce
  inconsistent behavior that's hard to notice — mitigated by shipping
  backend and frontend together per Rollout Order rather than staging
  service-by-service.

## Rollout Order

1. Land the shared `resolveId` helper + model `uuid` field + toJSON
   transform in both backend services first, without yet changing any
   controller to require uuid input (i.e., `_id` values would still
   "resolve" via `resolveObjectId` falling back to raw ObjectId lookup, OR
   simply reseed dev data — see Open Question 1 — before flipping routes
   over). Prefer the reseed path: no dual-format transition period.
2. Update user-management-service (`auth.service.ts`,
   `auth.controller.ts`, `auth.middleware.ts` equivalents) and its tests;
   ship/verify independently since it's a smaller, self-contained service.
3. Update tour-service (models → services → controllers → routes) in one
   coordinated change, since seat/bus/tour resolution is deeply
   interdependent (a bus route depends on tour uuid resolution, seat
   routes depend on bus uuid resolution).
4. Update both API contract YAMLs alongside the backend change (docs
   should never lag the implementation, especially since the contract
   already specifies `id` and the implementation was the one out of sync).
5. Update/verify frontend against the new response shape (mapper +
   service tests); frontend types require no structural change.
6. Run the full QA pass (Validation section) before closing out, given the
   cross-cutting nature of this change.

## Rollback

- Backend: each service's `uuid` field + toJSON transform + resolver
  usage is additive to the schema (old `_id`-based internal queries still
  work; only the client-facing contract changes). Revert is a straight
  `git revert` of the model/service/controller/route commits per service;
  no destructive data migration was performed (per Assumption of
  reseed-over-migration), so rollback requires no data cleanup.
- Frontend: revert the mapper/service/type commits; since `id: string` was
  already the frontend's modeled shape and the fallback chain in
  `tourMapper.ts` is being kept (Open Question 4), a partial or reverted
  backend rollout remains tolerated by the frontend without a frontend
  code change being strictly required.
- API contracts: revert the YAML edits; since the contract already
  specified `id` before this task, reverting only returns the docs to
  "correct in spec, wrong in practice" — not a regression risk in itself.

## Design Files Reviewed

No Figma link provided. This task is backend/contract/type-layer only —
no UI change. Checked `raw_from_ai_studio/` for any hardcoded `_id` usage
in component mock data that might need updating alongside the frontend
service/type layer.
