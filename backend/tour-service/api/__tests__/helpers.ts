import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import jwt from "jsonwebtoken"
import { randomUUID } from "crypto"

const JWT_SECRET = "test-secret-shared-between-services"

let mongod: MongoMemoryServer

export async function connectTestDb(): Promise<void> {
  process.env.JWT_SECRET = JWT_SECRET
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri(), { dbName: "tour_service_test" })
}

export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({})
  }
}

export async function closeTestDb(): Promise<void> {
  await mongoose.disconnect()
  if (mongod) await mongod.stop()
}

/**
 * Admin JWTs now carry the admin's public uuid (plan 028), not a Mongo `_id`
 * — tour-service stores it verbatim as internal attribution.
 */
export function adminToken(adminId: string = randomUUID()): string {
  return tokenWithRoles(["admin"], adminId)
}

/** A validly-signed token for a self-signed-up account (no permissions). */
export function userToken(adminId: string = randomUUID()): string {
  return tokenWithRoles(["user"], adminId)
}

/** Signs a token with an arbitrary `roles` claim (omit for no claim at all). */
export function tokenWithRoles(
  roles: unknown | undefined,
  adminId: string = randomUUID(),
): string {
  const payload: Record<string, unknown> = { sub: adminId }
  if (roles !== undefined) payload.roles = roles
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" })
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Recursively asserts a response body never contains `_id`/`__v`/`uuid`. */
export function assertNoInternalIds(value: unknown, path = "body"): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoInternalIds(v, `${path}[${i}]`))
    return
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (key === "_id" || key === "__v" || key === "uuid") {
        throw new Error(`Internal key "${key}" leaked at ${path}`)
      }
      assertNoInternalIds((value as Record<string, unknown>)[key], `${path}.${key}`)
    }
  }
}
