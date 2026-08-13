# PRD — Hila Tours

**Version:** 1.0
**Design Source:** `raw_from_ai_studio/` (source of truth for colors, spacing, and component structure)
**Status:** In Development

---

## Overview

Hila Tours is a real-time tour and bus-seat management system for two audiences: **passengers**, who pick a tour and bus, view a live interactive seat map, and submit a seat request with their pickup point; and **admins**, who create and manage tours and buses, approve or manage passenger seat requests, manually assign or swap seats, and generate a consolidated passenger/pickup manifest report.

---

## Screens

### Screen 1 — Gateway / Entry View
- Landing/routing screen.
- Choice between entering as a passenger (to browse tours) or logging in as an admin.
- Admin login modal: username/password (or access code) — issues an admin JWT.

### Screen 2 — Admin Sign Up
- Separate page (not part of the Gateway modal), matching the design: title "יצירת חשבון חדש", subtitle "הזן את פרטיך להרשמה למערכת".
- Fields: full name, email, password (with show/hide toggle) — all required. Matches `SignupData` in `api-contract.user-management-service.yaml` (fullname/email/password).
- Submit button: "הרשמה למערכת" → `POST /api/auth/signup`.
- Links: "יש לך כבר חשבון? התחבר" (back to login) and "חזרה לעמוד הראשי" (back to Gateway).
- **A successful sign-up grants no admin permissions.** The new account is created with `roles: ["user"]` (empty permission set) — never `["admin"]` — per `database-rules.md`/`glossary.md`. The account can log in, but every `tour`/`bus`/`seat` management action will be rejected until an existing admin manually promotes it. The UI should not imply that signing up grants immediate management access beyond the ability to log in.

### Screen 3 — Passenger View
- Tour and bus selector: switch between active tours and their associated buses.
- **Interactive bus seat map:**
  - Visual layout of seat rows, aisle, driver position, front/middle door.
  - Color-coded seat status indicators: `available` (green/white), `pending` (yellow/amber), `taken` (red/gray), `reserved` (purple) — see `style-rules.md` for the final token mapping.
  - **Status must never be conveyed by color alone** (accessibility requirement — see `accessibility-layer` skill): each status also carries a distinct icon inside the seat (e.g. a checkmark for `taken`, a clock for `pending`, a lock for `reserved`, nothing for `available`) and a text label available via tooltip/`aria-label`, so the map is usable by colorblind users and in high-contrast/grayscale display modes.
  - Tap-to-select a seat.
- **Passenger registration modal:** full name, phone number, and pickup point selection (from the bus's predefined pickup points). Submitting sends the seat to `pending`, awaiting admin approval.

### Screen 4 — Admin Dashboard
Tabbed workspace:

- **Tab 1 — Seat Management** (seat map in admin mode):
  - View the bus seat map with admin controls.
  - Quick approve: `pending → taken`.
  - Cancel/release: clears a taken or pending seat back to `available`.
  - Admin reserve: marks seat(s) as `reserved`.
  - **Manual assign / swap-move modal:** directly assign a passenger to a seat, move a passenger from seat X to seat Y, or swap two passengers' seats.

- **Tab 2 — Tour & Bus Management:**
  - **Tour management:** create, edit, and (soft-)delete tours (title, date, notes, active/archived status).
  - **Bus management:** create/edit buses — bus name, total seat count, door position (front/middle/back), driver side (left/right), and manage the pickup-point list (add/remove/reorder).

- **Tab 3 — Passenger Manifest Report:**
  - Consolidated table of all passengers and seats for the selected bus.
  - Quick filter by status: all / `pending` / `taken` / `reserved`.
  - Free-text search by name, phone, pickup point, or seat number.
  - "Copy consolidated report" button: copies a formatted summary to the clipboard for sharing (e.g. WhatsApp) or printing.

---

## Functional Requirements

| ID  | Requirement | API Route / Service |
|-----|---|---|
| F1  | Admin logs in with credentials, receiving a JWT. | `POST /api/auth/login` (`user-management-service`) |
| F1b | A new user can sign up (fullname/email/password), creating an account with `roles: ["user"]` (no permissions) — never auto-granted `admin`. | `POST /api/auth/signup` (`user-management-service`) |
| F2  | Load the list of tours and buses. Passengers get each bus's seat map embedded in the tour response itself (PII-safe projection: id/position/status only — see SEV-001), via `GET /api/tour` and `GET /api/tour/:tourId`. `GET /api/tour/:tourId/buses/:busId` returns the full seat map including passenger PII and is admin-only (`requireAdmin`) — not used by the passenger flow. | `GET /api/tour`, `GET /api/tour/:tourId`, `GET /api/tour/:tourId/buses` (public); `GET /api/tour/:tourId/buses/:busId` (admin-only) (`tour-service`) |
| F3  | Passenger selects an available seat and submits a request with name, phone, and pickup point (→ `pending`). | `POST /api/tour/:tourId/buses/:busId/seats/bookings` (`tour-service`) |
| F4  | Admin approves a pending seat request (`pending → taken`). | `POST /api/tour/:tourId/buses/:busId/seats/approve` (`tour-service`) |
| F5  | Admin cancels/releases a seat back to `available`. | `POST /api/tour/:tourId/buses/:busId/seats/cancel` (`tour-service`) |
| F6  | Admin locks/reserves a seat administratively (`reserved`). | `POST /api/tour/:tourId/buses/:busId/seats/toggle-reserve` (`tour-service`) |
| F7  | Admin manually assigns a passenger to a seat, or moves/swaps a passenger between two seats. | `POST /api/tour/:tourId/buses/:busId/seats/manual-assign`, `POST /api/tour/:tourId/buses/:busId/seats/swap-move` (`tour-service`) |
| F8  | Admin creates, edits, and soft-deletes tours. | `POST` / `PUT` / `DELETE /api/tour/:tourId` (`tour-service`) |
| F9  | Admin creates, edits, and soft-deletes buses (seat count, door/driver config, pickup points). | `POST` / `PUT` / `DELETE /api/tour/:tourId/buses/:busId` (`tour-service`) |
| F10 | Generate the manifest report (search, filter, copy-to-clipboard). | `GET /api/tour/:tourId/buses/:busId/manifest` (`tour-service`) + frontend reporting/client-state logic |

---

## Non-Functional Requirements

- Full RTL (Hebrew) support: right-to-left layout, clear and readable typography.
- Real-time seat-map sync: seat status changes should reflect without a full page reload.
- Mobile-first responsiveness: the seat map and tables must work well on passengers' and on-site admins' phones (responsive web layout).
- Native Android app: the same app also ships as a native Android build via Capacitor, alongside the responsive web app (see `architecture.md` / `product-definition.md`). No iOS build planned for v1.
- Accessibility: WCAG 2.1 Level AA — semantic HTML, full keyboard operability, visible focus states, and no information conveyed by color alone (see `accessibility-layer` skill). This applies especially to the seat map, where status must be distinguishable via icon/label, not color alone.
- Security: all admin actions (create/edit/delete tour or bus; approve/cancel/reserve/manual-assign/swap-move) require a valid admin JWT.
- Server is the source of truth for seat status — the frontend never assumes a seat state without confirming it against the API (especially given the concurrency risk on booking requests — see `database-rules.md`).
- `DELETE` on tours/buses is soft-delete (`deletedAt`), not permanent removal — see `architecture.md` / `database-rules.md`.

---

## Acceptance Criteria

1. **AC-1:** A passenger who submits a seat request immediately sees that seat visually change to `pending`.
2. **AC-2:** An admin sees all pending requests in both the seat map and the manifest table, and can approve them with a single click.
3. **AC-3:** Moving a passenger from seat X to seat Y, or performing a swap, updates both seats correctly on the bus map with no inconsistency.
4. **AC-4:** Changing a bus's pickup points immediately updates the available options in the passenger registration form.
5. **AC-5:** Clicking "copy consolidated report" in the manifest copies a clear, well-formatted text summary including tour details, passengers, and pickup points.
6. **AC-6:** `DELETE` on a tour or bus does not remove it from the database — it sets `deletedAt` and the record disappears from list/get results (per soft-delete rules).
7. **AC-7:** Concurrent seat requests for the same seat resolve so exactly one succeeds; the other receives a clear conflict response and refreshed seat map (see `error-handling-rules.md`).
8. **AC-8:** UI matches `raw_from_ai_studio/` designs (colors, spacing, component structure), using `Tour` naming throughout.
9. **AC-9:** The app builds and runs as a native Android package (Capacitor), with the auth token persisted via `@capacitor/preferences` rather than `localStorage` on that build.
10. **AC-10:** A colorblind user (or a grayscale/high-contrast display) can correctly identify every seat's status (`available`/`pending`/`taken`/`reserved`) without relying on color — verified via icon and/or text label on each seat.
11. **AC-11:** A newly signed-up account can log in but receives `401`/`403` on every `tour`/`bus`/`seat` management action until an existing admin manually promotes it to the `admin` role.

---

## Data Model

See `glossary.md` for domain terminology and `database-rules.md` for full field definitions.

- `tour` — name, date, description, `createdBy`, soft-delete (`deletedAt`).
- `bus` — belongs to a `tour`; name, `seatLayout`, `pickupPoints[]` (name + order), soft-delete (`deletedAt`).
- `seat` — belongs to a `bus`; `position`, `status` (`available` | `pending` | `taken` | `reserved`), `pickupPointName`, `passengerName`, `passengerPhone`, `requestedAt`, `approvedAt`, `assignedBy`.
- `admin` — username, email, passwordHash, `roles[]` (`admin` | `user` — see F1b/AC-11 and `database-rules.md` "Roles & Permissions"), soft-delete (`deletedAt`). No `passenger` account entity exists — passenger identity lives on the `seat` record itself.

---

## Out of Scope (v1)
- Online payment/ticketing for seats.
- Automatic SMS notification to passengers on seat approval (planned for a future version).
- Multi-language support (Hebrew RTL only for now).
- The AI Studio demo's seat-action routes (`seats/request`, `seats/release`, `seats/reserve`, `seats/assign-manual`, `seats/swap`) still differ from the canonical action names already decided (`seats/bookings`, `seats/cancel`, `seats/toggle-reserve`, `seats/manual-assign`, `seats/swap-move`) — this PRD uses the canonical action names throughout; confirm/resolve separately if the demo code is reused as-is.
- Whether admins have per-tour ownership/permissions, or a single shared admin pool (see `product-definition.md` Open Questions).