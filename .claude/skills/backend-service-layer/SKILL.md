---
name: backend-service-layer
description: Use this skill when implementing Express routes, Mongoose models, or business logic in either backend microservice (user-management-service, tour-service). Covers the controller/service/routes/middleware pattern, soft-delete, JWT auth, and — most critically — the atomic seat-status concurrency guard.
references:
  - @.rule/database-rules.md
  - @.rule/coding-rules.md
  - @.rule/glossary.md
  - @.rule/naming-rules.md
  - @.rule/testing-rules.md
  - @seat-concurrency-layer/SKILL.md
  - @mongoose-models-layer/SKILL.md
  - @jwt-middleware-layer/SKILL.md
---

# Backend Service Layer Guidelines
*Goal:* Implement each microservice's business logic, data access, and API surface exactly to its contract, with clean separation between routing, request/response handling, and domain logic — and with the seat-status concurrency guarantee treated as non-negotiable.

**Core Responsibilities:**
- *Routing:* Wiring `<method> + path → controller`, nothing else.
- *Controllers:* Request/response shape only — parse input, call the service, return the right status code. No business logic here.
- *Services:* All business logic, validation, and DB access.
- *Middleware:* Auth (JWT) and any domain-specific request guards.

## Which Service Am I In?
Each invocation targets exactly one microservice (see `agents/backend/CLAUDE.md`) — never write to the other service's directory.

- **`user-management-service`** (port 3032) — `Admin` model only. Domains: `auth/` (login, signup, logout, forgot-password).
- **`tour-service`** (port 3033) — `Tour`, `Bus`, `Seat` models. Domains: `tour/`, `bus/`, `seat/`, `manifest/`.

## File Structure Per Domain
`api/` is the top-level folder directly under each service (confirmed by `tour-service`, the correct reference implementation:
```
backend/<service>/
  api/
    lib/
      db.ts              # Mongoose connection
      jwt.ts              # sign/verify helpers (user-management-service only)
    models/
      <model>.model.ts    # Mongoose schema
    <domain>/
      <domain>.routes.ts       # route wiring only
      <domain>.controller.ts   # request/response only
      <domain>.service.ts      # business logic + DB access
      <domain>.middleware.ts   # domain-specific guards (if any)
    app.ts                  # createApp() — Express app, no listen()
    server.ts                # listen() only, imports createApp()
  __tests__/                   # or per-domain test files — see .rule/testing-rules.md
```
Controllers never touch Mongoose directly — they call the service. Routes never contain logic — they call the controller. This mirrors `.rule/coding-rules.md`'s backend architecture section.

**Report/test write paths are always repo-root-relative, never relative to your current shell directory.** If a step has you `cd backend/<service>` to run `npm` commands, every subsequent file write (reports, `docs/tests/security/...`, etc.) must still resolve against the repository root — use `docs/agent-reports/...` etc. exactly as written in this skill, not relative to wherever a prior `cd` left the shell. A stray `backend/docs/`, `backend/<service>/docs/`, or similar path appearing anywhere under `backend/` is exactly this bug — reports and tests never belong there.

## Mongoose Models
**See the dedicated `mongoose-models-layer` skill for full schema definitions, the soft-delete hook pattern, required indexes, and query conventions.** Short version: `Admin`/`Tour`/`Bus` are soft-deleted via a schema-level `pre('find'/'findOne')` hook (never remember the filter per-query); `Seat` has no soft delete (deleted with its parent `Bus`); `Seat.status` is a strict enum, never a free-form string; naming is camelCase throughout, per `.rule/naming-rules.md`; every model exposes `id` (a `uuid`) to clients and never `_id` — a controller receiving a client `id` param must resolve it to `_id` via the service layer before querying, and any `.lean()` result returned straight from a controller must be mapped through the same `uuid`→`id` shape by hand.

## Seat Concurrency
This is the highest-risk logic in the whole codebase. **See the dedicated `seat-concurrency-layer` skill before writing or reviewing any code that changes `Seat.status`** — it covers the atomic-update pattern, the full per-action rule table, the `swap-move` multi-document case, and the concurrency test pattern in depth. The short version: every status-changing action is one atomic `findOneAndUpdate` with the precondition in the filter, never a separate read-then-write; `swap-move` needs a transaction or explicit rollback since it touches two documents; no endpoint ever accepts `status`/`seatStatus` from the client.

## JWT & Auth Middleware
**See the dedicated `jwt-middleware-layer` skill for the full trust model, token shape, validation middleware, and shared-secret coordination between the two services.** Short version: only `user-management-service` issues tokens; both services validate independently with the identical `JWT_SECRET`; `seats/bookings` is the one endpoint with no auth at all; always pin `algorithms: ['HS256']` explicitly on both sign and verify.

## Error Handling & Status Codes
- `400` — validation failure (missing/malformed fields).
- `401` — missing/invalid/expired admin JWT on a protected route.
- `404` — resource not found (or soft-deleted, which reads as not-found to the API).
- `409` — seat-conflict (the seat's current status doesn't allow the requested transition). This is the most important status code in the app — never collapse it into a generic `400`.
- `500` — unexpected server error only; never used for expected business-rule rejections like a seat conflict.
- Never leak stack traces or raw Mongoose error objects in a response body — return a clean `{ error: string }` shape.

## Testing Expectations
Per `.rule/testing-rules.md`, `seat.service.ts` requires the deepest coverage in the repo:
- Every valid transition succeeds; every invalid transition is rejected with the right status.
- **Concurrency test is mandatory:** fire two genuinely simultaneous `bookings` calls for the same seat (e.g. `Promise.all([...])` against the running server, not sequential `await`s) and assert exactly one succeeds.
- Soft-delete: a deleted `Tour`/`Bus` is excluded from list/get results but its document still exists in the DB (assert both).
- Admin-only routes reject with `401` when the JWT is missing, expired, tampered, or uses `alg: none`.

## Implementation Checklist
- [ ] Routes contain no logic; controllers contain no business logic; services contain no request/response handling.
- [ ] Every status-changing seat action uses a single atomic `findOneAndUpdate` (or transaction, for `swap-move`) — never read-then-write.
- [ ] No endpoint accepts `status`/`seatStatus` directly from the client.
- [ ] All list/get queries filter `deletedAt: null` (via schema hook, not ad-hoc per query).
- [ ] `JWT_SECRET` is identical across both services' `.env.development`.
- [ ] `409` is used specifically and only for seat-conflict; not reused for other validation failures.
- [ ] A genuine concurrent-request test exists for every seat-booking-adjacent endpoint.
