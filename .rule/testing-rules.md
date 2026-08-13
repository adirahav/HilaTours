# Testing Rules

## Purpose
- Define consistent expectations for test coverage, test design, and release confidence across this repo (frontend + both backend microservices).

## Current State
- No test framework is installed and no automated tests exist in the repo yet (no Vitest/Jest/Playwright/Cypress config, no `*.test.ts(x)` files, no `test` script in any `package.json`).
- These rules define the target conventions to follow once testing is introduced.
  - Recommended stack, frontend (Vite + React): Vitest + React Testing Library for unit/component tests.
  - Recommended stack, backend (Node/Express, per microservice): Vitest or Jest for unit/integration tests, with an in-memory or test-database instance for `tour-service` (never point tests at the real MongoDB Atlas cluster).

## Scope
- Apply these rules to unit, component, and integration tests across `frontend/`, `backend/user-management-service/`, and `backend/tour-service/`.
- End-to-end tests, where added, should cover the two critical cross-service flows: admin creates a tour → bus → pickup points; passenger requests a seat → admin approves/manages it.

## Core Principles
- Test behavior, not implementation details.
- Keep tests deterministic and isolated.
- Prefer fast feedback: unit tests first, integration tests for cross-domain logic, end-to-end for critical user flows.
- Add tests for every bug fix when feasible.
- Seat-state logic is the highest-risk area in this codebase (concurrency, admin overrides) — it should have the deepest coverage of any single domain.

## Required Coverage Areas

### Frontend (`frontend/src/`)
- All service-layer modules in `services/` (`tour.service.ts`, `bus.service.ts`, `seat.service.ts`, `manifest.service.ts`, `auth.service.ts`) — domain logic, formatting, and edge cases.
- All calls that go through `http.service.ts` — mock it rather than hitting a real API; cover success, error, loading, and seat-conflict (409) states for each consuming service.
- Admin session boundary behavior (e.g. 401 handling and redirect in `http.service.ts`).
- Zustand slices in `store/slices/` (`tour.slice.ts`, `bus.slice.ts`, `seat.slice.ts`, `auth.slice.ts`) — state transitions, especially the seat map's `available`/`pending`/`taken`/`reserved` transitions.
- Custom hooks in `hooks/` (e.g. `useSeatMap.ts`).
- Form validation logic (tour/bus creation fields, seat selection, pickup point selection).
- User-facing failure flows: seat request submitted for a seat that's no longer available; admin trying to approve/cancel a seat already changed by another action.

### Backend — `user-management-service`
- Auth controller/service logic: login, signup, logout, forgot-password — valid credentials, invalid credentials, expired/malformed tokens.
- JWT issuance and validation middleware.

### Backend — `tour-service`
- Tour CRUD (`tour.service.ts`) — including delete cascading behavior (what happens to buses/bookings when a tour is deleted).
- Bus CRUD (`bus.service.ts`) — including seat-layout and pickup-point validation on create/update.
- Seat lifecycle (`seat.service.ts`) — this is the most important test target in the repo:
  - `available → pending` (booking request) rejects if the seat isn't `available`.
  - `pending → taken` (approve) rejects if the seat isn't `pending`.
  - `cancel` correctly returns a seat to `available` from both `pending` and `taken`.
  - `toggle-reserve` correctly moves between `available` and `reserved`, and rejects if the seat is `pending`/`taken`.
  - `manual-assign` correctly moves a seat straight to `taken`, and rejects if the seat is already `taken`/`reserved`.
  - `swap-move` correctly moves a passenger between two seats and leaves the vacated seat in the right resulting state.
  - **Concurrency case:** two simultaneous booking requests for the same seat — exactly one should succeed; the other should get a clear conflict response. Test this with a true concurrent/atomic-update scenario, not just sequential calls.
- Manifest report (`manifest.service.ts`) — correct grouping by pickup point, correct filtering, correct handling of a bus with partially-filled seats.
- Admin-only middleware on `tour`/`bus`/`seat` write and management routes.

## Test Structure Rules
- Arrange tests with clear setup, action, and assertion phases.
- Use descriptive test names that state expected behavior.
- Keep one primary assertion intent per test.
- Avoid shared mutable state between tests.

## Data and Fixtures
- Use minimal fixtures focused on the scenario (e.g. a small bus with 4–6 seats rather than a full real seat layout, unless testing layout-specific logic).
- Prefer factories/builders over large static fixtures (e.g. a `buildSeat(status, overrides)` helper).
- Do not embed real secrets, keys, or credentials in test data.

## Reliability Rules
- No flaky tests in mainline branches.
- Mock the external API (via `http.service.ts`) on the frontend; use a test/in-memory database on the backend — never hit the real MongoDB Atlas cluster or a real deployed microservice from tests.
- Freeze/override time when behavior depends on it (e.g. `requestedAt`/`approvedAt` timestamps in the manifest).
- Do not rely on test execution order — this matters especially for seat-state tests, which must not leak state between cases.

## Pull Request Expectations
- New features include happy-path and failure-path tests.
- Bug fixes include a regression test that fails before and passes after the fix.
- Any change to seat-state transitions requires an accompanying test update — this is the one area where "I'll add tests later" is not acceptable given the concurrency risk.
- Update or remove obsolete tests when behavior changes intentionally.