# Glossary

## Purpose
Define canonical domain terms and approved short forms used across code, API routes, docs, and plans.

---

## Core Terms

### `tour`
- **Canonical meaning:** A single organized outing created by an admin, containing one or more buses and taking place on a given date.
- **Use:** Always `tour`, not `trip`, `journey`, or `tiyul`. This is a hard rule, not a style preference — never use `trip` anywhere in code, docs, UI copy, or API routes.
- **Plural:** `tours`.

### `bus`
- **Canonical meaning:** A vehicle attached to a tour, with a defined seat layout and a set of pickup points.
- **Use:** Always `bus`, not `vehicle` or `otobus`.
- **Plural:** `buses`.

### `seat`
- **Canonical meaning:** A single bookable position on a bus's seat map, identified by its position and current status.
- **Use:** Always `seat`, not `spot`, `place`, or `makom`.
- **Plural:** `seats`.

### `seatStatus`
- **Canonical meaning:** The current state of a seat in its lifecycle.
- **Variants:**
  - `available` — open, not yet requested or assigned.
  - `pending` — requested by a passenger, awaiting admin approval.
  - `taken` — confirmed, either via approval or manual assignment.
  - `reserved` — locked by an admin/management, not bookable by passengers.
- **Use:** Always these four exact values, not `open`/`booked`/`held`/`locked` or Hebrew equivalents.

### `busType`
- **Canonical meaning:** A reusable seat-layout template (standard rows, door-row position, back-row seat count, disabled seat slots) that a `bus` can be instantiated from. Independent of any `tour`/`bus` instance — editing a `busType` never retroactively changes buses already created from it.
- **Use:** Always `busType`, not `busModel`, `busTemplate`, or `dugmaOtobus`.
- **Plural:** `busTypes`.

### `pickupPoint`
- **Canonical meaning:** A named location where passengers can board a specific bus.
- **Use:** Always `pickupPoint`, not `station`, `stop`, or `nekudatIsuf`.
- **Plural:** `pickupPoints`. Belongs to a `bus`, not directly to a `tour`.

### `booking`
- **Canonical meaning:** A passenger's request for one or more seats on a bus, created in `pending` status.
- **Use:** Always `booking`, not `reservation`, `order`, or `hazmana`.
- **Plural:** `bookings`. Note: the request endpoint is plural (`seats/bookings`) since a single booking may cover more than one seat.

### `approve`
- **Canonical meaning:** The admin action that moves a `pending` booking's seat(s) to `taken`.
- **Use:** Always `approve`, not `confirm` or `accept`.

### `cancel`
- **Canonical meaning:** The admin action that releases a seat (from `pending` or `taken`) back to `available`.
- **Use:** Always `cancel`, not `release`, `remove`, or `unbook`.

### `toggleReserve`
- **Canonical meaning:** The admin action that locks a seat as `reserved` or unlocks it back to `available`.
- **Use:** Always `toggleReserve`/`reserved`, not `lock`/`hold`/`block`.

### `manualAssign`
- **Canonical meaning:** The admin action that directly places a passenger on a specific seat, skipping the `pending` step.
- **Use:** Always `manualAssign`, not `directBook` or `forceAssign`.

### `swapMove`
- **Canonical meaning:** The admin action that moves or swaps a passenger between two seats (typically via drag & drop).
- **Use:** Always `swapMove`, not `relocate`, `transfer`, or `dragDrop`.

### `updateOccupant`
- **Canonical meaning:** The admin action that edits the passenger details (name/phone/pickup point/notes) on a seat already in `pending` or `taken`, optionally toggling between those two statuses in the same call — unlike `manualAssign`, it never touches an `available` seat.
- **Use:** Always `updateOccupant`, not `editSeat` or `updateSeat`.

### `manifest`
- **Canonical meaning:** A consolidated, filterable report of all passengers on a bus, grouped by pickup point.
- **Use:** Always `manifest`, not `report`, `passengerList`, or `roster`.

### `admin`
- **Canonical meaning:** The authenticated user managing tours, buses, seats, and bookings (also referred to conversationally as "manager"). Every admin account holds one or more `role`s (see below); the `admin` role is the one with real management permissions.
- **Use:** Always `admin` in code/API (per `user-management-service` routes: `auth/login`, `auth/signup`); `manager` may be used in product-facing docs/UI copy, but the two refer to the same role — do not introduce a third term.

### `role`
- **Canonical meaning:** A named set of `permission`s assignable to an admin-service account. Two roles exist at launch: `admin` (full management permissions) and `user` (no permissions — the fallback for an account that signed up but hasn't been granted access; see `database-rules.md` Roles & Permissions).
- **Use:** Always `role`/`roles` (an account's `roles` field is an array). See the naming-collision warning under `passenger` above — the `user` role has nothing to do with passengers.

### `permission`
- **Canonical meaning:** A single named capability, keyed `<category>:<action>` (e.g. `tour:insert`, `seat:approve`), that a `role` can hold.
- **Use:** The `<action>` segment of any `seat:*` permission key must reuse the canonical seat-action terms already defined above (`bookings`, `approve`, `cancel`, `toggleReserve`, `manualAssign`, `swapMove`, `updateOccupant`) — never introduce a synonym (e.g. `seat:deny`, `seat:move`, `seat:insert` are incorrect; use `seat:cancel`, `seat:swapMove`, `seat:bookings`).

### `passenger`
- **Canonical meaning:** The end user requesting a seat on a tour's bus. Not an authenticated account in the current API surface (no passenger login/signup exists).
- **Use:** Always `passenger`, not `user`, `rider`, or `nose'a`. Avoid `user` for this role since `user-management-service` currently refers only to admin accounts.
- **⚠️ Naming collision to be aware of:** `user-management-service` also defines a **`user` role** (see `role` above) — this is an unrelated concept, scoped entirely to admin-account access control. A `user`-role account is still an admin-panel account with a username/password; it is never a passenger, and a passenger is never assigned a role. Don't let the shared word "user" cause the two to be conflated in code, docs, or conversation.

---

## Naming Alignment
- Keep this glossary aligned with naming decisions in `../.rule/naming-rules.md` once that file exists.
- If a new domain term is introduced, add it here before broad usage.

---

## Update Rules
- Add new terms when introducing a new bounded context, entity, or shared API concept.
- Avoid synonyms for existing terms unless explicitly approved and documented here.
- When a term is renamed in code, update this file in the same commit.