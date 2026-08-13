# Coding Rules

## Purpose
- Define core coding rules for JavaScript and TypeScript in this repository.
- Project: `HILA-TOURS` — a monorepo with a React/Vite frontend and a Node.js/Express backend split into two microservices (`user-management-service`, `tour-service`).

## Required
- Do not use trailing semicolons in JavaScript or TypeScript files.
- If a semicolon is required for syntax safety, place it at the beginning of the line.

## Examples
- Preferred:
	- `const value = getValue()`
- Allowed when needed for syntax safety:
	- `;(() => init())()`

## Architecture
- This is a monorepo with two independently deployable parts: `frontend/` and `backend/`.
- `backend/` contains two microservices — `user-management-service` and `tour-service` — each its own Node.js/Express process with its own `package.json`.
- The frontend never calls a database directly; it only talks to `user-management-service` and `tour-service` over HTTPS.

### Frontend
- All communication with the backend goes through the two external REST APIs (`user-management-service`, `tour-service`) — there is no direct DB access from the frontend.
- All API calls and business logic must be encapsulated in a service file in `src/services/` (e.g. `auth.service.ts`, `tour.service.ts`, `bus.service.ts`, `seat.service.ts`, `manifest.service.ts`).
- Components must not call the API directly — always go through a service.
- All HTTP requests go through `src/services/http.service.ts`, which centralizes error handling and 401/session-expiry logic. Domain services call `http.service.ts`, not `fetch`/`axios` directly.
- Service files must follow the pattern: `<domain>.service.ts` (e.g. `tour.service.ts`, `auth.service.ts`).

### Backend (per microservice)
- Each microservice organizes its domains under `api/<domain>/`, following the pattern:
  `<domain>.controller.ts`, `<domain>.service.ts`, `<domain>.routes.ts`, `<domain>.middleware.ts`.
  - `tour-service` domains: `tour/`, `bus/`, `seat/`, `manifest/`.
  - `user-management-service` domains: `auth/` (login, signup, logout, forgot-password).
- Controllers handle request/response only — no business logic in controllers; business logic lives in the domain's `.service.ts`.
- Routes files only wire up `<method> + path → controller` — no logic in routes files.
- Middleware files hold auth/validation checks scoped to that domain (e.g. admin-JWT check on `tour`/`bus`/`seat` write routes).
- Cross-domain logic within the same microservice (e.g. a `seat` action that needs `bus` capacity) should be called through the other domain's `.service.ts`, not by reaching into its DB models directly.

## State Management

### Frontend (React + Zustand)
- Global state is managed exclusively via Zustand, using the sliced pattern in `src/store/slices/` (e.g. `auth.slice.ts`, `tour.slice.ts`, `bus.slice.ts`, `seat.slice.ts`).
- Local UI state (e.g. open/close, hover, drag-in-progress for swap-move) may use `useState` — do not push it into the store.
- Services update the store directly (e.g. via `useStore.setState(...)`) after receiving an API response — components must not duplicate that state update after calling a service.
- Loading / error state for a given flow should live in the relevant Zustand slice when shared across components, or in local `useState` when scoped to a single component (see `.rule/error-handling-rules.md` for the async-call pattern).
- The seat map is a special case: since seat status can change from admin actions (approve, cancel, reserve, manual-assign, swap-move) as well as passenger requests, keep the live seat map in `seat.slice.ts` as the single source of truth rather than deriving it locally in the seat-map component.