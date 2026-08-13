/**
 * Local, read-only mirror of the `role`/`permission` reference data seeded by
 * user-management-service (`api/scripts/seed.ts`, per .rule/database-rules.md
 * "Roles & Permissions"). tour-service must NOT read another service's
 * collections, and the JWT carries only `roles` — so the role→permission
 * resolution is duplicated here, keyed by the exact same permission `key`s.
 *
 * Keep in sync with user-management-service's seed script.
 */

export const PERMISSION_KEYS = [
  "tour:view",
  "tour:insert",
  "tour:update",
  "tour:delete",
  "bus:view",
  "bus:insert",
  "bus:update",
  "bus:delete",
  "seat:view",
  "seat:bookings",
  "seat:approve",
  "seat:cancel",
  "seat:toggleReserve",
  "seat:manualAssign",
  "seat:swapMove",
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

/** `admin` holds every management permission; `user` holds none. */
export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  admin: PERMISSION_KEYS,
  user: [],
}

/**
 * Resolves the permission keys a JWT payload grants. Fails closed: an unknown
 * role, a missing/malformed `roles` claim, or a malformed `permissions` claim
 * all resolve to no permissions rather than to full access.
 *
 * If the token ever starts carrying a resolved `permissions` array, it is
 * honoured (intersected with the known keys) — otherwise permissions are
 * derived from `roles`.
 */
export function resolvePermissions(payload: unknown): Set<string> {
  const granted = new Set<string>()
  if (!payload || typeof payload !== "object") return granted

  const { roles, permissions } = payload as {
    roles?: unknown
    permissions?: unknown
  }

  if (Array.isArray(permissions)) {
    for (const key of permissions) {
      if (typeof key === "string" && (PERMISSION_KEYS as readonly string[]).includes(key)) {
        granted.add(key)
      }
    }
    return granted
  }

  if (!Array.isArray(roles)) return granted
  for (const role of roles) {
    if (typeof role !== "string") continue
    for (const key of ROLE_PERMISSIONS[role] ?? []) granted.add(key)
  }
  return granted
}
