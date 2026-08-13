import { Request, Response } from 'express'
import { Role } from '../models/role.model'
import { Permission } from '../models/permission.model'

// Read-only reference lookups for the RBAC data seeded by api/scripts/seed.ts.
// There is deliberately no write endpoint here — assigning a role to an
// account is a manual/out-of-band action today (see api-contract `/role`).
export async function listRoles(_req: Request, res: Response) {
  try {
    const roles = await Role.find({}).sort({ name: 1 })
    res.status(200).json(roles.map((role) => role.toJSON()))
  } catch {
    res.status(500).json({ error: 'Failed to list roles' })
  }
}

export async function listPermissions(_req: Request, res: Response) {
  try {
    const permissions = await Permission.find({}).sort({ category: 1, key: 1 })
    res.status(200).json(permissions.map((permission) => permission.toJSON()))
  } catch {
    res.status(500).json({ error: 'Failed to list permissions' })
  }
}
