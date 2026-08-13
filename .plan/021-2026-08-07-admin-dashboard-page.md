# Plan: Admin Dashboard page

Status: done
Owner: Orchestrator
Last updated: 2026-08-07

## Goal
Deliver the Admin Dashboard page — the tabbed admin workspace (Seat Management, Tour & Bus Management, Passenger Manifest Report) — wiring together already-built sub-components and modals into a single page that manages tour/bus selection, tab state, modal state, and seat/tour/bus action handlers.

## Scope
- In scope: the Admin Dashboard page container at `frontend/src/pages/AdminDashboardPage.tsx`, including:
  - Tab switching between `seats` / `tours` / `report`.
  - Selected tour/bus state and self-healing selection when data changes.
  - Modal orchestration for TourModal, BusModal, ManualAssignModal.
  - Seat action handlers (approve, cancel, toggle-reserve, manual-assign, bulk-approve pending) and tour/bus CRUD handlers, backed by the API layer.
  - Empty-state ("no tours/buses") with a call-to-action to create the first tour.
- Out of scope: implementation of the child components/modals themselves (plans 014–020), unrelated refactors, unrelated new features.

## Relevant Design Files
- `raw_from_ai_studio/src/pages/AdminDashboardPage.tsx` — primary reference (page container, state, handlers).
- `raw_from_ai_studio/src/components/SeatManagement.tsx`, `TourManagement.tsx`, `PassengerManifestReport.tsx` — child tab components (prop contracts).
- `raw_from_ai_studio/src/modals/TourModal.tsx`, `BusModal.tsx`, `ManualAssignModal.tsx` — modal prop contracts.
- `raw_from_ai_studio/src/types.ts` — `Tour`, `Bus`, `Seat`, `AdminUser` types.
- `raw_from_ai_studio/src/lib/storage.ts` — reference action semantics to map onto the API layer.

## Assumptions
- Existing app and test setup are functional.
- Design source: `raw_from_ai_studio/` — reference file `raw_from_ai_studio/src/pages/AdminDashboardPage.tsx`.
- Child components (`SeatManagement`, `TourManagement`, `PassengerManifestReport`) and modals (`TourModal`, `BusModal`, `ManualAssignModal`) are already implemented per plans 014–020 and expose the props used by the reference page.
- The reference uses a local `lib/storage.ts`; in this repo the equivalent actions are served through the frontend API layer (`api-layer` skill) hitting `tour-service` routes F4–F9. Admin actions require a valid admin JWT (`jwt-middleware-layer`).
- Full RTL (Hebrew) layout per `css-layer` and `accessibility-layer`.

## Open Questions
- Should tour/bus/seat mutations go through the frontend API layer (real `tour-service` routes F4–F9) rather than a local storage shim as in the AI-studio reference?
  - Recommended: yes — use the API layer with JWT; keep the same handler signatures so child components are unchanged.
    *HUMAN ANSWER:* as recommended
- Should seat-map updates refresh via re-fetch (`onDataChange`) or optimistic local state?
  - Recommended: re-fetch after each mutation (server is source of truth per PRD/`seat-concurrency-layer`); revisit optimistic UI later.
    *HUMAN ANSWER:* as recommended
- Should tab state and selected tour/bus persist across reloads (e.g. URL params/localStorage)?
  - Recommended: no for first increment — keep in component state as in the reference.
    *HUMAN ANSWER:* as recommended
- Should destructive tour/bus deletes use the native `window.confirm` (as in reference) or an app modal?
  - Recommended: keep `window.confirm` for this increment; note as a follow-up for accessibility polish.
    *HUMAN ANSWER:* an app modal

## Steps
1. Frontend agent implements `frontend/src/pages/AdminDashboardPage.tsx`:
   - Port state (selectedTourId/BusId, tab, modal, report filters) and self-healing selection effects from the reference.
   - Wire seat/tour/bus handlers to the frontend API layer (`api-layer` skill) instead of `lib/storage`, preserving child prop signatures.
   - Render active-tab child component + all three modals; implement empty-state CTA.
   - Ensure RTL + accessibility (`css-layer`, `accessibility-layer`).
   - Destructive tour/bus deletes go through an app confirm modal, not the native `window.confirm` (per Open Questions human answer).
2. Backend agents (user-management-service, tour-service) confirm the F4–F9 routes/contracts consumed here exist and are JWT-guarded; run in parallel — independent microservices.
3. QA agent runs unit, integration, and e2e checks across frontend and both backend services.
4. Security agent audits frontend, both backend services, and API contracts (admin JWT enforcement on all mutations).

## Validation
- frontend: `npm --prefix frontend run lint && npm --prefix frontend run build && npm --prefix frontend run test`
- backend/user-management-service: `npm --prefix backend/user-management-service run test`
- backend/tour-service: `npm --prefix backend/tour-service run test`

## Risks
- Seat-lifecycle concurrency (tour-service) is the highest-risk area — see `.rule/database-rules.md` and `.rule/testing-rules.md`. Bulk-approve-all-pending is especially exposed to stale-state races.
- Selection self-healing effects can loop or flicker if dependencies are wrong; verify against the reference behavior.

## Rollout Order
1. Frontend page implementation.
2. Backend confirmation pass (both services, in parallel).
3. QA verification.
4. Security audit.

## Rollback
- Revert the `AdminDashboardPage.tsx` commit(s) for this task; child components/modals (plans 014–020) are unaffected since this task only wires them together.
- Mark this plan `Status: superseded` if a later plan replaces its approach.
