# 029 — Remove stray docs/ folders under backend/

Status: done
Owner: orchestrator
Last updated: 2026-08-09
Scope-Agents: none

## Goal

Delete the stray `docs/` folders that were accidentally created under `backend/`, `backend/tour-service/`, and `backend/user-management-service/` by a prior agent's `cd backend/<service>` shell step (relative writes to `docs/agent-reports/...` landed under `backend/**/docs/` instead of the repo-root `docs/`). The root cause is already fixed (`agents/backend/CLAUDE.md`, `backend-service-layer` skill). This is a pure cleanup/tooling task: diff each stray file against its real counterpart under `docs/agent-reports/` and `docs/tests/security/`, confirm nothing unique needs preserving, then delete the stray folders entirely.

## Scope

- `backend/docs/agent-reports/2026-08-03-AGE-199-busmap-component-security.md`
- `backend/docs/tests/security/seat.security.test.ts`
- `backend/tour-service/docs/agent-reports/2026-08-08-AGE-263-re-audit-gateway-page-raw-from-ai-studio-pages-gatewaypage-t-qa.md`
- `backend/tour-service/docs/agent-reports/2026-08-09-AGE-274-re-audit-tourmanagement-component-raw-from-ai-studio-compone-security.md`
- `backend/tour-service/docs/agent-reports/2026-08-09-AGE-279-add-uuid-identity-layer-stop-exposing-mongo-id-to-clients-ev-security.md`
- `backend/user-management-service/docs/agent-reports/2026-08-03-AGE-199-busmap-component-security.md`
- `backend/user-management-service/docs/agent-reports/2026-08-07-AGE-244-admin-dashboard-page-security.md`

No product code (frontend, tour-service, user-management-service application code) is touched. Only these stray `backend/**/docs/` folders and their contents are removed after review.

Out of scope: any further changes to `agents/backend/CLAUDE.md` or the `backend-service-layer` skill (root cause already fixed there per task description); no changes to the canonical files under `docs/agent-reports/` or `docs/tests/security/`.

## Assumptions

- The canonical/authoritative copies live at repo root under `docs/agent-reports/` and `docs/tests/security/`, and each stray file has a same-named counterpart there (confirmed present for all 7 files during discovery).
- Preliminary diff (via `Compare-Object` / hash check) shows every stray file differs from its root counterpart — none are byte-identical duplicates. The stray copies appear to be the raw agent chat-summary output (a condensed narrative of the same audit/report), while the root copies are the final formatted report/test file. Content overlaps heavily (same findings, same STATUS: DONE, same test bodies) but wording/structure differs.
- No design files under `raw_from_ai_studio/` are relevant to this task — it is a docs/tooling cleanup, not a UI change.

## Open Questions

1. Should the stray files be deleted outright, or should any unique wording (e.g. the condensed chat-summary framing) be appended/merged into the root canonical file before deletion?
   - Recommended: delete outright. The stray copies are agent chat-output artifacts of the same audit already fully captured in the canonical root report (same findings, same test assertions); the chat-summary framing has no standalone value once the formal report exists at `docs/agent-reports/`.
   - *HUMAN ANSWER:* as recommended
2. Should `backend/docs/`, `backend/tour-service/docs/`, and `backend/user-management-service/docs/` be removed as whole directory trees, or only the specific stray files listed, leaving empty directory shells?
   - Recommended: remove the whole directory trees (`backend/docs/`, `backend/tour-service/docs/`, `backend/user-management-service/docs/`) since every file under them is a stray duplicate and none should exist under `backend/**` per the (already-fixed) root cause.
    - *HUMAN ANSWER:* as recommended
    
## Steps

1. For each of the 7 stray files, run a diff against its root counterpart (`docs/agent-reports/<name>` or `docs/tests/security/<name>`) and record in this plan's execution notes / PR description that no unique content is being lost (already spot-checked during planning: all 7 differ only in framing/wording, not in substantive findings or test coverage — root versions are the complete, formal artifacts).
2. Delete `backend/docs/` (recursive), `backend/tour-service/docs/` (recursive), `backend/user-management-service/docs/` (recursive).
3. Confirm no other file in the repo (code, config, CI) references any path under `backend/docs/`, `backend/tour-service/docs/`, or `backend/user-management-service/docs/` (grep for `backend/docs`, `backend/tour-service/docs`, `backend/user-management-service/docs`).
4. Confirm `.gitignore` / build tooling doesn't expect those paths to exist.

## Validation

- `git status` shows only deletions under `backend/docs/`, `backend/tour-service/docs/`, `backend/user-management-service/docs/` — no changes to `docs/agent-reports/` or `docs/tests/security/` at repo root.
- Grep confirms zero remaining references to `backend/**/docs/` paths anywhere in the repo.
- Existing test suites (frontend, tour-service, user-management-service) still pass unmodified, since no test files at repo root moved or changed — only stray duplicates under `backend/` are removed.

## Risks

- Low risk: this is a deletion of duplicate documentation/report artifacts, not application code. No runtime behavior, API, or auth logic is touched.
- Small risk of deleting content that turns out to have a unique detail not present at root — mitigated by the diff-before-delete review already done in planning (Assumptions) and re-confirmed in Steps 1.

## Rollout Order

1. Diff/review (already done in planning; re-verify at execution time).
2. Delete the three stray `backend/**/docs/` directory trees in a single change.
3. Grep-verify no dangling references.

## Rollback

- Single-commit revert restores the deleted stray `backend/**/docs/` files/folders if any unique content is later found to be needed (git history retains them).
