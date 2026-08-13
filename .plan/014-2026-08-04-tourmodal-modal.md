# Plan: TourModal modal

Status: draft
Owner: adirahav76@gmail.com
Last updated: 2026-08-04

## Goal
Deliver the admin **TourModal** — a create/edit dialog for tours (title, departure
date, description) used from the Admin Dashboard "Tour & Bus Management" tab. On
save it persists the tour via `tourService.save` (create or update), covering the
create/edit half of PRD F8 (`POST /api/tour`, `PUT /api/tour/:tourId`).

## Scope
- In scope (frontend, `frontend/`):
  - New modal component `frontend/src/components/common/TourModal.tsx`
    (add/edit tour form, Hebrew/RTL, Tailwind-only, WCAG 2.1 AA).
  - Wiring the modal open/close + save handlers into the tour-management view
    that hosts it (tab/page under `frontend/src/pages/` or
    `frontend/src/components/`), calling existing
    `tourService.save({ id?, title, date, description })`.
  - Reuse of existing store actions (`upsertTour`) already triggered inside
    `tourService.save`.
  - Tests: `frontend/src/components/common/TourModal.test.tsx`.
- Out of scope:
  - Bus create/edit modal, seat management, manifest report.
  - Tour soft-delete flow (the delete half of F8) — separate task.
  - Backend changes: tour-service CRUD routes/controllers already exist
    (`backend/tour-service/api/tour/tour.routes.ts`,
    `tour.controller.ts`, `tour.service.ts`); this task consumes them, it does
    not modify them. If validation gaps surface, note them but do not expand
    scope here.

## Notes on relevant design files
Source of truth: `raw_from_ai_studio/`. No Figma link was provided.
- `raw_from_ai_studio/src/modals/TourModal.tsx` — **primary reference**: layout,
  fields (title required, date required, description optional), Hebrew copy,
  amber primary button, `isOpen/onClose/onSave/tourToEdit` prop contract,
  create-vs-edit title/icon switch, `useEffect` form reset on open.
- `raw_from_ai_studio/src/components/TourManagement.tsx` — the host view that
  opens the modal (`handleOpenAddTour` / `handleOpenEditTour`) and provides the
  tour being edited; context for wiring.
- `raw_from_ai_studio/src/pages/AdminDashboardPage.tsx` — where the modal is
  mounted in the prototype.
- `raw_from_ai_studio/src/types.ts` — `Tour` shape (`title`, `date`,
  `description?`), reconciled against `frontend/src/types/tour.types.ts`.

## Assumptions
- Frontend app + test setup are functional; `tourService.save/remove` and the
  tour store slice already exist and work (`frontend/src/services/tour.service.ts`,
  `frontend/src/store/slices/tour.slice.ts`).
- tour-service create/update endpoints exist and return the saved `Tour`.
- The modal is a presentational form; server remains source of truth and the
  tour list re-syncs via `upsertTour` inside `tourService.save`.
- Styling is Tailwind-only, full RTL Hebrew, matching the prototype's amber
  accent and rounded-3xl card.
- Admin JWT is already attached by the shared http client; the modal itself adds
  no auth logic.

## Open Questions
- Q1: Where should the modal live — `frontend/src/components/common/` (alongside
  existing shared components) or a new `frontend/src/modals/` dir mirroring the
  prototype? Recommended: `frontend/src/components/common/TourModal.tsx` to match
  the current repo layout (no `modals/` dir exists yet). *HUMAN ANSWER:*
- Q2: Should `onSave` call `tourService.save` internally, or stay presentational
  (bubble values up to the host, which saves)? Recommended: keep the modal
  presentational (`onSave(title, date, description)`) as in the prototype and let
  the host invoke `tourService.save`, keeping the modal easy to test. *HUMAN
  ANSWER:*
- Q3: Is `description` persisted and shown to admins/passengers, or admin-only
  notes? Recommended: persist `description` on the tour; display in tour cards
  only for v1. *HUMAN ANSWER:*
- Q4: Any validation beyond "title required + date required"? (e.g. disallow
  past departure dates.) Recommended: no past-date restriction for v1 — admins
  may back-date; only enforce non-empty title and a valid date. *HUMAN ANSWER:*
- Q5: Accessibility behaviors for v1 — focus trap, Escape-to-close, initial
  focus on the title input, `role="dialog"` + `aria-modal`? Recommended: yes to
  all (required by WCAG 2.1 AA / accessibility-layer); the prototype omits them
  so they must be added. *HUMAN ANSWER:*

## Steps
1. Frontend (`frontend/`): create `TourModal.tsx` from the prototype — title,
   date, description fields; create/edit heading + icon switch; form reset on
   open via `useEffect`; submit guards (title/date). Add accessibility:
   `role="dialog"`, `aria-modal`, labelled inputs, Escape-to-close, focus trap,
   initial focus, visible focus rings (per Q5).
2. Frontend (`frontend/`): wire the modal into the tour-management host — open
   for add (no `tourToEdit`) and edit (with selected tour), and on save call
   `tourService.save({ id?, title, date, description })` (per Q2), which upserts
   into the store.
3. Frontend (`frontend/`): confirm the `Tour` type used by the modal matches
   `frontend/src/types/tour.types.ts` (`title`, `date`, `description?`, `id`).
4. Tests (`frontend/`): `TourModal.test.tsx` — renders add vs edit, required-field
   validation blocks submit, calls `onSave`/`onClose` with trimmed values,
   pre-fills fields in edit mode, Escape closes, focus/aria present.
5. QA agent: run frontend lint/build/test.
6. Security agent: confirm no admin write path is reachable without JWT and that
   the modal introduces no client-only trust of tour state.

## Validation
- frontend: `npm --prefix frontend run lint && npm --prefix frontend run build && npm --prefix frontend run test`

## Risks
- Type drift between the prototype `Tour` and `frontend/src/types/tour.types.ts`
  (field names like `description` vs `notes`) could cause save payload mismatches
  with tour-service.
- Missing accessibility (focus trap/Escape) if the prototype is copied verbatim —
  must be added to meet the AA NFR.
- Wiring ambiguity if the host tour-management view doesn't exist yet in
  `frontend/`; may require a small host stub (flag before expanding scope).
- Existing baseline tests may fail for unrelated reasons.

## Rollout Order
1. FE modal component (`frontend/`).
2. FE wiring into the tour-management host (`frontend/`).
3. QA verification.
4. Security audit.

## Rollback
- Revert branch commits for this task.
- Restore previous ticket states and mark this plan `superseded` if replaced.
