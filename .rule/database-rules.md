# Database Rules

## Purpose
- Define database source-of-truth expectations, migration behavior, and bootstrap guidance.
- Project: Hila Tours — tour, bus, and seat management, with passenger self-service seat requests and admin approval.

## Source of Truth
- Mongoose models are the source of truth for collection structure and validation.
- `api/scripts/seed.ts` (per-service, run via `npm run seed`) is a standalone bootstrap script: idempotent upserts of `role`/`permission` reference data. It never touches `user`/`tour`/`bus`/`seat` data.

## External Identity — uuid, never `_id`
- `_id` (Mongo ObjectId) is an internal implementation detail: used for cross-collection refs (`tourId`, `busId`, `createdBy`, `assignedBy`) and for querying — never serialized to a client.
- Every collection below also has a `uuid` field (String, auto-generated e.g. via `crypto.randomUUID()`, required, unique, indexed) — this is the only identity clients ever see, exposed as `id` in every API response.
- Enforce this at the schema level (`toJSON` transform: drop `_id`/`__v`, rename `uuid` → `id`), the same mechanism already used to strip `User.passwordHash` — never rely on every controller remembering to map it. See `mongoose-models-layer` skill for the exact transform.
- When a client sends an `id` (uuid) — in a URL param or a request body — resolve it to the internal `_id` (`Model.findOne({ uuid: id })`) before using it in any query or ref. Never accept a raw Mongo ObjectId from a client as if it were the identity.

## Core Collections

### user  *(owned by `user-management-service`)*
- `"admin"` is not a separate entity or collection — it is a `user` document whose `roles` array includes `"admin"`. There is exactly one account collection; the difference between a self-signup and an admin is the `roles` value on that same document, nothing else.
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `username` — String, required, unique
- `email` — String, required, unique
- `passwordHash` — String, required
- `roles` — [String], required, default: `['user']` — an array of role names (see `role` collection below). New signups always get `['user']`, which grants no permissions (see Roles & Permissions below) — never auto-assigned `['admin']`. Changing an account's roles to include `admin` is a manual, out-of-band action (direct DB update today; a protected endpoint if one is added later — see Open Questions).
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (soft delete)

> No `passengers` collection exists — passengers are not authenticated accounts (see `glossary.md`). Passenger identity is captured directly on the `bookings`/`seats` data itself (see below).

### role  *(owned by `user-management-service`)*
- `_id` — ObjectId (internal only)
- `uuid` — String (unique, indexed — the `id` clients see)
- `name` — String, required, unique (e.g. `"admin"`, `"user"`)
- `description` — String, required
- `permissions` — [String], required — array of permission `key`s (see `permission` collection below), stored directly rather than as refs, so seed.ts is the single place keeping the two collections in sync. `admin` holds every management permission; `user` is `[]` (empty — see glossary.md, this role exists only so an unsolicited signup grants nothing).
- `createdAt` — Date, default: Date.now

### permission  *(owned by `user-management-service`)*
- `_id` — ObjectId (internal only)
- `uuid` — String (unique, indexed — the `id` clients see)
- `key` — String, required, unique (e.g. `"tour:insert"`, `"seat:approve"`) — the `<category>:<canonicalAction>` naming convention; action names must match the canonical seat actions in `glossary.md` (`bookings`, `approve`, `cancel`, `toggleReserve`, `manualAssign`, `swapMove`) where applicable, never ad-hoc synonyms.
- `description` — String, required
- `category` — String, required (`"tour"` | `"bus"` | `"busType"` | `"seat"`) — must match the domain in `key`, not be copy-pasted from another category.
- `createdAt` — Date, default: Date.now

### tour  *(owned by `tour-service`)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `name` — String, required
- `date` — Date, required
- `description` — String, default: null
- `createdBy` — ObjectId, ref: 'User', required
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (soft delete)

### bus  *(owned by `tour-service`)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `tourId` — ObjectId, ref: 'Tour', required
- `name` — String, required (e.g. "Bus 1")
- `seatLayout` — Object, required (rows/columns or explicit flat seat-position list — `{positions: string[]}` or `{rows, columns}`; unchanged by plan 036).
- `busTypeId` — ObjectId, ref: 'BusType', default: null. Persisted (not just a transient create/update input) so the bus's rendered seat grid can be derived live by joining back to the `BusType` document — see plan 036 (2026-08-22). This lookup must NOT filter out soft-deleted `BusType`s (a bus referencing a soft-deleted template must keep resolving it correctly — soft-delete only hides a template from the admin's create/edit picker, per glossary.md). **Editing a `BusType` retroactively changes the rendered seat map of every bus whose `busTypeId` references it** (deliberate, human-approved 2026-08-22 — the grid is always derived live, never snapshotted; the admin UI warns before saving an edit to an in-use template, but does not block it). `null` for manually-configured buses (raw `seatLayout`, no template).
- `pickupPoints` — [{ `name`: String, `order`: Number }], required — pickup points belong to the bus, not the tour (per `glossary.md`)
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (soft delete)

### busType  *(owned by `tour-service`)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `name` — String, required
- `description` — String, default: null
- `standardRowsCount` — Number, required — number of standard 4-seat rows (2 seats each side of the aisle)
- `doorRow` — Number, default: null — 1-based row index where the middle door replaces the right-side seat pair; null means no middle door
- `backRowSeatsCount` — Number, required — seats in the final bench row (no aisle)
- `disabledSeatSlots` — [String], default: `[]` — `"row-col"` keys for slots blocked in the grid
- `isDefault` — Boolean, default: false
- `createdAt` — Date, default: Date.now
- `deletedAt` — Date, default: null (soft delete)

> **Superseded 2026-08-22 by plan 036** — a `busType` is a design-time template, but a `bus` instantiated from one KEEPS a live link (`bus.busTypeId`, see `bus` collection below): the bus's rendered seat grid (row/col, including gaps) is derived by joining back to the current `BusType` document, not frozen at creation time. Editing a `BusType` DOES retroactively change the rendered seat map of every bus that references it (the admin UI warns before saving such an edit, but does not block it). Soft-deleting a `BusType` does NOT break buses that reference it — the join must resolve soft-deleted templates too, it just stops appearing in the admin's create/edit picker. `totalSeats` is not stored — it's derived from the layout fields and recomputed on every read/write, never trusted from the client.

### seat  *(owned by `tour-service`)*
- `_id` — ObjectId (auto-generated, internal only — never sent to clients)
- `uuid` — String (auto-generated, unique, indexed — this is the `id` clients see)
- `busId` — ObjectId, ref: 'Bus', required
- `position` — String, required (e.g. row/column label, e.g. `"3A"`) — unique per `busId`
- `status` — String, required, enum: `available` | `pending` | `taken` | `reserved`, default: `available`
- `pickupPointName` — String, default: null (which pickup point this passenger boards from, set once a request/assignment exists)
- `passengerName` — String, default: null
- `passengerPhone` — String, default: null
- `requestedAt` — Date, default: null (set when status becomes `pending`)
- `approvedAt` — Date, default: null (set when status becomes `taken` via approval)
- `assignedBy` — ObjectId, ref: 'User', default: null (set for `manual-assign`/`swap-move`/`toggle-reserve` actions)
- `updatedAt` — Date, default: Date.now (bump on every status change)

> `seats` are pre-created per bus at bus-creation time (one document per seat position), rather than only existing once booked — this keeps the seat map queryable in one shot and makes the unique-position constraint meaningful.

## Seat Status Rules
- `status` must always be one of the four canonical values in `glossary.md`: `available`, `pending`, `taken`, `reserved` — never store any other string.
- Valid transitions (enforced in `tour-service`'s `seat.service.ts`, not just at the DB layer):
  - `available → pending` (passenger booking request)
  - `pending → taken` (admin approve)
  - `available → taken` (admin manual-assign, skips pending)
  - `pending | taken → available` (admin cancel)
  - `available ⇄ reserved` (admin toggle-reserve)
  - `taken | pending → taken | pending` on a **different** seat (admin swap-move; the vacated seat returns to `available`)
- **Concurrency:** the `available → pending` and `available → taken` transitions must use an atomic, condition-checked update (e.g. Mongoose `findOneAndUpdate({ _id, status: 'available' }, { $set: { status: 'pending', ... } })`) so two simultaneous requests for the same seat can't both succeed. Never read-then-write the seat status in two separate steps.

## Roles & Permissions (RBAC)
- Two roles exist at launch: `admin` (every management permission across `tour`/`bus`/`seat`) and `user` (empty permissions — see `role` collection above).
- An account's `roles` field is an array (not a single string) to support multiple roles per account later without a schema change, even though today every account has exactly one.
- Permission `key`s follow `<category>:<action>` — e.g. `tour:insert`, `seat:approve`. Seat-action keys must reuse the canonical action names from `glossary.md` (`bookings`, `approve`, `cancel`, `toggleReserve`, `manualAssign`, `swapMove`) — never a synonym like `deny`/`move`/`insert` for a seat action.
- `GET /tour`, `GET /tour/:tourId/buses`, `GET /tour/:tourId/buses/:busId`, and `seats/bookings` remain fully public per `architecture.md` — the permission system governs the *admin-only* write/management routes only. A `user`-role account gains nothing over an anonymous visitor, since the public routes require no permission check at all.
- `api/scripts/seed.ts` (`user-management-service`) must create the `admin` and `user` role documents (and their permission documents) on first run — the app should never start with zero roles defined. Run it via `npm run seed`.

## Migration Rules
- Migrations are managed via Mongoose model changes.
- Additive changes (new fields) are preferred over destructive ones.
- Migration scripts live in `scripts/migrations/` and must be idempotent.
- When backfilling existing documents (e.g. adding a new `seatStatus` value or a new field to `seats`), use a dedicated migration script.

## Bootstrap
- `api/scripts/seed.ts` upserts `role`/`permission` reference data — `user`/`tour`/`bus`/`seat` start empty and are created only through the app itself.
- Required indexes:
  - `user`: email, username, roles
  - `role`: name (unique)
  - `permission`: key (unique)
  - `tour`: `createdBy`
  - `bus`: `tourId`
  - `busType`: none beyond `uuid` (small, admin-managed set — no compound query pattern justifies one yet)
  - `seat`: `busId` + `position` (compound, unique — no duplicate seat positions on the same bus); `busId` + `status` (compound, for fast seat-map queries)

## Soft Delete
- Documents are never permanently deleted — set `deletedAt` to current timestamp. Applies to `user`, `tour`, `bus`, and `busType`.
- All queries must filter: `{ deletedAt: null }`.
- Use Mongoose `pre('find')` middleware to exclude soft-deleted documents automatically.
- `seats` do not use soft delete individually — they're deleted/recreated as part of their parent `bus` being soft-deleted, since a seat has no meaning outside its bus.
- `role`/`permission` do not use soft delete — they're small, admin-managed reference data; if one is retired, remove it and its references directly.

## Operational Notes
- Each microservice owns its own collections — never access another service's collections directly. `user-management-service` owns `user`, `role`, `permission`; `tour-service` owns `tour`, `bus`, `busType`, `seat`.
- Do not store in-memory state between requests — especially seat status, which must always be read from the DB, never cached in a way that could serve a stale `available` status during a booking check.
- Define indexes in Mongoose schemas (`index: true` or `unique: true`).

## Open Questions / TBD
- Exact shape of `seatLayout` on `buses` (grid rows/columns vs. a free-form list of seat positions) — needs to match whatever the AI Studio demo's seat-map UI expects.
- Whether a `bookings` audit-log collection is needed (history of every approve/cancel/manual-assign/swap-move action per seat), separate from the current-state fields on `seats`, for the manifest report and any future auditing.
- Whether `passengerName`/`passengerPhone` should live only on `seats`, or whether a lightweight `passengers` collection should be introduced later if the same passenger needs to be tracked across multiple bookings/tours.
- Whether role assignment (promoting an account to `admin`) ever gets a protected API endpoint, and if so, who is permitted to call it — a `roles:assign` permission that only existing `admin`s hold is the natural answer, but this isn't built yet; today it's a manual/direct-DB action.