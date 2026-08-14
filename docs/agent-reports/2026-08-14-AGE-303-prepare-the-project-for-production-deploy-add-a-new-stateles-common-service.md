All good: 6/6 tests pass, TypeScript compiles cleanly. Task done — no frontend changes made (out of scope per Allowed Paths).

=== BACKEND AGENT REPORT ===
```
Ticket: AGE-303
Service: common-service
Date: 2026-08-14

Endpoints implemented:
GET /health ✓ (200, no auth, no db, no proxy)
/api/tour, /api/bus, /api/seat, /api/manifest → reverse-proxied to TOUR_SERVICE_URL, rewritten to /tour-service/api/... ✓
/api/auth, /api/forgot-password, /api/role, /api/permission → reverse-proxied to USER_MANAGEMENT_SERVICE_URL, rewritten to /user-management-service/api/... ✓
Static frontend served from public/, SPA fallback (/*splat) for client-side routing ✓

Mongoose models: none (stateless gateway, no database per spec)

Unit tests: 6 passed, 0 failed
- GET /health returns 200 with no auth
- /api/tour/* proxied to TOUR_SERVICE_URL
- /api/bus, /api/seat, /api/manifest proxied to TOUR_SERVICE_URL
- /api/auth/* proxied to USER_MANAGEMENT_SERVICE_URL
- /api/forgot-password, /api/role, /api/permission proxied to USER_MANAGEMENT_SERVICE_URL
- Unmatched non-API route falls through to SPA index.html

Notes:
- Verified actual mount prefixes on both upstream services (tour-service: /tour-service/api via api/app.ts; user-management-service: /user-management-service/api via api/server.ts) before wiring pathRewrite — matches CLAUDE.md's warning that bare /api/... would 404 upstream.
- Express 5's app.get('*', ...) is invalid under the new path-to-regexp; used app.get('/*splat', ...) instead for the SPA fallback.
- tsconfig moduleResolution changed from "node" to "bundler" (TypeScript 7 removed the "node10"/"node" option); added @types/cors as a dev dependency to satisfy strict type-checking.
- .env.development created with PORT=3034, TOUR_SERVICE_URL=http://localhost:3033, USER_MANAGEMENT_SERVICE_URL=http://localhost:3032, FRONTEND_URL=http://localhost:3000 (FRONTEND_URL reused from the already-recorded value in the other two services' env files; both already gitignored via backend/*/public and .env.development entries).
- public/ folder already existed (pre-built frontend assets) and was left untouched, per instructions not to commit/generate it here — that's the frontend agent's responsibility.

To run:
cd backend/common-service && npm run dev   # port 3034

STATUS: DONE
```