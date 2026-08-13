import dotenv from 'dotenv'
import { connectDb, disconnectDb } from '../lib/db'
import { Permission } from '../models/permission.model'
import { Role } from '../models/role.model'

const DOTENV_FILENAME = ['.env', 'development'].join('.')
dotenv.config({ path: DOTENV_FILENAME })

// Bootstrap-only: creates the `permission` and `role` documents the app
// expects to exist at launch (see .rule/database-rules.md, Roles & Permissions).
// Idempotent — safe to run on every deploy; never touches `user` data.
const PERMISSIONS: Array<{ key: string; description: string; category: 'tour' | 'bus' | 'seat' }> = [
  { key: 'tour:view', description: 'View tours', category: 'tour' },
  { key: 'tour:insert', description: 'Create a tour', category: 'tour' },
  { key: 'tour:update', description: 'Update a tour', category: 'tour' },
  { key: 'tour:delete', description: 'Delete a tour', category: 'tour' },
  { key: 'bus:view', description: 'View buses', category: 'bus' },
  { key: 'bus:insert', description: 'Create a bus', category: 'bus' },
  { key: 'bus:update', description: 'Update a bus', category: 'bus' },
  { key: 'bus:delete', description: 'Delete a bus', category: 'bus' },
  { key: 'seat:view', description: 'View seats', category: 'seat' },
  { key: 'seat:bookings', description: 'Request a seat booking', category: 'seat' },
  { key: 'seat:approve', description: 'Approve a pending seat booking', category: 'seat' },
  { key: 'seat:cancel', description: 'Cancel a seat booking', category: 'seat' },
  { key: 'seat:toggleReserve', description: 'Reserve or unreserve a seat', category: 'seat' },
  { key: 'seat:manualAssign', description: 'Manually assign a passenger to a seat', category: 'seat' },
  { key: 'seat:swapMove', description: 'Swap or move a passenger between seats', category: 'seat' },
]

const ROLES: Array<{ name: string; description: string; permissions: string[] }> = [
  {
    name: 'admin',
    description: 'System administrator',
    permissions: PERMISSIONS.map((p) => p.key),
  },
  {
    name: 'user',
    description: 'Self-signed-up account with no management permissions',
    permissions: [],
  },
]

async function seed() {
  await connectDb()

  for (const permission of PERMISSIONS) {
    await Permission.findOneAndUpdate(
      { key: permission.key },
      { $set: permission },
      { upsert: true, new: true },
    )
  }
  console.log(`[seed] upserted ${PERMISSIONS.length} permissions`)

  for (const role of ROLES) {
    await Role.findOneAndUpdate({ name: role.name }, { $set: role }, { upsert: true, new: true })
  }
  console.log(`[seed] upserted ${ROLES.length} roles`)

  await disconnectDb()
}

seed()
  .then(() => {
    console.log('[seed] done')
    process.exit(0)
  })
  .catch((err) => {
    console.error('[seed] failed', err)
    process.exit(1)
  })
