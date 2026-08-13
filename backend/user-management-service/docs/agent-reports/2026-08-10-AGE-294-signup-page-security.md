# Security Audit: Admin Sign Up Page (AGE-294)

**Ticket:** https://linear.app/agents-example/issue/AGE-294/sec-signup-page
**Plan:** `.plan/031-2026-08-10-signup-page.md`
**Scope:** `frontend/src/pages/SignUpPage.tsx`, `frontend/src/services/auth.service.ts`, `backend/user-management-service` (auth controller/service/model/middleware), `backend/tour-service` (auth middleware and all admin-gated routes), API contracts for `user-management-service` and `tour-service`.

## Summary

The frontend signup page and `user-management-service`'s own role model are implemented correctly: signup always assigns `roles: ["user"]` server-side regardless of client input, the JWT never leaks `passwordHash`, and `user-management-service`'s own `requireAdmin` middleware correctly checks the `roles` claim. However, shipping public self-signup exposed a **pre-existing but previously low-impact gap in `tour-service`**: its `requireAdmin` middleware only validates the JWT signature and never inspects the `roles` claim. Before self-signup existed, every issued JWT came from a manually-provisioned admin account, so this gap was latent. Now that anyone can self-register and receive a validly-signed `roles: ["user"]` JWT, that gap becomes a live, externally-reachable **privilege escalation / broken access control vulnerability**: any self-registered account can create, update, and delete tours, buses, and (per route wiring) manifests/seats in `tour-service`.

Two secondary issues were also found on the new signup endpoint: user/email enumeration via a verbatim error message, and no rate limiting on signup (or login).

## Findings

### 1. HIGH — Broken access control: `tour-service` `requireAdmin` does not check `roles`

**File:** `backend/tour-service/api/auth/auth.middleware.ts`

```ts
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || ""
  const [scheme, token] = header.split(" ")
  if (scheme !== "Bearer" || !token) { res.status(401)...; return }
  const secret = process.env.JWT_SECRET
  if (!secret) { res.status(500)...; return }
  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload
    req.adminId = (payload.id || payload.sub || payload._id) as string | undefined
    if (!req.adminId) { res.status(401)...; return }
    next()
  } catch { res.status(401)... }
}
```

This function is named `requireAdmin` and is used to gate every tour/bus mutation route (`tour.routes.ts`, `bus.routes.ts`, and per grep also `manifest.routes.ts`, `seat.routes.ts`), but it only verifies the JWT signature/expiry — it never inspects `payload.roles`. Compare with `user-management-service`'s correctly-implemented same-named middleware (`backend/user-management-service/api/auth/auth.middleware.ts`), which does `roles.includes(ROLE_ADMIN)`.

The `user-management-service` OpenAPI contract documents that `roles` is embedded in the JWT specifically so `tour-service` can authorize locally without a callback — i.e., role-based authorization via the JWT claim is the documented, intended cross-service contract. `tour-service`'s middleware does not implement its half of that contract.

**Impact:** Any visitor can call the new public `POST /auth/signup`, receive a valid JWT with `roles: ["user"]`, and use it to pass `tour-service`'s `requireAdmin` on `POST/PUT/DELETE /tour`, `/tour/:id/buses`, and related manifest/seat mutation routes — full write access to tour/bus data with a non-admin account.

**Proof:** `docs/tests/security/signup-privilege-escalation.test.ts` — mints a token shaped exactly like what `user-management-service`'s signup issues (`roles: ["user"]`), sends it against `tour-service`'s real `requireAdmin` middleware, and shows it is accepted (200) where it should be rejected (403). A reference test in the same file shows `user-management-service`'s `requireAdmin` correctly rejects the identical token with 403, proving the asymmetry. All 5 tests currently pass, i.e. the vulnerable behavior is confirmed live in the codebase as of this audit.

**Recommendation:** Have `tour-service`'s `requireAdmin` decode `payload.roles` and reject (403) unless it includes `"admin"`, matching `user-management-service`'s implementation. This must ship before/alongside the signup page being publicly reachable, since it is the signup feature that turns this from a latent gap into an exploitable one.

### 2. MEDIUM — User/email enumeration on `POST /auth/signup`

**Files:** `backend/user-management-service/api/auth/auth.service.ts` (throws `'email already exists'`), `auth.controller.ts` (passes `err.message` straight into the JSON response), `frontend/src/pages/SignUpPage.tsx` (renders `err.message` verbatim to the user).

An attacker can submit any email to `/auth/signup` and learn, from the response text, whether that email already has an account — useful for targeting credential stuffing or phishing at known users. `login()` correctly uses a uniform "invalid email or password" message for both "no such user" and "wrong password," but `signup()` does not have an equivalent generic path.

**Proof:** `docs/tests/security/signup-enumeration-and-abuse.test.ts`, first `describe` block — confirms the duplicate-signup response body contains `/email already exists/i`.

**Recommendation:** Return a generic signup error (or, better, a generic 200-style "check your email" response regardless of outcome) instead of confirming the collision was on `email` specifically.

### 3. MEDIUM — No rate limiting on `/auth/signup` (or `/auth/login`)

**Files:** `backend/user-management-service/api/auth/auth.controller.ts`, and confirmed via search: no `express-rate-limit` or equivalent throttling package/middleware anywhere in `backend/user-management-service` or `backend/tour-service`.

Public self-signup with no throttling allows unlimited automated account creation (spam/resource exhaustion) and, combined with finding #2, scripted enumeration of registered emails. The pre-existing `/auth/login` also has no brute-force protection (flagged in a prior security report before this feature existed; the risk is now compounded by public signup making credential pairs cheap to mint).

**Proof:** `docs/tests/security/signup-enumeration-and-abuse.test.ts`, second `describe` block — fires 8 rapid signup requests and confirms all 8 succeed with no `429` anywhere.

**Recommendation:** Add per-IP rate limiting to `/auth/signup` and `/auth/login` (e.g. `express-rate-limit`).

### 4. LOW — No server-side password strength enforcement

`backend/user-management-service/api/models/admin.model.ts` has no `minlength`/complexity constraint on the password (only `passwordHash` is stored); `auth.service.ts`'s `assertCredentialStrings` only checks the value is a non-empty string. The 6-character minimum is enforced only in the frontend (`SignUpPage.tsx`), which is trivially bypassed by calling the API directly.

**Recommendation:** Enforce minimum length (and ideally basic complexity) server-side in `signup()`, not just client-side.

### 5. LOW — Contract/implementation mismatch on login error status

`docs/api-contract/api-contract.user-management-service.yaml` documents `/auth/login` returning `400` for invalid credentials; `auth.service.ts` actually throws with `status: 401`. Not a vulnerability, but should be reconciled so the contract is trustworthy for future integrators.

## What was verified as correct

- **No client-side privilege escalation surface:** `frontend/src/services/auth.service.ts`'s `signup()` only forwards `fullname`, `email`, `password` — no `roles` field.
- **Server-side role hardcoding:** `auth.service.ts`'s `signup()` builds the Mongo document field-by-field (`Admin.create({ username, email, passwordHash, roles: [...DEFAULT_SIGNUP_ROLES] })`), never spreading `req.body`, so a client-supplied `roles: ["admin"]` in the signup request body is silently ignored. Verified live via `docs/tests/security/signup-enumeration-and-abuse.test.ts`'s third `describe` block (decodes the returned JWT and asserts `roles === ["user"]"` even when the request body sent `roles: ["admin"]"`), and already covered by existing unit tests in `backend/user-management-service/api/auth/auth.test.ts`.
- **No auto-admin session on signup:** `SignUpPage.tsx` deliberately discards the signup response's token and redirects to `/login` (per the plan's Open Questions answer), so a successful signup never itself establishes an authenticated session implying admin access.
- **No sensitive-field leakage:** `toClientAdmin()` in `admin.model.ts` strips `_id`, `__v`, and `passwordHash` from any client-facing projection.
- **NoSQL injection guarded:** `assertCredentialStrings()` rejects non-string `email`/`password` (blocks Mongo operator-injection payloads like `{ $gt: "" }`).
- **JWT secret handling fails closed:** both services throw/500 if `JWT_SECRET` is unset rather than falling back to a default/hardcoded secret; `passwordHash` uses `bcrypt` with `SALT_ROUNDS = 10` and constant-time `bcrypt.compare`.
- **CORS:** `user-management-service` uses a fixed single-origin allowlist from `FRONTEND_URL` with `credentials: true` — not a wildcard-with-credentials misconfiguration.

## Tests added

- `docs/tests/security/signup-privilege-escalation.test.ts` — 5 tests proving `tour-service`'s `requireAdmin` accepts self-signup-shaped `"user"`-role tokens (Finding #1), plus a signature-forgery baseline and a `user-management-service` reference comparison. All pass against current code (i.e., the vulnerable behavior is reproduced).
  - Run: `cd backend/tour-service && npx vitest run --dir ../.. ../../docs/tests/security/signup-privilege-escalation.test.ts`
- `docs/tests/security/signup-enumeration-and-abuse.test.ts` — 3 tests: email-enumeration via signup error text (Finding #2), unthrottled rapid signup (Finding #3), and a positive-control test confirming client-supplied `roles` cannot escalate privilege (validates the "what was verified as correct" section). All pass against current code.
  - Run (from `backend/user-management-service`, since it needs that service's full dependency tree including `mongodb-memory-server`): copy or reference the file into a location the service's `vitest.config.ts` include-glob can reach, or invoke with `--dir` pointed at the repo root as shown above for `tour-service`; simplest reliable invocation used during this audit was running vitest with `dir` overridden to the repo root from within `backend/user-management-service`.

## Priority recommendation

Fix Finding #1 (`tour-service` `requireAdmin` roles check) before the signup page is considered safe to expose publicly — it is a direct, high-severity consequence of this feature going live. Findings #2–#3 should be addressed promptly but do not block launch as severely (they enable reconnaissance/abuse rather than direct data mutation by unauthorized users). Finding #4–#5 are hardening/documentation items.
