import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { PermissionKey, resolvePermissions } from "./permissions"

/**
 * Payload shape of the JWT issued by user-management-service
 * (`api/lib/jwt.ts`). Duplicated locally — services never import each
 * other's code — and every field is optional here so a drifting/older token
 * fails closed rather than crashing.
 */
export interface JwtPayload extends jwt.JwtPayload {
  sub?: string
  email?: string
  username?: string
  roles?: string[]
}

export interface AuthedRequest extends Request {
  /**
   * The admin's PUBLIC uuid, taken from the JWT (plan 028) — never a Mongo
   * `_id`. Admin lives in user-management-service, so tour-service cannot
   * resolve it to an ObjectId; it is stored verbatim in the internal
   * attribution fields `Tour.createdBy` / `Seat.assignedBy`, neither of which
   * is ever serialized to a client.
   */
  adminId?: string
  /** Role names from the verified JWT's `roles` claim. */
  roles?: string[]
  /** Permission keys resolved from those roles. */
  permissions?: Set<string>
}

type AuthFailure = { status: number; message: string }

/**
 * Verifies the JWT issued by user-management-service (both services share
 * JWT_SECRET) and attaches identity + resolved permissions to the request.
 */
function authenticate(req: AuthedRequest): AuthFailure | null {
  const header = req.headers.authorization || ""
  const [scheme, token] = header.split(" ")

  if (scheme !== "Bearer" || !token) {
    return { status: 401, message: "Missing or malformed Authorization header" }
  }

  const secret = process.env.JWT_SECRET
  if (!secret) {
    return { status: 500, message: "JWT secret not configured" }
  }

  let payload: JwtPayload
  try {
    payload = jwt.verify(token, secret) as JwtPayload
  } catch {
    return { status: 401, message: "Invalid or expired token" }
  }

  const adminId = (payload.id || payload.sub || payload._id) as string | undefined
  if (!adminId) {
    return { status: 401, message: "Invalid token payload" }
  }

  req.adminId = adminId
  req.roles = Array.isArray(payload.roles) ? payload.roles : []
  req.permissions = resolvePermissions(payload)
  return null
}

/**
 * Authorizes an admin-only route on a specific permission key
 * (e.g. `tour:insert`), resolved from the verified JWT's `roles` claim.
 *
 * 401 — missing/malformed/invalid/expired token, or unresolvable identity.
 * 403 — validly-signed token whose roles do not grant the required permission
 *       (this is what stops a self-signed-up `roles: ["user"]` account from
 *       reaching admin routes).
 */
export function requirePermission(permission: PermissionKey) {
  return function (req: AuthedRequest, res: Response, next: NextFunction): void {
    const failure = authenticate(req)
    if (failure) {
      res.status(failure.status).json({ message: failure.message })
      return
    }

    if (!req.permissions?.has(permission)) {
      res.status(403).json({ message: "Forbidden" })
      return
    }

    next()
  }
}
