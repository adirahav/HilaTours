# 030 — Flatten backend/user-management-service/api/api/ to backend/user-management-service/api/

Status: done
Owner: orchestrator
Last updated: 2026-08-09
Scope-Agents: user-management-service, qa

## Goal
Remove the erroneous doubled `api/api/` nesting in `backend/user-management-service` so its layout matches the corrected single-level `api/<domain>/` structure already used by `backend/tour-service` (per the `backend-service-layer` skill and `agents/backend/CLAUDE.md`), without changing any runtime behavior, routes, or test coverage.

## Scope
- `backend/user-management-service/api/api/**` → move up to `backend/user-management-service/api/**`
- `backend/user-management-service/api/server.ts` — fix import paths to the moved files
- `backend/user-management-service/tsconfig.json` — align `rootDir`/`include` with the corrected layout (mirroring `backend/tour-service/tsconfig.json`)
- `backend/user-management-service/dist/**` — stale build output; will be regenerated (not hand-edited)
- No other service (`tour-service`, `frontend`) is touched — this is a pure structural move local to `user-management-service`, no API contracts, routes, or ports change.

## Assumptions
- The current wrong layout is exactly:
  - `backend/user-management-service/api/api/auth/auth.controller.ts`
  - `backend/user-management-service/api/api/auth/auth.middleware.ts`
  - `backend/user-management-service/api/api/auth/auth.service.ts`
  - `backend/user-management-service/api/api/auth/auth.test.ts`
  - `backend/user-management-service/api/api/forgot-password/forgot-password.controller.ts`
  - `backend/user-management-service/api/api/forgot-password/forgot-password.service.ts`
  - and these should become `backend/user-management-service/api/auth/*` and `backend/user-management-service/api/forgot-password/*` respectively — mirroring `backend/tour-service/api/bus/*`, `backend/tour-service/api/tour/*`, etc.
- `backend/user-management-service/api/lib/*` and `backend/user-management-service/api/models/*` are already at the correct single level and do not move.
- `backend/user-management-service/api/server.ts` stays at `api/server.ts` (matches `backend/tour-service/api/server.ts`).
- `dist/` is build output (`npm run build` / `tsc`) and is regenerated, not manually restructured — plan only fixes source under `api/`.
- Tour-service's `tsconfig.json` uses `rootDir: "api"`, which is why its `dist/` output has no extra `api/` prefix (e.g. `dist/app.js`, not `dist/api/app.js`). user-management-service's current `tsconfig.json` uses `rootDir: "."`, which is inconsistent with tour-service and is presumably part of what produced the doubled `dist/api/api/...` output. Aligning `rootDir` to `"api"` (matching tour-service) is treated as in-scope since the task explicitly calls out fixing `tsconfig.json` rootDir/include.
- No behavior, route paths, env vars, or exported symbols change — this is a pure file-move + import-path fix.

## Open Questions
1. Should `tsconfig.json`'s `rootDir` be changed from `"."` to `"api"` to match `tour-service` exactly (which also changes `dist/` output shape, e.g. `dist/server.js` instead of `dist/api/server.js`), or should it stay `rootDir: "."` and only the doubled path segment be removed?
   - Recommended: change `rootDir` to `"api"` to match `tour-service`'s corrected pattern exactly, per the task's instruction to fix `tsconfig.json` "if it references the old path" and the stated goal of matching `tour-service`'s structure. Update `package.json`'s `start` script (`node dist/server.js`) is already written for the post-fix path, confirming this is the intended target shape.
   - *HUMAN ANSWER:* as recommended
   
2. Should the stale `dist/` directory be deleted as part of this change, or left for the next `npm run build` to overwrite?
   - Recommended: delete `backend/user-management-service/dist/` in this change (it's compiled output, safe to regenerate, and leaving the old doubled-path `.js` files around post-move would be misleading/stale artifacts sitting alongside the corrected source).
   - *HUMAN ANSWER:* as recommended

## Steps
1. `backend/user-management-service/api/api/auth/` → move all 4 files (`auth.controller.ts`, `auth.middleware.ts`, `auth.service.ts`, `auth.test.ts`) to `backend/user-management-service/api/auth/`.
2. `backend/user-management-service/api/api/forgot-password/` → move both files (`forgot-password.controller.ts`, `forgot-password.service.ts`) to `backend/user-management-service/api/forgot-password/`.
3. Delete the now-empty `backend/user-management-service/api/api/` directory.
4. Fix relative imports broken by the move:
   - `backend/user-management-service/api/auth/auth.middleware.ts`: `../../lib/jwt` → `../lib/jwt`
   - `backend/user-management-service/api/auth/auth.service.ts`: `../../models/admin.model` → `../models/admin.model`, `../../lib/jwt` → `../lib/jwt`
   - `backend/user-management-service/api/forgot-password/forgot-password.service.ts`: `../../models/admin.model` → `../models/admin.model`
   - `backend/user-management-service/api/auth/auth.controller.ts` (`./auth.service`, `./auth.middleware`) and `backend/user-management-service/api/forgot-password/forgot-password.controller.ts` (`./forgot-password.service`) — same-directory relative imports, unaffected by the move, verify unchanged.
   - `backend/user-management-service/api/server.ts` (`./api/auth/auth.controller`, `./api/forgot-password/forgot-password.controller`) → `./auth/auth.controller`, `./forgot-password/forgot-password.controller`.
5. Update `backend/user-management-service/tsconfig.json`: change `rootDir` from `"."` to `"api"` (matching `backend/tour-service/tsconfig.json`); `include: ["api/**/*"]` stays correct as-is (already matches tour-service's pattern, still valid after the move).
6. Delete `backend/user-management-service/dist/` (stale build output referencing the old doubled path); it will be regenerated by `npm run build`.
7. Grep the whole `backend/user-management-service` tree (excluding `node_modules`/`dist`) for any remaining `api/api` string references (imports, docs, configs) to catch anything missed.
8. Run `npm run build` (tsc) in `backend/user-management-service` to confirm the new `rootDir`/paths compile cleanly and produce the expected flattened `dist/` shape.
9. Run `npm run typecheck` and `npm test` (vitest) in `backend/user-management-service` to confirm the full suite (including `auth.test.ts`) still passes post-move.

## Validation
- `find backend/user-management-service/api -type d` shows no `api/api` nesting; only `api/auth`, `api/forgot-password`, `api/lib`, `api/models`, plus `api/server.ts`.
- `cd backend/user-management-service && npm run typecheck` passes with zero errors.
- `cd backend/user-management-service && npm run build` succeeds and produces `dist/server.js`, `dist/auth/*.js`, `dist/forgot-password/*.js`, `dist/lib/*.js`, `dist/models/*.js` (no doubled `dist/api/api/...`).
- `cd backend/user-management-service && npm test` (vitest) passes in full, including `api/auth/auth.test.ts`.
- `grep -rn "api/api" backend/user-management-service --include='*.ts' --include='*.json'` (excluding `node_modules`, `dist`) returns no matches.
- Manual smoke: `npm run dev` boots the service and `POST /api/auth/login` / forgot-password routes still respond as before (route prefixes are defined in Express routers, not affected by file location).

## Risks
- Missed relative-import fix (e.g. an `../../` left unadjusted) would cause a TypeScript compile failure or a runtime `MODULE_NOT_FOUND` at `npm run dev`/`npm start` — mitigated by the grep sweep in Step 7 and the mandatory typecheck/build/test run in Steps 8–9 before considering this done.
- `auth.middleware.ts` (`requireAuth`) is the JWT verification gate used on admin-authenticated routes; if its import of `verifyToken` from `lib/jwt` breaks silently in a way TypeScript doesn't catch (unlikely, but this file is auth-critical), admin auth could fail open or fail closed — mitigated by running the full test suite (`auth.test.ts` covers login) and the `security` consideration is limited to "did the move touch auth-critical code," which it does only via import path, not logic. `security` agent not included in scope since no auth logic, token handling, or password logic is being changed — only file location and import paths of already-reviewed code.
- Changing `tsconfig.json` `rootDir` from `"."` to `"api"` changes the `dist/` output shape; if any other file (deploy script, Dockerfile, CI config) references the old `dist/api/...` path, it would break post-deploy. Mitigated by Step 7's repo-wide-within-service grep and by checking `package.json`'s `start` script, which already expects `dist/server.js` (the corrected shape), suggesting no other artifact still expects the old shape — but this should be re-confirmed against any Dockerfile/CI config outside this service's own directory if one exists.

## Rollout Order
1. `backend/user-management-service` — file moves, import fixes, tsconfig fix, dist cleanup, full test run (this plan is self-contained to one service; no cross-service or frontend sequencing needed).

## Rollback
- Pure git revert: `git checkout -- backend/user-management-service` (or revert the commit) restores the original `api/api/` nesting, original `tsconfig.json`, and original `dist/` contents. No data migrations, no external state, no API contract changes — rollback is a plain file-tree revert with no side effects.
