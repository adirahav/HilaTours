# Naming Rules

## Purpose
- Keep naming predictable across pages, components, services, routes, state, and data fields across both frontend and backend in this repo.

## Core Conventions
- Prefer singular entity names by default.
  - Examples: `tour.service.ts`, `tour.slice.ts`, `tour.types.ts`; `bus.service.ts`, `seat.service.ts`.
- Use consistent domain terms across the codebase — see `.doc/glossary.md` for the full list.
  - Always use `tour` (not `trip`/`journey`).
  - Always use `bus` (not `vehicle`).
  - Always use `seat` and `seatStatus` values `available`/`pending`/`taken`/`reserved` (not `open`/`booked`/`held`/`locked`).
  - Always use `pickupPoint` (not `station`/`stop`) — belongs to a `bus`, not a `tour`.
  - Always use `booking` (not `reservation`/`order`).
  - Always use `admin` in code/API (not `manager`/`user` for this role).
  - Always use `passenger` (not `user`/`rider`) — passengers are not authenticated accounts.
  - Always use the exact action verbs `approve`, `cancel`, `toggleReserve`, `manualAssign`, `swapMove`, `manifest` for the corresponding seat/report actions — not synonyms like `confirm`/`release`/`lock`/`forceAssign`/`relocate`/`report`.

## Route Naming

### Frontend routes
- Use kebab-case for multi-word route paths.
  - Examples: `/forgot-password`, `/tour/:tourId/bus/:busId`.
- Single-word routes are plain lowercase: `/login`, `/signup`, `/home`, `/tour`.
- Use `/` for resource grouping/nesting: `/tour/:tourId`, `/tour/new`.

### Backend API routes
- Follow the existing convention from the API list: `/api/<domain>` for the collection, `/api/<domain>/:id` for a single resource, and kebab-case for multi-word action segments.
  - Examples: `/api/auth/forgot-password`, `/api/tour/:tourId/bus/:busId/seats/toggle-reserve`, `/api/tour/:tourId/bus/:busId/seats/manual-assign`, `/api/tour/:tourId/bus/:busId/seats/swap-move`.
- Nest sub-resources under their parent: buses under a tour (`/api/tour/:tourId/bus`), seats/bookings under a bus (`/api/tour/:tourId/bus/:busId/seats/...`).
- Keep a single canonical path prefix per domain. Note: the manifest route currently uses `/api/v/:tourId/bus/:busId/manifest` — this breaks the `/api/tour/...` convention used everywhere else and should be corrected to `/api/tour/:tourId/bus/:busId/manifest` unless there's a specific reason for `/api/v/`.

## File Naming

### Frontend
- Pages: `<Name>Page.tsx` — e.g. `HomePage.tsx`, `TourPage.tsx`, `BusSeatMapPage.tsx`.
- Components: plain PascalCase, no suffix, grouped by feature folder — e.g. `components/common/Notification.tsx`, `components/seatMap/SeatCell.tsx`.
- Services: `<domain>.service.ts` — e.g. `tour.service.ts`, `bus.service.ts`, `seat.service.ts`, `manifest.service.ts`, `auth.service.ts`.
- Zustand slices: `<domain>.slice.ts` — e.g. `tour.slice.ts`, `bus.slice.ts`, `seat.slice.ts`, `auth.slice.ts`.
- Utils: `<name>.utils.ts` — e.g. `seat-layout.utils.ts`, `platform.utils.ts`.
- Hooks: `use<Name>.ts` — e.g. `useSeatMap.ts`, `useDebugTap.ts`.
- Router guards: `<Name>Route.tsx` — e.g. `ProtectedRoute.tsx` (admin-only routes).
- Layouts: `<Name>Layout.tsx` — e.g. `AppLayout.tsx`.
- Types: `<domain>.types.ts` — e.g. `tour.types.ts`, `seat.types.ts`.

### Backend (per microservice)
- Follow the `<domain>.controller.ts` / `<domain>.service.ts` / `<domain>.routes.ts` / `<domain>.middleware.ts` pattern per domain folder (see `architecture.md`).
  - Examples: `tour.controller.ts`, `bus.service.ts`, `seat.routes.ts`, `manifest.controller.ts`, `auth.middleware.ts`.
- Domain folder names are singular and match the glossary term: `api/tour/`, `api/bus/`, `api/seat/`, `api/manifest/`, `api/auth/`.

## Data Fields
- Identity: every entity's client-facing identifier is `id` (a `uuid` string). Mongo's `_id` (ObjectId) is an internal detail — see `.rule/database-rules.md` "External Identity" and the `mongoose-models-layer` skill — and must never appear in an API response, a frontend type, or a URL param name. Frontend types/interfaces always declare `id: string`, never `_id`.
- Use camelCase for all TypeScript interface/type fields, state fields, and MongoDB document fields.
  - Examples: `seatStatus`, `pickupPointId`, `busCapacity`, `approvedAt`, `requestedAt`.
- Use the exact `seatStatus` values `available` / `pending` / `taken` / `reserved` (lowercase strings) everywhere — UI, API payloads, and DB — no alternate casing or synonyms.
- Never use snake_case in code.

## General
- Keep component, route, and file naming aligned with domain names from `.doc/glossary.md`.
- Avoid introducing synonyms for existing concepts — consult `.doc/glossary.md` first.