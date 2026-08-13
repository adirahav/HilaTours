# Plan: Re-audit GatewayTours component (Security re-check, no rebuild)

Status: done
Owner: Orchestrator
Last updated: 2026-08-08
Scope-Agents: frontend, qa, security

## Goal
Re-audit the already-built `frontend/src/components/common/GatewayTours.tsx` against the plan
that was used to build it (`.plan/005-2026-08-02-gatewaytours-component.md`), because Security
never actually ran on it before that task was marked done. This is a validation-only task: no
rebuild, no behavior change. Only fix defects if the audit surfaces a genuine mismatch against
the approved plan/design or a genuine security issue (see Scope).

## Relevant Design Files
- `raw_from_ai_studio/src/components/GatewayTours.tsx` — source of truth for markup, Tailwind
  classes, Hebrew copy, icon set (`Bus`, `Calendar`, `ChevronLeft`, `Users`), available-seat
  aggregation logic, and the empty state. Note: the task description refers to it as
  `raw_from_ai_studio/components/GatewayTours.tsx`; the actual path in the repo is
  `raw_from_ai_studio/src/components/GatewayTours.tsx` (under `src/`) — flagged in Open
  Questions.
- `raw_from_ai_studio/src/pages/GatewayPage.tsx` — shows original composition/props
  (`tours`, `onSelectTour`) for cross-checking the repo's router-based wiring.
- `raw_from_ai_studio/src/types.ts` — `Tour`, `Bus`, `Seat` shapes used for the seat/bus
  aggregation.

## Current-State Notes (repo target)
- `frontend/src/components/common/GatewayTours.tsx` — the built component under audit.
- `frontend/src/components/common/GatewayTours.test.tsx` — existing unit test file, if present.
- `frontend/src/pages/GatewayPage.tsx` — mounts `<GatewayTours />`, fetches tours on mount.
- `frontend/src/store/slices/tour.slice.ts` — supplies `tours`/`setTours`.
- `frontend/src/services/tour.service.ts` — `tourService.query()`, the list-tours API call
  this component's data ultimately depends on.
- Prior plan `.plan/005-2026-08-02-gatewaytours-component.md` (Status: done) is the spec of
  record: presentational tour list, `onSelectTour`/`navigate` entry, seat aggregation from
  `bus.seats`, `brand-*` tokens, accessibility (real button/link, `aria-label`, `<time>`,
  focus states, no color-only meaning).

## Scope
- In scope:
  - Read-only diff/comparison of `frontend/src/components/common/GatewayTours.tsx` against
    `.plan/005-2026-08-02-gatewaytours-component.md` (Steps/Scope/Open-Question answers) and
    against `raw_from_ai_studio/src/components/GatewayTours.tsx` for markup/copy/icon parity.
  - **Security audit** (the part that never ran before): confirm the gateway/passenger-facing
    tour list exposes no admin-only data or affordances (no admin routes, tokens, or controls
    leaked into passenger view), confirm the component makes no direct unauthenticated writes,
    confirm any tour data rendered (title, date, notes) is safely rendered (no `dangerouslySetInnerHTML`
    / unescaped HTML injection from tour titles/notes), and confirm `onSelectTour`/navigation
    cannot be used to reach admin-gated routes without a JWT.
  - Review `frontend/src/components/common/GatewayTours.test.tsx` coverage against plan 005's
    Validation criteria; add missing test cases if coverage gaps exist (do not change component
    behavior to make tests pass — only add tests, or fix a genuine defect found above).
  - Lint/build/test run for the frontend.
  - If the audit finds a genuine, small defect (e.g. missing `aria-label`, unsafe rendering of
    tour copy, a route/prop mismatch vs. the design source) — fix it minimally and note it.
    This is the only case where `GatewayTours.tsx` may be edited.
- Out of scope:
  - Any rebuild, redesign, or behavior change to `GatewayTours.tsx` beyond fixing genuine
    defects found during this audit.
  - Backend services (`backend/tour-service`, `backend/user-management-service`) — no new
    endpoints; `GET /api/tour` itself is out of scope unless the audit finds the frontend
    trusting unvalidated/unauthenticated data in a way that implicates the API contract.
  - `GatewayPage.tsx` admin login card, `GatewayAdminLogin`, and other components.

## Assumptions
- `GatewayTours.tsx` was implemented per plan 005 and is functionally complete; this task is a
  security/QA gap-closure, not new development.
- Test tooling (`npm --prefix frontend run lint/build/test`) is already working per plans
  003/004/005.
- The component remains purely presentational (reads `tours` from store/props, does not itself
  call admin-only endpoints), consistent with plan 005's Scope.

## Open Questions
- Task description path `raw_from_ai_studio/components/GatewayTours.tsx` vs. actual repo path
  `raw_from_ai_studio/src/components/GatewayTours.tsx` — is this the same file?
  - Recommended: yes, treat `raw_from_ai_studio/src/components/GatewayTours.tsx` as the
    intended design source (only one `GatewayTours.tsx` exists in `raw_from_ai_studio`).
  - *HUMAN ANSWER:* as recommended
- Should `tour-service` be added to Scope-Agents given the security check touches
  `GET /api/tour` data trust?
  - Recommended: no — this audit only verifies the frontend renders tour data safely and
    doesn't leak admin affordances; it does not change or newly probe `tour-service` itself.
    If the audit finds evidence the API returns unsafe/unescaped content, escalate as a
    follow-up task rather than expanding this one.
  - *HUMAN ANSWER:* as recommended
- If `GatewayTours.test.tsx` exists but doesn't cover the security-relevant cases (no admin
  leakage, safe rendering), should this task extend the test file or just report the gap?
  - Recommended: extend it (minimal, targeted additions) so the audit produces durable proof,
    since the whole point of this task is that Security never ran before.
  - *HUMAN ANSWER:* as recommended

## Steps
1. Frontend agent: diff `frontend/src/components/common/GatewayTours.tsx` against
   `raw_from_ai_studio/src/components/GatewayTours.tsx` and against plan 005's Steps/Scope;
   list any mismatches (markup, Tailwind/`brand-*` tokens, Hebrew copy, icons, seat
   aggregation logic, empty state, accessibility attributes).
2. Security agent: audit the component and its `GatewayPage` wiring for admin-affordance
   leakage, unsafe rendering of tour title/notes text, and any path by which passenger-side
   code could reach an admin-gated action/route without a JWT. Confirm navigation
   (`onSelectTour`/`navigate`) only ever targets the passenger `/tour/:tourId` route.
3. Frontend agent: review `frontend/src/components/common/GatewayTours.test.tsx` coverage
   against plan 005's Validation criteria and the security checks in step 2; add missing test
   cases if gaps exist (do not change component behavior to make tests pass).
4. Frontend agent: if step 1 or 2 found a genuine, small defect, apply a minimal fix and
   record it in the plan/PR notes; if no defect found, make no code changes.
5. QA agent: run frontend lint/build/test; manually verify RTL layout, Hebrew date
   formatting, correct available-seat totals, hover/focus states, empty state, and that the
   entry control routes only to `/tour/:tourId`.

## Validation
- frontend: `npm --prefix frontend run lint && npm --prefix frontend run build && npm --prefix frontend run test`
- Manual: RTL layout, Hebrew date formatting, per-tour available-seat count, empty state,
  keyboard focus/`aria-label` on the entry control, and confirmation that no admin-only UI or
  route is reachable from the gateway tour list.

## Risks
- False sense of completeness: if this task only re-reads code without running tests, the
  original gap (Security never ran) repeats. Mitigate by actually executing the security
  checks in step 2 and lint/build/test, not just reviewing source.
- Tour title/notes are free-text admin input rendered in a passenger-facing list; if rendered
  unsafely (e.g. via `dangerouslySetInnerHTML`), this is an XSS risk reaching every passenger —
  this is exactly why `security` stays in scope even though no code is expected to change.
- Any "minimal fix" applied during the audit could unintentionally alter behavior beyond
  what's authorized — keep fixes scoped strictly to defects vs. the approved design/plan.

## Rollout Order
1. FE diff/review + test-coverage check.
2. Security audit of admin-affordance leakage and unsafe rendering.
3. Minimal fix, only if a genuine defect was found.
4. QA verification (lint/build/test + manual checks).
(No BE changes for this task.)

## Rollback
- If a minimal fix was applied to `frontend/src/components/common/GatewayTours.tsx` or
  `GatewayTours.test.tsx`, revert those specific commits.
- If no code was changed (pure audit with no findings), there is nothing to roll back.
