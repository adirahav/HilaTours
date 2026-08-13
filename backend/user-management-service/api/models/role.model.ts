import { randomUUID } from 'crypto'
import mongoose, { Schema, Document, Model } from 'mongoose'

// A named set of permission keys assignable to a `user` account via its
// `roles` array (see user.model.ts). `permissions` stores permission `key`s
// directly (not refs) — matches how they're embedded in the JWT/checked at
// the route layer, at the cost of no referential integrity to `Permission`;
// seed.ts is the single place that keeps the two in sync.
export interface RoleDoc extends Document {
  uuid: string
  name: string
  description: string
  permissions: string[]
  createdAt: Date
}

const roleSchema = new Schema<RoleDoc>({
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  permissions: { type: [String], required: true, default: [] },
  createdAt: { type: Date, default: Date.now },
})

export function toClientRole(raw: Record<string, any> | null | undefined) {
  if (!raw) return raw
  const { _id, __v, uuid, ...rest } = raw
  return { id: uuid, ...rest }
}

const transform = (_doc: unknown, ret: Record<string, any>) => toClientRole(ret)
roleSchema.set('toJSON', { virtuals: false, versionKey: false, transform })
roleSchema.set('toObject', { virtuals: false, versionKey: false, transform })

export const Role: Model<RoleDoc> =
  (mongoose.models.Role as Model<RoleDoc>) ||
  mongoose.model<RoleDoc>('Role', roleSchema, 'role')
