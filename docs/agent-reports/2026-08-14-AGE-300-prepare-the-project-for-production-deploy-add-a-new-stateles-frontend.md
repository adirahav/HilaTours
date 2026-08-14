Build artifacts are correctly gitignored. Both frontend changes are complete and validated.

=== FRONTEND AGENT REPORT ===
```
Ticket: AGE-300
Pages built/changed: none (infra/deploy task, no UI changes)
Services built/changed:
  - frontend/src/services/http.service.ts — BASE_URL resolution: production collapses both
    clients to the single same-origin `/api/` prefix served by common-service; development
    keeps VITE_USER_MANAGEMENT_API_URL / VITE_TOUR_API_URL per-origin behavior (import.meta.env.DEV)
Store slices built/changed: none
Other changed files:
  - frontend/vite.config.ts — build.outDir '../backend/common-service/public', emptyOutDir: true
  - frontend/package.json — confirmed "build": "vite build" already present (no edit needed)
  - frontend/src/components/bus/BusMap.tsx — removed 4 pre-existing unused-symbol lint errors
    (Info/Move imports, hoveredSeat, setMoveMode) that were blocking the lint gate
Lint: PASS
Build: PASS (output verified in backend/common-service/public/, matched by .gitignore rule `backend/*/public`)
Tests: not in scope for this ticket
API contracts: none — no new or changed product endpoints; common-service proxies existing
  paths unchanged, so the two service contracts are untouched

Handoff to Backend Agent:
- common-service must serve backend/common-service/public as static + SPA fallback, and register
  proxy routes BEFORE the static/SPA middleware so /api/* is never swallowed by the fallback
- Axios joins baseURL '/api/' with paths like '/auth/signup', '/tour/:id' → requests arrive as
  /api/auth/*, /api/forgot-password/*, /api/role/*, /api/permission/* (user-management-service)
  and /api/tour/*, /api/bus/*, /api/seat/*, /api/manifest/* (tour-service)
- Proxy must forward the Authorization header untouched (JWT is attached by the axios request
  interceptor); http-proxy-middleware does this by default — verify in tests
- See .rule/database-rules.md for collection schemas

STATUS: DONE
```

STATUS: DONE