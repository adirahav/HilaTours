# 034 — BusType management: new `busType` collection in tour-service

Status: done
Owner: orchestrator
Last updated: 2026-08-22
Scope-Agents: frontend, tour-service, qa, security

## Goal
Let admins define reusable bus-type templates (standard row count, door-row position, back-row seat count, individually disabled seat slots) independent of any tour/bus, manage them (create/edit/duplicate/soft-delete/mark-default), and instantiate a concrete `Bus.seatLayout` from a template when creating a bus — per PRD F11 and the design reference `raw_from_ai_studio/src/components/BusTypeManagement.tsx`.

## Scope
- `backend/tour-service/api/models/busType.model.ts` (new): uuid identity + soft-delete Mongoose model.
- `backend/tour-service/api/busType/busType.service.ts`, `busType.controller.ts`, `busType.routes.ts` (new): CRUD + duplicate, mirroring `backend/tour-service/api/bus/*` conventions (`resolveObjectId`/`resolveDoc`, `toClientX` shaping, `requirePermission`).
- `backend/tour-service/api/bus/bus.service.ts`: extend `BusInput`/`createBus` to accept an optional `busTypeId`, resolving the template and server-generating `seatLayout` (new helper, e.g. `seatLayoutFromBusType`) instead of requiring the caller to pass `seatLayout` directly. Existing explicit-`seatLayout` callers keep working unchanged.
- `backend/tour-service/api/app.ts`: mount new `busTypeRouter` alongside `busRouter`.
- `docs/api-contract/api-contract.tour-service.yaml`: add `/busType`, `/busType/{busTypeId}`, `/busType/{busTypeId}/duplicate` paths and `BusType`/`BusTypeInput` schemas; extend `BusInput` with optional `busTypeId`.
- `frontend/src/types/busType.types.ts` (new), `frontend/src/services/busType.service.ts` (new), `frontend/src/store/slices/busType.slice.ts` (new) — following the existing `bus.types.ts`/`bus.slice.ts` pattern.
- `raw_from_ai_studio/src/components/BusTypeManagement.tsx` → adapted into `frontend/src/components/admin/BusTypeManagement.tsx` (exact target path to confirm with `ui-component-layer`/`page-layer` skill conventions during implementation): remove `lib/storage` (localStorage) and `data/initialData` usage, wire to the new store slice/service instead.
- Bus-creation UI (wherever "add bus" lives, e.g. `BusManagement`/tour admin tab): add a "create from BusType" path that sends `busTypeId` instead of a hand-built `seatLayout`.
- No changes to `user-management-service` or `common-service`.

## Assumptions
- `busType` is its own top-level Mongo collection (not embedded in `Tour`/`Bus`), matching "independent of any tour/bus instance" in the backlog item.
- Permissions follow the existing `bus:*` convention — new permissions `busType:view`/`busType:insert`/`busType:update`/`busType:delete` are added the same way `bus:*` permissions were (per `jwt-middleware-layer`/RBAC work in plan 032); default admin role gets them.
- `seatLayout` generation from a template reuses the existing standard-rows + back-row + door-row + disabled-slots model shown in `BusTypeManagement.tsx`'s `generateNumberedGrid`, translated into the `{ positions: string[] }` shape already consumed by `seatPositionsFromLayout` in `bus.service.ts` — no new seatLayout shape is introduced, just a new generator that outputs the shape `Bus` already expects.
- Duplicate is a server-side action (`POST /busType/:busTypeId/duplicate`), not just a frontend clone, so duplicated templates are persisted immediately and show up for other admins.
- "Mark as default" is a boolean flag on `BusType` with at most one true at a time (service enforces exclusivity on write), used only as a UI default-selection hint — it does not affect `Bus` creation validation.

## Open Questions
1. Should `busTypeId` + `seatLayout` be mutually exclusive on `POST /tour/:tourId/buses`, or can both be supplied (with `busTypeId` taking precedence)?
- Recommended: mutually exclusive — reject a request that supplies both with a 400, to avoid ambiguous "which one wins" behavior and keep the contract simple.
- *HUMAN ANSWER:* Yes, mutually exclusive — reject 400 if both or neither are supplied. Already reflected in docs/PRD.md (F11) and docs/api-contract/api-contract.tour-service.yaml.

2. Does deleting (soft-delete) a `BusType` need to block if buses were created from it, or is it fine since conversion is a one-time copy with no live reference kept?
- Recommended: no reference is kept after conversion (the template is copied into a concrete `seatLayout` at creation time), so soft-deleting a `BusType` never needs to touch existing buses — allow free deletion.
- *HUMAN ANSWER:* as recommended

3. Where exactly should the adapted `BusTypeManagement.tsx` live and which admin tab surfaces it — a new sub-tab under "Tour & Bus Management," or its own top-level tab?
- Recommended: new sub-tab nested under the existing "Tour & Bus Management" tab (per PRD's own placement of "Bus type management" as a bullet under that tab), not a new top-level tab — avoids restructuring the admin dashboard's tab bar for this ticket.
- *HUMAN ANSWER:* add new tab at Header

## Steps
1. **backend/tour-service — model** (tour-service agent):
   - `backend/tour-service/api/models/busType.model.ts`: fields `name`, `description?`, `standardRowsCount`, `doorRow: number | null`, `backRowSeatsCount`, `disabledSeatSlots: string[]`, `isDefault: boolean`, plus uuid identity (`applyUuidIdentity`) and soft-delete (`deletedAt`) exactly like `bus.model.ts`. Store in its own `busType` collection.
2. **backend/tour-service — service/controller/routes** (tour-service agent):
   - `busType.service.ts`: `listBusTypes`, `getBusType`, `createBusType`, `updateBusType`, `softDeleteBusType`, `duplicateBusType`, `setDefaultBusType` (enforces single-default), and `seatLayoutFromBusType(busType)` — the row/door/back-row/disabled-slot → `{ positions: [...] }` generator, unit-testable in isolation.
   - `busType.controller.ts` + `busType.routes.ts`: REST endpoints under `requirePermission("busType:*")`, mirroring `bus.routes.ts` structure; `GET /busType` and `GET /busType/:busTypeId` open to any authenticated admin (`busType:view`), mutations gated per-permission.
   - `app.ts`: `app.use(API_BASE, busTypeRouter)`.
3. **backend/tour-service — bus creation conversion** (tour-service agent):
   - Extend `BusInput` in `bus.service.ts` with optional `busTypeId`; in `createBus`, if `busTypeId` present, resolve the `BusType` doc, call `seatLayoutFromBusType`, and use that as `seatLayout` (rejecting if both `busTypeId` and `seatLayout` are supplied, per Open Question 1's recommendation).
4. **docs/api-contract/api-contract.tour-service.yaml** (tour-service agent):
   - Add `BusType`/`BusTypeInput` schemas and `/busType`, `/busType/{busTypeId}`, `/busType/{busTypeId}/duplicate` paths; add optional `busTypeId` to `BusInput`.
5. **frontend/src/types/busType.types.ts, services/busType.service.ts, store/slices/busType.slice.ts** (frontend agent):
   - Mirror `bus.types.ts`/`bus.service.ts`/`bus.slice.ts` conventions (uuid-keyed, async thunks/actions for list/create/update/delete/duplicate).
6. **frontend/src/components/admin/BusTypeManagement.tsx** (frontend agent, adapted from `raw_from_ai_studio/src/components/BusTypeManagement.tsx`):
   - Remove `lib/storage` (`getBusTypes`/`saveBusTypes`/`addBusType`/`editBusType`/`deleteBusType`) and `data/initialData` (`INITIAL_BUS_TYPES`) imports/usage entirely.
   - Replace with calls into the new `busType.slice.ts`/`busType.service.ts`; "reset to presets" either becomes a no-op removed from the UI or maps to a documented server-seeded default set — flag as an assumption if reused, since PRD/backlog don't mention seeded presets.
   - Keep the existing grid/door/back-row visual builder and RTL layout as-is (design source of truth); only the persistence layer changes.
   - Wire into the "Tour & Bus Management" tab per Open Question 3's recommendation.
7. **Bus-creation UI** (frontend agent): add a "create from BusType" option (dropdown of existing templates) that submits `busTypeId` instead of hand-authored `seatLayout`.
8. **security** (security agent): review the new `busType:*` permission wiring, confirm mutation routes reject non-admin JWTs, and confirm soft-delete/`deletedAt` scoping matches `bus.model.ts`'s pattern (no leaked deleted templates via list endpoints).

## Validation
- `backend/tour-service`: `npm --prefix backend/tour-service run test` covering `busType.service.ts` CRUD, duplicate, default-exclusivity, `seatLayoutFromBusType` grid generation (including door-row and disabled-slot edge cases), and `createBus` with `busTypeId` vs. explicit `seatLayout` vs. both-supplied (400).
- `frontend`: `npm --prefix frontend run lint` and existing test runner (if configured) for the new slice/service and adapted component; manually confirm no `localStorage` reads/writes remain in `BusTypeManagement.tsx`.
- Manual: create a `BusType`, instantiate a `Bus` from it via the admin UI, confirm the resulting seat map matches the template's visual preview (row/door/back-row/disabled slots).

## Risks
- **Auth/permission gap**: new mutation endpoints (`create`/`update`/`delete`/`duplicate`/`setDefault`) must be gated the same way `bus:*` routes are, or an authenticated-but-unprivileged user could create/delete shared templates used across tours — flagged for the security agent (Scope-Agents includes `security`).
- **seatLayout translation mismatch**: the door-row/back-row grid model in `BusTypeManagement.tsx` must translate faithfully into the `{ positions: [...] }` shape `bus.service.ts` already parses (`seatPositionsFromLayout`) — a subtle off-by-one in row/seat numbering here would silently produce a wrong-sized or misaligned seat map on the resulting `Bus`, only caught by comparing generated total seats against the live preview's `calculateTotalSeatsFromLayout` equivalent.
- **Default-template race**: enforcing "only one `isDefault: true`" needs to be atomic (e.g. unset-then-set in one operation or a transaction) to avoid two concurrent admin edits leaving two templates marked default.

## Rollout Order
1. `tour-service` (backend agent) — model, service/controller/routes, bus-creation conversion, API contract update. Independently testable via unit tests before any frontend change.
2. `frontend` (frontend agent) — types/service/slice, adapted `BusTypeManagement.tsx`, bus-creation "from template" option. Depends on step 1's routes existing (or can be stubbed against the contract in parallel, then wired once live).
3. `security` — review permission wiring and soft-delete scoping once both sides are in place.
4. `qa` — end-to-end validation: create template → create bus from template → confirm seat map.

## Rollback
- All new backend code is additive (`busType.model.ts`, `busType.service/controller/routes.ts`, one optional field on `BusInput`) — revert via git with no impact on existing `bus`/`tour`/`seat` flows, since `busTypeId` is optional and existing explicit-`seatLayout` bus creation is untouched.
- Frontend changes are additive (new types/service/slice files, one adapted component, one new option in bus-creation UI) — revert via git; no existing admin flows are removed, only extended.
