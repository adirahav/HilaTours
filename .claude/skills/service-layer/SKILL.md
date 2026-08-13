---
name: service-layer
description: Use this skill when implementing business logic, managing data persistence, or creating reusable utility functions outside of React components.
references:
  - @api-layer/SKILL.md
  - @state-management-layer/SKILL.md
---

# Service Layer Guidelines
*Goal:* Centralize the application's core logic and data management to keep components "lean" and focused only on UI.

**Core Responsibilities:**
- *Data Persistence:* Managing how data is saved and retrieved (via the two backend microservices, `user-management-service` and `tour-service`).

- *Business Logic:* Implementing data transformations and request/response shaping between the API and the UI.

- *Utility Functions:* Creating reusable helpers (dates, strings, etc.) that aren't tied to a specific UI.

## File Location
- Place services in `frontend/src/services/`
- Name files with `.service.ts` suffix (e.g., `tour.service.ts`, `bus.service.ts`, `seat.service.ts`, `manifest.service.ts`, `auth.service.ts`)
- Create a corresponding `.test.ts` file for tests

## Service Pattern
Services are pure functions, not classes. Export named functions:

```typescript
// tour.service.ts
import { httpService } from "./http.service"

const BASE_URL = 'tour/'

export interface Tour {
    id?: string
    name: string
    date: string
    description?: string
    deletedAt?: string | null
    [key: string]: any
}

export const tourService = {
    getList,
    getById,
    save,
    remove
}

async function getList(): Promise<Tour[]> {
    try {
        const tours = await httpService.get<Tour[]>(BASE_URL)
        return tours
    } catch (err) {
        console.error(`Had problems getting tours`)
        throw err
    }
}

async function getById(tourId: string): Promise<Tour> {
    try {
        const tour = await httpService.get<Tour>(`${BASE_URL}${tourId}`)
        return tour
    } catch (err) {
        console.error(`Had problems getting tour ${tourId}`)
        throw err
    }
}

async function save(tourToSave: Tour): Promise<Tour> {
    const method: 'put' | 'post' = tourToSave.id ? 'put' : 'post'
    const endpoint = tourToSave.id ? `${BASE_URL}${tourToSave.id}` : BASE_URL

    const savedTour = await httpService[method]<Tour>(endpoint, tourToSave)
    return savedTour
}

async function remove(tourId: string): Promise<any> {
    // Soft-delete — sets deletedAt server-side, does not remove the document (see .rule/database-rules.md)
    const result = await httpService.delete<any>(`${BASE_URL}${tourId}`)
    return result
}
```

`seat.service.ts` follows the same pattern for its own actions (`request`, `approve`, `cancel`, `toggleReserve`, `manualAssign`, `swapMove`) rather than the generic `getList`/`save`/`remove` shape above — each is its own named function calling the corresponding endpoint (see `docs/api-contract/api-contract.tour-service.yaml`), since seat actions aren't simple CRUD.

## Data Persistence
- Use `localStorage` for client-side persistence in web applications, and use the native `Preferences` API for mobile/native platforms.
- Always handle JSON parse errors gracefully
- Return empty arrays/objects as defaults, never undefined

## Utility Functions
`frontend/src/services/util.service.ts` is owned by `state-management-layer` (Capacitor-aware storage helpers: `saveToStorage`, `getFromStorage`). Do not redefine it here — see @state-management-layer/SKILL.md for the canonical signature.

Non-storage utilities (dates, strings, formatting) that aren't tied to state persistence can live in their own `*.service.ts` files under `frontend/src/services/`, following the same pure-function pattern as `tourService` above.

## Testing Services
```typescript
// tour.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tourService } from './tour.service'

describe('Tour Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch the tour list', async () => {
    const tours = await tourService.getList()
    expect(Array.isArray(tours)).toBe(true)
  })
})
```

## Type Safety
- Define types in `frontend/src/types/<domain>.types.ts` (e.g. `tour.types.ts`, `bus.types.ts`, `seat.types.ts`) — per `.rule/naming-rules.md`.
- Use strict typing for all function parameters and returns.
- Avoid `any` type — the `[key: string]: any` shown above is a placeholder for a rough draft only; replace it with explicit fields once the contract is finalized.

## API Endpoints Mapping
This repo is a monorepo — `backend/` exists and contains the two real microservices (`user-management-service`, `tour-service`), but frontend services still never call them directly: always route through `http.service.ts`. Do not hardcode routes from memory; the endpoint contract is the source of truth and lives in `docs/api-contract/api-contract.<service-name>.yaml`:
- `docs/api-contract/api-contract.user-management-service.yaml` — auth (login, signup, logout, forgot-password)
- `docs/api-contract/api-contract.tour-service.yaml` — tours, buses, seats, manifest

Read the relevant contract file before implementing a service function, and keep endpoint paths/methods in sync with it rather than duplicating a route list in this skill.

## Implementation Guidelines for the AI
Dynamic Parameters: Always use the `:tourId`, `:busId`, or `:seatId` naming convention in service calls to match the API contract's path parameters (e.g. `tour/${tourId}/buses/${busId}/seats/bookings`).

Middleware Awareness: All `tour`/`bus` write routes and every `seat` management action (`approve`, `cancel`, `toggle-reserve`, `manual-assign`, `swap-move`) require an admin JWT. `seats/bookings` (the passenger request) does not — passengers are never authenticated (see `.rule/glossary.md`). Ensure `http.service.ts` includes the JWT token in the Authorization header for admin-only calls (see @api-layer/SKILL.md) — services don't attach it themselves.

Data Formatting:
- The backend uses camelCase throughout (no snake_case conversion needed, per `.rule/naming-rules.md`) — pass fields through as-is rather than transforming casing.
- `seat.service.ts` must surface a `409` response as a distinct case (seat-conflict), not a generic error — let the caller (page/hook) show a "this seat was just taken" message and refresh the seat map, per `.rule/error-handling-rules.md`. Never silently swallow or retry a `409` inside the service.