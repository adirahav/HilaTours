# Security Report — AGE-279: uuid identity layer, stop exposing Mongo `_id`

- Linear: https://linear.app/agents-example/issue/AGE-279/sec-add-uuid-identity-layer-stop-exposing-mongo-id-to-clients-every
- Plan: `.plan/028-2026-08-09-add-uuid-identity-layer-stop-exposing-mongo-id-to-clients-ev.md`
- Scope: `backend/user-management-service`, `backend/tour-service`, both API
  contract YAMLs, `frontend/src/lib/tourMapper.ts` + frontend services/types.
- Tests: `docs/tests/security/age279-uuid-identity-layer.security.test.ts`
  (+ `vitest.age279-uuid-identity-layer.config.ts`), 11/11 passing.

## Summary

By the time this audit ran, the implementation (models, `resolveId` helpers,
controllers/services, both API contracts, and the frontend mapper) was
already complete and matched the plan closely, including its own security
provisions (`resolveObjectId`/`resolveObjectIds` throwing 404 on
non-uuid/unresolvable input, `.lean()` bypass handled via explicit
`toClient*`/`toPublicSeat` mappers rather than relying on the Mongoose
transform, seat resolution scoped to `busId` so a uuid can't be replayed
against another bus). This report documents the independent verification
performed and its findings.

## What was verified

1. **`_id`/`__v`/`uuid` never leak in any response body**, including nested
   embedded objects (tour → buses → seats, manifest rows), across the public
   (unauthenticated) and admin-authenticated surfaces:
   `GET /tour`, `GET /tour/:tourId`, `GET /tour/:tourId/buses/:busId`,
   `POST .../seats/bookings`, `POST .../seats/approve`,
   `GET .../manifest`. Confirmed with the recursive `assertNoInternalIds`
   helper (`backend/tour-service/api/__tests__/helpers.ts`) already used by
   the implementation's own test suite, plus explicit `id` uuid-shape
   assertions at each nesting level.
2. **Admin identity (user-management-service)**: `signup`/`login` return
   only an opaque JWT string (never an Admin JSON object), so there is no
   `_id`/`passwordHash` leak surface on those endpoints beyond what
   `auth.test.ts` already covers. JWT `sub` is confirmed to be
   `Admin.uuid`, not the Mongo `_id` (existing test asserts
   `payload.sub !== String(admin._id)`).
3. **IDOR / cross-scope resolution (new coverage)**: a seat uuid obtained
   from Bus A is rejected (404) when submitted against Bus B's booking
   route, and a bus uuid from Tour X is rejected (404) when addressed under
   Tour Y. This confirms `resolveObjectId`/`resolveDoc`/`resolveSeatRefs`
   are always called with the correct `extraFilter` (`tourId`/`busId`
   scoping), not a bare `{ uuid }` lookup — a uuid alone is not sufficient
   to address a resource outside its declared parent.
4. **Raw Mongo `_id` cannot be used as a substitute client id (new
   coverage)**: fetching a tour by its actual ObjectId hex string 404s
   (not silently resolved), and submitting a real seat's raw `_id` in
   `seatIds` is rejected (400/404). This is the core regression this task
   guards against — the resolvers correctly reject `_id`-shaped strings
   rather than falling back to an internal-key lookup that would re-expose
   `_id` as a de-facto second valid client identifier.
5. **NoSQL-injection-shaped input (new coverage)**: an object
   (`{ $ne: null }`) submitted in `seatIds` is rejected with 400
   (`isUuid` requires a `string`, so `Array.map(String)` + regex test
   filters it before it ever reaches a Mongo query filter). A crafted
   `$ne`-style path segment 404s cleanly rather than matching every tour.
6. **Public seat projection PII-safety regression (new coverage)**: after
   the uuid migration, `GET /tour`'s embedded seats for a *booked* seat
   still expose only `{ id, position, status }` — no `passengerName`,
   `passengerPhone`, `notes`, or `assignedBy` — confirming `PUBLIC_SEAT_FIELDS`
   / `toPublicSeat` weren't accidentally widened while swapping `_id` for
   `uuid` in the projection.
7. **Reviewed source directly** (not just tests) for: `admin.model.ts`,
   `tour.model.ts` + `lib/clientShape.ts` (shared `applyUuidIdentity`/
   `toClientTour`/`toClientBus`/`toClientSeat`/`toPublicSeat`),
   `lib/resolveId.ts` (both services), `tour.service.ts`, `bus.service.ts`,
   `seat.service.ts`, `manifest.service.ts`, `auth.middleware.ts` (both
   services), `auth.service.ts`, and `frontend/src/lib/tourMapper.ts`. All
   controllers pass through service-layer results, and every service
   function that returns to a client routes its output through a
   `toClient*`/`toPublicSeat` mapper — no raw `.lean()`/Mongoose-document
   object reaches `res.json()` directly anywhere in scope.
8. **Concurrency**: confirmed uuid→`_id` resolution is a lookup-only step
   ahead of the existing condition-checked `findOneAndUpdate({ _id, status
   })` writes in `seat.service.ts` (approve/cancel/toggle-reserve/
   manual-assign/swap-move) — no new TOCTOU gap introduced.
9. **API contracts**: both YAMLs document `id`/uuid format on every schema
   in scope (`Tour`, `Bus`, `Seat`/`PublicSeat`, `Admin`, manifest rows) and
   describe path params as uuids that reject raw `_id` values, matching the
   implementation.

## Findings

None new. No `_id` leakage, no IDOR, no injection bypass, and no PII
over-exposure was found in this audit's scope. The implementation already
incorporated this task's own listed risks (Auth/JWT `sub` risk, cross-service
ref risk — resolved as denormalized `createdBy`/`assignedBy` uuid strings per
the plan's Step 4 design fork rather than a cross-service ObjectId resolve,
concurrency risk) correctly.

One pre-existing, out-of-scope observation carried over from a prior audit
(AGE-274, `docs/tests/security/age274-tour-management.security.test.ts`):
deleting a bus/tour with an active booking still hard-deletes the associated
`Seat` documents (including passenger PII) rather than soft-deleting them,
contradicting the tour-service API contract's "data is retained" wording.
This is unrelated to the uuid identity layer (the uuid moves with the
document either way) and was not reintroduced or worsened by this task — not
re-litigated here, just noted as still open.

## Test results

- `backend/tour-service`: `npm test` — 59/59 passing.
- `backend/user-management-service`: `npm test` — 13/13 passing.
- New security tests: `npx vitest run --config docs/tests/security/vitest.age279-uuid-identity-layer.config.ts` — 11/11 passing.

## Conclusion

The uuid identity layer is implemented correctly and matches the approved
plan. No `_id` leakage, IDOR, or injection issues were found across the
tour/bus/seat/manifest/auth surfaces in either backend service, the API
contracts, or the frontend mapper. No fixes were required as part of this
audit.

STATUS: DONE
