## Summary

Ran full validation for AGE-304. `common-service` exists and is well-structured (health check, static hosting, SPA fallback all work), and frontend's `BASE_URL`/`vite.config.ts` changes are correct — build output lands properly in `backend/common-service/public/`. Unit tests pass everywhere (common-service 7/7, user-management-service 29/29, tour-service 84/84, frontend 221/222 with one pre-existing unrelated failure).

**However**, live manual/integration testing with all three services running uncovered a **blocking production bug**: every proxied API route (`/api/auth`, `/api/tour`, etc.) returns 404 against the real upstream services. Root cause: Express strips the matched `app.use()` mount prefix from `req.url` before `pathRewrite` runs, so the reconstructed upstream path silently drops the `/api/<segment>` portion (e.g. `/api/auth/login` → `/user-management-service/login` instead of the real `/user-management-service/api/auth/login`). The existing unit tests never caught this because their mock always returns 200 regardless of the rewritten path.

I added a regression test to `backend/common-service/api/__tests__/server.test.ts` that captures the real `pathRewrite` output and documents this defect against the confirmed-correct upstream paths (verified live via curl against the running services).

Report written to `docs/agent-reports/2026-08-14-AGE-304-prepare-the-project-for-production-deploy-add-a-new-stateles-qa.md`.

STATUS: DONE