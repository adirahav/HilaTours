# Prioritized Backlog

Current queue:
- [x] Scaffold project | create package.json in frontend/ | scope: user-management-service,tour-service,qa

- [x] Scaffold React app | npm create vite@latest frontend -- --template react-ts | scope: frontend,qa

- [x] Install dependencies | npm install in root, frontend/ | scope: none

- [x] Header component | raw_from_ai_studio/components/Header.tsx | scope: frontend,qa

- [x] GatewayTours component | raw_from_ai_studio/components/GatewayTours.tsx | scope: frontend,qa

- [x] GatewayAdminLogin component | raw_from_ai_studio/components/GatewayAdminLogin.tsx | scope: frontend,qa

- [x] Gateway page | raw_from_ai_studio/pages/GatewayPage.tsx | scope: frontend,qa

- [x] BusMap component | raw_from_ai_studio/components/BusMap.tsx | scope: frontend,qa

- [x] Passenger page | raw_from_ai_studio/pages/PassengerPage.tsx | scope: frontend,tour-service,qa,security

- [x] TourModal modal | raw_from_ai_studio/modal/TourModal.tsx | scope: frontend,qa

- [x] BusModal modal | raw_from_ai_studio/modal/BusModal.tsx | scope: frontend,qa

- [x] ManualAssignModal modal | raw_from_ai_studio/modal/ManualAssignModal.tsx | scope: frontend,qa

- [x] SeatManagement component | raw_from_ai_studio/components/SeatManagement.tsx | scope: frontend,tour-service,qa,security

- [x] TourManagement component | raw_from_ai_studio/components/TourManagement.tsx | scope: frontend,qa

- [x] PassengerManifestReport component | raw_from_ai_studio/components/PassengerManifestReport.tsx | scope: frontend,qa,security

- [x] Admin Dashboard page | raw_from_ai_studio/pages/AdminDashboard.tsx | scope: frontend,tour-service,qa,security

- [x] Fix GET /tour missing embedded buses/seats: it never returns buses, but PassengerViewPage expects currentTour.buses[0].seats for the seat-map, breaking seat selection against the real backend; also re-decide what's public vs PII-safe in the response shape (see SEV-001 fix already applied to the single-bus route)

- [x] Re-validate Header component (raw_from_ai_studio/components/Header.tsx) against the plan already used to build it — existing code only, do not rebuild or change behavior, QA never actually ran on it before this task closed

- [x] Re-audit GatewayTours component (raw_from_ai_studio/components/GatewayTours.tsx) against the plan already used to build it — existing code only, do not rebuild, Security never actually ran on it before this task closed

- [x] Re-audit Gateway page (raw_from_ai_studio/pages/GatewayPage.tsx) against the plan already used to build it — existing code only, do not rebuild, Security never actually ran on it before this task closed

- [x] Re-audit ManualAssignModal modal (raw_from_ai_studio/modal/ManualAssignModal.tsx) against the plan already used to build it — existing code only, do not rebuild, Security never actually ran on it before this task closed

- [x] Re-audit TourManagement component (raw_from_ai_studio/components/TourManagement.tsx) against the plan already used to build it — existing code only, do not rebuild, Security never actually ran on it before this task closed

- [x] Add uuid identity layer, stop exposing Mongo _id to clients: every model (Admin, Tour, Bus, Seat) gets a generated uuid field (unique, indexed); _id stays internal-only for cross-collection refs and relations; every API response/embedded object exposes uuid as id and strips _id via the schema's toJSON transform (same pattern already used for stripping Admin.passwordHash); every controller/service that receives a client-supplied id resolves uuid→_id before querying; update every model, every controller/service, both API contracts, and every frontend type/service that currently reads ._id | scope: frontend,user-management-service,tour-service,qa,security

- [x] Flatten backend/user-management-service/api/api/ to backend/user-management-service/api/: this service had a wrong doubled api/api/ nesting (should match tour-service's correct single-level api/<domain>/ structure, per the backend-service-layer skill and agents/backend/CLAUDE.md, both already corrected). Move every file up one directory level, fix every relative import/require path affected by the move, update tsconfig.json (rootDir/include) if it references the old path, and rerun the full user-management-service test suite to confirm nothing broke | scope: user-management-service,qa
 
- [X] Remove stray docs/ folders under backend/: backend/docs/, backend/tour-service/docs/, and backend/user-management-service/docs/ each contain leftover agent-report/test files written there by mistake (a `cd backend/<service>` shell step caused relative docs/agent-reports/... writes to land under backend/ instead of the repo root — root cause already fixed in agents/backend/CLAUDE.md and the backend-service-layer skill). Diff each stray file against its real counterpart in docs/agent-reports/ and docs/tests/security/ before deleting — they are NOT byte-identical duplicates, review for any unique content worth preserving first, then delete the stray backend/**/docs/ folders entirely | scope: qa

- [x] Signup page | raw_from_ai_studio/pages/Signup.tsx

- [x] Implement RBAC in user-management-service (roles/permissions are currently spec-only in database-rules.md, product-definition.md, and api-contract.user-management-service.yaml — none of it is in code yet): add `Role` and `Permission` Mongoose models per database-rules.md; add a `roles` array field (default `["user"]`) to the Admin model; seed.js creates the `admin` (all tour/bus/seat permissions) and `user` (empty) role+permission documents on first run; signup always assigns `roles: ["user"]`, never `["admin"]`; embed `roles` in the JWT payload at signup/login (lib/jwt.ts JwtPayload currently has no roles field — add it); add `GET /role` and `GET /permission` read-only endpoints per the contract; tour-service's auth.middleware reads `role`/permissions from the verified JWT to authorize admin-only routes instead of just checking "is a valid admin JWT"

- [x] Prepare the project for production deploy: add a new stateless `common-service` (port 3034) that becomes the single public-facing web service — it serves the built frontend as static files and reverse-proxies `/api/auth`, `/api/forgot-password`, `/api/role`, `/api/permission` to `user-management-service` and `/api/tour`, `/api/bus`, `/api/seat`, `/api/manifest` to `tour-service`, both of which run as private/internal services with no changes of their own; frontend's `BASE_URL` resolves to a single `/api/` prefix in production and Vite builds straight into `common-service`'s static folder. Full setup already specified in `agents/backend/CLAUDE.md` (`common-service` in Steps 1-6) and `agents/frontend/CLAUDE.md` (Step 8) — orchestrator decides which agents this requires

- [x] BusType management (ניהול דגמי אוטובוס): new `busType` collection in tour-service storing reusable bus-type templates (grid of standard rows, door-row position, back-row seat count, individually disabled seat slots), independent of any tour/bus instance — add busType.model/service/controller/routes (uuid identity + soft-delete, per mongoose-models-layer/backend-service-layer skills), a "create Bus from BusType" conversion path (`busTypeId` on BusInput → server-generates `seatLayout`; `seatLayout` and `busTypeId` are mutually exclusive on bus creation, reject 400 if both or neither are supplied — per F11 in PRD.md and the `/busType`/`/tour/:tourId/buses` contract in api-contract.tour-service.yaml), frontend types/service/store slice/component, and adapt raw_from_ai_studio/src/components/BusTypeManagement.tsx (remove localStorage persistence, wire to the real API/store) | raw_from_ai_studio/src/components/BusTypeManagement.tsx | scope: frontend,tour-service,qa,security

- [x] Allow BusType change on existing buses via PUT /tour/:tourId/buses/:busId, preserving seats by position (product decision, 2026-08-22, corrected same day after human review): frontend (BusModal.tsx, bus.service.ts) already always sends `busTypeId` on both create AND update, and the admin UI already warns + requires an explicit confirm checkbox before submitting a bus-type change on a bus with occupied seats. tour-service's `bus.service.ts` PUT handler currently does NOT do this at all (per the old, now-superseded contract: "seatLayout is intentionally not remapped on update"). Implement in bus.controller.ts/bus.service.ts, per plan .plan/035-*.md: when `busTypeId` is present on update, resolve the BusType, regenerate seatLayout via `seatLayoutForBusTypeUuid` (already used by createBus), then reseed-by-position — NOT a blanket wipe: any seat whose `position` string exists in both the old and new layout keeps its exact state (status/passengerName/passengerPhone/pickupPointName/etc.) completely untouched; only seats at positions present in the OLD layout but absent from the NEW one are hard-deleted (their occupant, if any, is genuinely lost); new positions in the new layout are created `available`. Example: a passenger in seat "1" on a 55-seat bus must still be in seat "1" after switching to a 59-seat template that still has a seat "1" — losing them would be a bug, not the intended behavior. When `busTypeId` is absent, behavior is unchanged (name/pickupPoints only, seatLayout untouched). No server-side confirmation/backup is required — the admin frontend already gates this before the request is sent. | .plan/035-2026-08-22-allow-destructive-bustype-change-on-existing-buses-via-put-t.md | scope: tour-service,frontend,qa,security

- [x] Fix: custom BusType grid gaps (disabled seat slots in the middle of a row, e.g. a back row) are lost by the time the seat map renders — admin-reported bug, 2026-08-22, with screenshots showing a mini-bus back row configured with a gap in the middle rendering as packed consecutive seats instead. Root cause: `Bus.seatLayout` only ever stores a flat `positions: string[]` (sequential "1".."N"), which cannot represent a gap; the frontend then reconstructs row/col via a hardcoded generic layout (`generateBusSeats` in busLayoutHelper.ts) that has no knowledge of the actual BusType grid. Fix direction (human-approved, final, 2026-08-22 — supersedes this ticket's initial "snapshot a cells[] grid" idea): persist `busTypeId` on `Bus` (not just a transient create/update input) and derive the rendered grid (row/col, gaps included) by JOINING LIVE to the current `BusType` document at render time — never by snapshotting. This means editing a `BusType` retroactively changes the rendered seat map of every bus referencing it (admin UI must warn — not block — when editing an in-use template), and soft-deleting a `BusType` must NOT break buses that reference it (the join must resolve soft-deleted templates too). Full root-cause analysis, schema/API changes, and open questions (incl. whether the row/col join happens client-side or server-side) in .plan/036-2026-08-22-preserve-custom-bustype-grid-gaps-disabled-slots-in-seatlayout.md. | .plan/036-2026-08-22-preserve-custom-bustype-grid-gaps-disabled-slots-in-seatlayout.md | scope: tour-service,frontend,qa
