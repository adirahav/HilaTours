# Product Definition

## Purpose
Define shared product intent so planning, architecture, and delivery stay aligned.

---

## Product Vision
Hila Tours removes the manual work of seating passengers on tour buses. Instead of an admin figuring out by hand who sits where, the admin sets up a tour with its buses and pickup points, and passengers browse the tour and request their own seat — the admin approves, manages, and finalizes the seating from there.

---

## Target Users

**Primary users — admins / tour managers:**
- Run one or more tours, each with one or more buses.
- What they are trying to accomplish: set up a tour quickly (buses, seat layout, pickup points), let passengers self-select seats instead of assigning everyone manually, and keep full control to approve, reassign, reserve, or swap seats when needed.

**Secondary users — passengers:**
- People joining a specific tour who need to pick a pickup point and a seat on the bus.
- Core need: see a clear, live seat map and pickup point list, and request the seat they want without back-and-forth with the admin.

---

## Problem Statement
When an admin organizes a tour with multiple buses and many passengers, manually deciding who sits where — and keeping track of who boards from which pickup point — becomes a time-consuming, error-prone task, especially as the number of passengers grows. Passengers, meanwhile, have no visibility into the bus layout or say in where they sit. Hila Tours solves this by letting passengers view the live seat map and request their own seat, while keeping the admin in full control of approving requests and resolving conflicts or special cases (reserved seats, manual reassignment, swaps).

---

## Value Proposition
Hila Tours gives admins a fast way to stand up a tour — buses, seat layouts, and pickup points — and hands seat selection over to the passengers themselves, removing the manual seating burden entirely. Admins keep full oversight: every passenger request lands as `pending` until approved, and admins can still directly assign, reserve, or move seats at any time. A consolidated manifest report ties passengers to pickup points for day-of-tour logistics.

**Key differentiators:**
- Passenger self-service seat selection instead of admin-driven manual seating.
- Admin approval gate on every request — no accidental double-booking, no loss of control.
- Full manual override tools (direct assign, reserve, swap/move) for edge cases.
- One consolidated manifest per bus for pickup-point-based boarding logistics.

---

## Product Scope

**In scope:**
- Admin authentication (login, signup, logout, forgot password).
- Basic role-based permissions (RBAC): every account carries a `roles` array; `admin` holds every tour/bus/seat management permission, `user` (the role a self-signup gets by default) holds none. This closes the open-signup gap — signing up alone grants no management access — without introducing per-admin tour ownership (see Out of scope). See `.rule/database-rules.md` "Roles & Permissions (RBAC)".
- Tour management: create, view, update, delete tours.
- Bus management per tour: create, view, update, delete buses, each with a seat layout and pickup points.
- Passenger-facing browsing: view open tours, view a tour's buses, view a bus's live seat map (available / pending / taken / reserved).
- Passenger seat request: submit a request for one or more seats (goes to `pending`).
- Admin seat management: approve pending requests, cancel/release seats, toggle a seat to `reserved`, manually assign a passenger directly to a seat, swap/move passengers between seats.
- Manifest report per bus: consolidated passenger list grouped by pickup point, with filtering.
- Native mobile app via Capacitor (Android), wrapping the same React web app — matching the pattern used in Dira LeAshkaa. Persisted values (e.g. any local state) use `@capacitor/preferences` on the native app, falling back to `localStorage` on web.

**Out of scope (v1):**
- Passenger accounts / passenger authentication (passengers are not logged-in users in the current flow).
- Payment or pricing for seats.
- Real-time notifications (e.g., notifying a passenger their request was approved).
- Per-admin tour ownership/scoping (any `admin`-role account can manage any tour — no "this tour belongs to that admin" restriction; assumed single shared admin pool for now — see Assumptions). Note: this is distinct from the basic `admin`/`user` RBAC permission levels, which *are* in scope (see In scope).
- Automatic/algorithmic seat assignment (seat choice is manual, either by passenger request or admin action).
- iOS app (not planned yet — Android only for now, matching Dira LeAshkaa's current scope).

---

## Success Metrics

**Business metrics:**
- Number of tours created per month.
- Number of seat requests submitted per tour.

**Product metrics:**
- Request-to-approval time: how quickly admins process pending seat requests (target: TBD after first tours run).
- Manual intervention rate: percentage of seats filled via `manual-assign`/`swap-move` vs. passenger self-request — a high rate may signal friction in the passenger flow.
- Seat map completion rate: percentage of a bus's seats filled (taken) by the time the tour departs.

*Baseline values to be defined after the first live tours.*

---

## Constraints and Assumptions

**Constraints:**
- Every passenger seat request starts as `pending` — no instant/auto-confirmed booking; an admin action is always required to finalize a seat as `taken`.
- Admin actions (approve, cancel, reserve, manual-assign, swap-move) require an authenticated admin JWT.
- Passengers currently have no login — identity for a booking request must be captured directly on the request itself (name/phone, etc.).

**Assumptions to validate:**
- A single admin (or an undifferentiated admin pool) manages all tours — no per-admin ownership scoping needed yet.
- Passengers are comfortable submitting a seat request without an account and waiting for admin approval, rather than getting instant confirmation.
- One tour can have multiple buses, and a passenger picks both a bus/pickup point and a seat as part of the same request.
- Pickup points belong to a specific bus, not the tour as a whole (a tour's buses may have different pickup points).

---

## Prioritization Rules
- Prioritize features that reduce the admin's manual seating workload.
- Prefer changes that make the passenger seat-request flow clearer and lower-friction.
- Defer scope like payments, notifications, or passenger accounts until the core request → approve → manifest flow is validated.
- Do not add per-admin ownership/multi-tenant complexity until it's confirmed to be needed (the basic `admin`/`user` RBAC permission split is already in scope — this is about not going further than that).

---

## Update Triggers
Update this file when:
- Core user segments shift (e.g., adding passenger accounts, or supporting multiple independent admins/organizations).
- Product scope changes materially (e.g., adding payments, notifications, or automatic seat assignment).
- Success metrics are revised after the first tours run.
- A new platform (e.g., iOS) is added to scope.