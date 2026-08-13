# System Architecture

## Purpose
Provide a concise architecture reference for service boundaries, ownership, and major flows of Hila Tours.

---

## System Overview

Hila Tours is a monorepo (`HILA-TOURS`) containing a React frontend and a Node.js/Express backend split into two microservices. The system lets a manager create tours, attach buses and pickup points to each tour, and lets passengers join a tour and choose their own seat on the bus — removing the manual work of assigning seating.

```
  HILA-TOURS (monorepo)
  ├── frontend/                React SPA (Vite)
  └── backend/
        ├── user-management-service   (auth, user, role)
        └── tour-service               (tour, buse, seat, pickup points, bookings)
```

```
  Browser / Mobile Web
        │ HTTPS + Bearer JWT
        │
        ├──▶ user-management-service   (VITE_USER_MANAGEMENT_API_URL)
        └──▶ tour-service               (VITE_TOUR_API_URL)

  Android App (Capacitor)
        │ same HTTPS + Bearer JWT
        │
        └──▶ same services, same endpoints
```

---

## Context

**Problem solved:** Managing tours, their buses, and their pickup points, while letting passengers self-select their seat on the correct bus — instead of the manager manually deciding who sits where.

**Key architectural constraints:**
- Monorepo with a clear `frontend/` + `backend/` split; each backend service is independently deployable.
- Frontend talks to each microservice directly via its own base URL — no API gateway.
- Two user roles with very different needs: **Manager** (creates/manages tours, buses, pickup points) and **Passenger** (joins a tour, picks a pickup point, picks a seat).
- Seat selection must prevent double-booking of the same seat on the same bus (concurrency-safe).
- Single developer — minimal ops overhead, reusing patterns from previous projects (Dira LeAshkaa, Daily Challenge).

---

## Primary Components

### Frontend — React SPA (`frontend/`)

| Concern | Technology |
|---|---|
| Framework | React + Vite |
| Styling | Tailwind CSS |
| State management | Zustand (or Redux slices) |
| HTTP client | Axios |
| Auth token handling | JWT stored client-side (`localStorage` on web, `@capacitor/preferences` on Android) |
| Mobile bridge | Capacitor (Android) |

Two main areas in the UI:
- **Manager console:** create/edit tours, add/edit buses per tour (seat layout + pickup points), approve/reject pending seat requests, manually assign or swap/move passengers between seats, mark seats reserved, view the manifest report per bus.
- **Passenger flow:** browse open tours, view a tour's buses, view the live seat map, submit a seat request (goes to `pending` until approved).

### Android App — Capacitor wrapper

- The same React SPA compiled with an Android build target, wrapped in a native Android shell via Capacitor — matching the pattern used in Dira LeAshkaa.
- Uses `@capacitor/preferences` for local/token storage instead of `localStorage`.
- Calls both microservices over HTTPS using the same env-configured `VITE_*_API_URL` values as the web build.
- No iOS build planned for v1 (see `product-definition.md`).

### Backend Microservices (`backend/`)

| Service | Env Variable | Responsibility |
|---|---|---|
| `user-management-service` | `VITE_USER_MANAGEMENT_API_URL` | Admin/manager auth (login, signup, logout, forgot-password) — currently scoped to admin accounts only, not passengers |
| `tour-service` | `VITE_TOUR_API_URL` | Tour CRUD, bus CRUD per tour (incl. seat layout + pickup points), seat booking/approval/cancel/reserve/manual-assign/swap, manifest report |

> Full endpoint list per service is in the [API Reference](#api-reference) section below. Detailed request/response contracts should live in `docs/api-contract/`.

### Seat Lifecycle (`tour-service`)

Seats move through a small state machine, driven mostly by admin action:

```
available ──(passenger booking request)──▶ pending ──(admin approve)──▶ taken
available ──(admin toggle-reserve)────────▶ reserved ──(admin toggle-reserve)──▶ available
pending / taken ──(admin cancel)──────────▶ available
available ──(admin manual-assign)─────────▶ taken            (direct, skips pending)
taken / pending ──(admin swap-move)───────▶ taken / pending  (moved to another seat)
```

- **`available`** — open; can be requested by a passenger or manually assigned by an admin.
- **`pending`** — a passenger submitted a request; awaiting admin approval.
- **`taken`** — confirmed, either via admin approval of a pending request or direct manual assignment.
- **`reserved`** — locked by the admin/management, not bookable by passengers (e.g., held for staff or VIPs).

Each service is a standalone Node.js / Express process, following the same `api/<domain>/<domain>.controller.ts | .service.ts | .routes.ts | .middleware.ts` pattern used in previous projects.

---

## File Structure

```
HILA-TOURS/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── services/
│   │   │   ├── http.service.ts
│   │   │   └── *.service.ts
│   │   ├── store/
│   │   │   └── slices/
│   │   │       ├── auth.slice.ts
│   │   │       ├── tour.slice.ts
│   │   │       └── booking.slice.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env.development
│   ├── .env.production
│   └── .env.example
└── backend/
    ├── user-management-service/
    │   └── api/
    │       ├── auth/
    │       ├── registration/
    │       ├── user/
    │       └── server.ts
    └── tour-service/
        └── api/
            ├── tour/            # tour CRUD
            ├── bus/             # bus CRUD + seat layout + pickup points per bus
            ├── seat/            # booking request, approve, cancel, toggle-reserve, manual-assign, swap-move
            ├── manifest/        # passenger/pickup report per bus
            └── server.ts
```

---

## Data Flow

### Auth flow
```
Login form
  → POST VITE_USER_MANAGEMENT_API_URL/api/auth/login
  → JWT returned (payload: { adminId, username, roles } — roles embedded so `tour-service` can authorize locally, see `jwt-middleware-layer` skill)
  → stored client-side
  → attached as Bearer token on all subsequent requests to both services
```

### Manager: create a tour + bus
```
Manager UI
  → POST VITE_TOUR_API_URL/api/tour                       (create tour)
  → POST VITE_TOUR_API_URL/api/tour/:tourId/buses          (add bus: seat layout + pickup points)
  → PUT  VITE_TOUR_API_URL/api/tour/:tourId/buses/:busId    (edit name / capacity / pickup points)
  → DELETE VITE_TOUR_API_URL/api/tour/:tourId/buses/:busId  (soft-delete a bus: sets `deletedAt`, does not remove the document)
```

### Passenger: request a seat
```
Passenger UI
  → GET  VITE_TOUR_API_URL/api/tour                                  (browse open tours)
  → GET  VITE_TOUR_API_URL/api/tour/:tourId/buses                    (buses for the tour)
  → GET  VITE_TOUR_API_URL/api/tour/:tourId/buses/:busId              (seat map: available / pending / taken / reserved)
  → POST VITE_TOUR_API_URL/api/tour/:tourId/buses/:busId/seats/bookings
        → seat(s) marked `pending`, awaiting admin approval
```

### Manager: approve / manage seats
```
Manager UI
  → POST .../seats/approve         pending → taken
  → POST .../seats/cancel          pending or taken → available
  → POST .../seats/toggle-reserve  available ⇄ reserved
  → POST .../seats/manual-assign   direct assignment → taken (skips pending)
  → POST .../seats/swap-move       move/swap a passenger to another seat (drag & drop)
```

### Manager: manifest report
```
Manager UI
  → GET VITE_TOUR_API_URL/api/tour/:tourId/buses/:busId/manifest
        → consolidated passenger list, pickup points, filters
```

> Note: an earlier draft of this doc had this route as `/api/v/` instead of `/api/tour/` (likely a typo in the original endpoint list). Corrected here to match the decision made in `api-contract.tour-service.yaml` — confirm this is final.

---

## Auth and Org Boundaries

- **Authentication:** JWT-based, but **admin/manager-only** at this stage — `user-management-service` exposes `login`, `signup`, `logout`, `forgot-password` for admins. Passengers are not authenticated users in the current API surface (no passenger login/signup endpoint listed).
- **Authorization (RBAC):** every admin account holds one or more `roles` (`admin` or `user`, at launch — see `database-rules.md` and `glossary.md`). `admin` holds every management permission; `user` is the safety-net default for an unsolicited signup and holds none. A new signup always gets `['user']` — never auto-promoted to `['admin']`; promotion is a manual, out-of-band action today.
- **Cross-service permission checking:** `roles`/`permissions` are collections owned by `user-management-service` only, but `tour-service` is the service that must actually enforce them (on `tour`/`bus`/`seat` management routes) — and there's no API gateway or service-to-service call between them. To resolve this without adding cross-service coupling, the admin's `roles` array is embedded directly in the JWT payload at issuance time; `tour-service` derives the effective permission set locally from the token, without querying `user-management-service`. This means a role/permission change only takes effect for a given admin the next time they log in (a new token is issued) — there's no live permission revocation mid-session. Flag this trade-off explicitly if it ever needs to change (e.g. a short-lived token + refresh flow, or a permissions-check callback).
- **Validation:** `tour-service` validates the admin JWT (and the embedded `roles`) on protected (write/approve/manage) routes. No central auth gateway.
- **Passenger identity:** since passengers don't log in, a booking request must carry passenger identifying info directly in the request body (name/phone, etc.) — this should be confirmed and documented in the `seats/bookings` API contract.
- **Authorization scope:** all seat state changes (approve, cancel, toggle-reserve, manual-assign, swap-move) require the corresponding `seat:*` permission (held by the `admin` role only, at launch). Passengers can only create a booking request; they cannot approve, cancel, or move seats.
- **Concurrency:** since bookings go through a `pending` state rather than instant confirmation, the main race condition to guard against is two passengers requesting the same seat before an admin approves either one — `tour-service` should still use an atomic check when creating a `pending` booking (e.g., only allow the request if the seat is currently `available`).
- **Deletion model:** `DELETE` routes on `tour` and `bus` are soft-delete — they set `deletedAt` on the document rather than removing it, matching the soft-delete pattern in `database-rules.md`. List/get endpoints exclude soft-deleted records.

---

## API Reference

Derived from the endpoint list produced against the AI Studio demo to cover its full flow. Treat as a first draft — request/response bodies still need to be documented in `docs/api-contract/`.

### 1. `user-management-service` (admin auth)
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Admin/manager login |
| POST | `/api/auth/signup` | Register a new admin |
| POST | `/api/auth/logout` | Admin logout |
| POST | `/api/auth/forgot-password` | Password reset request |

### 2. `tour-service`

**Tours**
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/tour` | List all tours |
| GET | `/api/tour/:tourId` | Get a specific tour |
| POST | `/api/tour` | Create a tour (admin) |
| PUT | `/api/tour/:tourId` | Update a tour (admin) |
| DELETE | `/api/tour/:tourId` | Soft-delete a tour (admin) |

**Buses**
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/tour/:tourId/buses` | List buses for a tour |
| GET | `/api/tour/:tourId/buses/:busId` | Get a bus + its seat map |
| POST | `/api/tour/:tourId/buses` | Add a bus to a tour (admin) |
| PUT | `/api/tour/:tourId/buses/:busId` | Update a bus (name, capacity, pickup points) |
| DELETE | `/api/tour/:tourId/buses/:busId` | Soft-delete a bus (admin) |

**Seats & Bookings**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/tour/:tourId/buses/:busId/seats/bookings` | Passenger seat request → `pending` |
| POST | `/api/tour/:tourId/buses/:busId/seats/approve` | Admin approves pending seat(s) → `taken` |
| POST | `/api/tour/:tourId/buses/:busId/seats/cancel` | Admin cancels/releases a seat → `available` |
| POST | `/api/tour/:tourId/buses/:busId/seats/toggle-reserve` | Admin locks/unlocks a seat as `reserved` |
| POST | `/api/tour/:tourId/buses/:busId/seats/manual-assign` | Admin directly assigns a passenger to a seat |
| POST | `/api/tour/:tourId/buses/:busId/seats/swap-move` | Admin swaps/moves passengers between seats (drag & drop) |

**Manifest & Reports**
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/tour/:tourId/buses/:busId/manifest` | Consolidated passenger/pickup report, with filters |

---

## External Dependencies

| Service | Purpose | Notes |
|---|---|---|
| Render (or TBD host) | Frontend hosting | Static site, GitHub deploy |
| Render (or TBD host) | Backend microservices hosting | One service per microservice |
| MongoDB Atlas | Primary database (backend-owned) | Frontend never connects directly |

---

## Operational Concerns

**Environment configuration:**
- Backend URLs are `VITE_*` env variables configured per environment; no backend URLs hardcoded in source.

**Failure isolation:**
- If `user-management-service` is down, no one can log in, but already-authenticated sessions calling `tour-service` may still work until token expiry.
- If `tour-service` is down, tour browsing/booking is unavailable, but login/registration still works.

**Deployments:**
- Frontend deploys independently from backend — no build coupling.
- Breaking API contract changes require coordinated deploy across both services.

**Open questions / TBD:**
- Final hosting provider for frontend/backend (assumed Render, matching previous projects — confirm or update).
- Whether managers are a single global admin or multiple managers each owning their own tours.
- Passenger identity model: since there's no passenger auth endpoint, how is a passenger identified across requests (name/phone only? a lightweight session/token issued by `tour-service` itself? something else)?
- The manifest route: an earlier endpoint list used `/api/v/:tourId/...` while every other tour route uses `/api/tour/:tourId/...`; this doc and `api-contract.tour-service.yaml` now use `/api/tour/...` for consistency — confirm this is the final decision.
- Whether pickup points live on the **bus** (as the `PUT bus` route suggests) or on the **tour** — current API list places them on the bus; earlier draft of this doc had them on the tour, now corrected.
- Whether a passenger can request more than one seat at a time (`seats/bookings` is plural — "seat/ים") and if so, how partial approval is handled (e.g., 2 requested, only 1 approved).
- Roles are embedded in the JWT at issuance, so a role change doesn't take effect until the admin's next login (see Auth and Org Boundaries) — confirm this delay is acceptable, or decide on a shorter-lived token / live-check alternative if not.

---

## Change Log
- 2026-07-31: Initial architecture defined for Hila Tours (tour + seat booking system, monorepo with `user-management-service` and `tour-service`).
- 2026-07-31: Updated with real API list generated from the AI Studio demo — seat lifecycle is approval-based (`available → pending → taken`, plus `reserved`, `manual-assign`, `swap-move`), pickup points live on the bus, and `user-management-service` currently covers admin accounts only.
- 2026-07-31: `DELETE` routes for `tour` and `bus` are now documented as soft-delete (set `deletedAt`, don't remove the document), matching `database-rules.md`'s soft-delete pattern and `api-contract.tour-service.yaml`. Manifest route path corrected from `/api/v/` to `/api/tour/` to match the API contract decision.
- 2026-07-31: Native mobile app moved into scope (see `product-definition.md`) — added a Capacitor-based Android build, matching the Dira LeAshkaa pattern (`@capacitor/preferences` for token storage on native, same HTTPS endpoints as web). No iOS build planned for v1.
- 2026-07-31: Added RBAC (`roles`/`permissions`, owned by `user-management-service`) — an admin's `roles` are embedded in the JWT payload at issuance so `tour-service` can authorize locally without cross-service calls; new signups default to the permission-less `user` role, never auto-promoted to `admin`. See `database-rules.md` and `glossary.md` for the full model.

## Update Triggers
- Update this file when API routes, auth boundaries, or major component ownership changes.