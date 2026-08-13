---
name: jwt-middleware-layer
description: Use this skill when implementing JWT issuance in user-management-service, or JWT validation middleware in either service. Covers token shape, the shared-secret trust model between two independently-deployed services, and the specific attack surface to guard against.
references:
  - @backend-service-layer/SKILL.md
  - @.rule/database-rules.md
  - @agents/security/CLAUDE.md
---

# JWT & Middleware Layer
*Goal:* One service issues the admin token, another validates it, and neither trusts the client for anything the token itself should prove. This skill exists separately because the trust model here is easy to get subtly wrong in a two-service setup — get it wrong and either admin routes become unguarded, or JWT_SECRET drifts between services and every admin gets logged out at random.

## The Trust Model
- **Only `user-management-service` issues tokens** — via `login`/`signup`. It's the only service with `jwt.ts`'s `sign` function.
- **Both services validate tokens** — `user-management-service` validates its own token on `logout`; `tour-service` validates the same token on every admin-only route. Neither service calls the other over the network to check a token — validation is local, using the shared secret.
- **There is no passenger token at all.** `seats/bookings` is the one endpoint in the app that takes no `Authorization` header, ever — passenger identity is whatever `passengerName`/`passengerPhone` was submitted in that one request body (see `.rule/glossary.md`). Do not add token issuance for passengers; it's out of scope (see `docs/product-definition.md`).

## Token Issuance (`user-management-service` only)

```typescript
// backend/user-management-service/src/lib/jwt.ts
import jwt from 'jsonwebtoken'

export interface AdminTokenPayload {
  adminId: string
  username: string
  roles: string[] // e.g. ['admin'] or ['user'] — embedded so tour-service can authorize locally, see architecture.md
}

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    algorithm: 'HS256', // pin this explicitly — never let the caller/library negotiate the algorithm
  })
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET!, {
    algorithms: ['HS256'], // reject anything else, including "none" — see Security Notes below
  }) as AdminTokenPayload
}
```

- Payload contains `adminId`, `username`, and `roles` — the minimum needed to identify the admin and authorize them locally in `tour-service` without a cross-service call (see `architecture.md`, Cross-service permission checking). Never include `passwordHash` or anything else a client shouldn't be able to decode and read (JWTs are signed, not encrypted; anyone can base64-decode the payload).
- **Trade-off to keep in mind:** because `roles` is baked into the token at issuance, a role change (e.g. promoting an account to `admin`) only takes effect the next time that admin logs in — there's no live revocation mid-session. Acceptable for now given `JWT_EXPIRES_IN`; revisit if that becomes a problem.
- `expiresIn` comes from `process.env.JWT_EXPIRES_IN`, not hardcoded — set once in each service's `.env.development` (see `agents/backend/CLAUDE.md` Step 5), identical value in both.

## Validation Middleware (both services)

```typescript
// auth.middleware.ts — present in both services, identical logic, identical JWT_SECRET
import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'

export interface AuthedRequest extends Request {
  admin?: { adminId: string; username: string; roles: string[] }
}

export function requireAdminAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }

  const token = header.slice(7)

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] })
    req.admin = decoded as AuthedRequest['admin']
    next()
  } catch (err) {
    // Covers: expired (TokenExpiredError), tampered signature (JsonWebTokenError), malformed token
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
```

- Every `tour`/`bus` write route, and every `seat` management action (`approve`, `cancel`, `toggle-reserve`, `manual-assign`, `swap-move`), mounts this middleware. `seats/bookings` never does.
- The middleware never distinguishes *why* a token failed (expired vs. tampered vs. malformed) in its response body — all map to the same generic `401`, so a client can't use the error message to probe the validation logic.

## The Shared-Secret Coordination Problem
Because `user-management-service` and `tour-service` are independently deployable, it's possible to update one's `JWT_SECRET` without the other — the failure mode is silent and confusing (every admin suddenly gets `401`s from `tour-service` while `user-management-service` logins still work fine).
- When rotating `JWT_SECRET`, update both services' `.env.development`/production env vars together, in the same deploy window.
- If zero-downtime secret rotation is ever needed, that requires a dual-secret validation window (accept old-or-new secret for a transition period) — not currently implemented; flag this explicitly if a real rotation need comes up rather than guessing at an approach.

## Security Notes (see `agents/security/CLAUDE.md`)
- **Algorithm confusion:** always pass an explicit `algorithms: ['HS256']` allowlist to `jwt.verify` — without it, some JWT libraries have historically accepted `alg: none` or let an attacker switch the algorithm, bypassing signature verification entirely. Pinning the algorithm on both sign and verify closes this.
- **Secret storage:** `JWT_SECRET` lives only in `.env.development`/deployment env vars, never in source code, never logged, never included in an error response even during debugging.
- **No password/secret in the payload:** confirmed above — payload is `{ adminId, username }` only.
- **Token in URL:** never accept or emit the token as a query parameter — only the `Authorization: Bearer <token>` header, on both the issuing and validating sides.

## Testing
- `verifyAdminToken`/`requireAdminAuth` must be tested against: a valid token (passes), an expired token (`401`), a tampered signature (`401`), a token signed with a different secret (`401`), and a token with `alg: none` or an unexpected algorithm (`401`) — per `agents/security/CLAUDE.md`'s security test list.
- Test that `seats/bookings` succeeds with **no** `Authorization` header at all, to confirm it's genuinely public and no auth check accidentally crept onto that route.

## Implementation Checklist
- [ ] `sign`/`verify` both pin `algorithms: ['HS256']` explicitly — never left to library defaults.
- [ ] `JWT_SECRET` and `JWT_EXPIRES_IN` come from env vars, identical value across both services.
- [ ] Token payload contains no sensitive fields — `adminId`/`username` only.
- [ ] `requireAdminAuth` returns a generic `401` regardless of the specific validation failure reason.
- [ ] `seats/bookings` has no auth middleware attached; every other seat/tour/bus write route does.
- [ ] No token is ever accepted via query string — header only.