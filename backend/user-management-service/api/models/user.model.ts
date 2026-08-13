import { randomUUID } from 'crypto'
import mongoose, { Schema, Document, Model } from 'mongoose'

// Single collection for every account. "Admin" is not a separate entity —
// it's a `User` whose `roles` includes `ROLE_ADMIN`. Self-signup (see
// auth.service.ts) always assigns `[ROLE_USER]`; admin accounts are the same
// document shape, just provisioned out-of-band with `roles: ['admin']`.
export interface UserDoc extends Document {
  uuid: string
  username: string
  email: string
  passwordHash: string
  roles: string[]
  createdAt: Date
  deletedAt: Date | null
}

// Role names known at launch (see .rule/database-rules.md, Roles & Permissions).
// `user` holds no permissions and is the only role a self-signup may receive.
export const ROLE_ADMIN = 'admin'
export const ROLE_USER = 'user'

const userSchema = new Schema<UserDoc>({
  // Public identity. Mongo `_id` stays internal-only (primary key and
  // cross-collection refs such as Tour.createdBy / Seat.assignedBy).
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  // Never assigned from client input — see auth.service.signup().
  roles: { type: [String], required: true, default: () => [ROLE_USER], index: true },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
})

// Client-facing projection: expose `uuid` as `id`, never `_id`/`__v`/`passwordHash`.
export function toClientUser(raw: Record<string, any> | null | undefined) {
  if (!raw) return raw
  const { _id, __v, uuid, passwordHash, ...rest } = raw
  return { id: uuid, ...rest }
}

const transform = (_doc: unknown, ret: Record<string, any>) => toClientUser(ret)

userSchema.set('toJSON', { virtuals: false, versionKey: false, transform })
userSchema.set('toObject', { virtuals: false, versionKey: false, transform })

// Exclude soft-deleted documents automatically.
userSchema.pre(/^find/, function (this: any, next) {
  if (!('deletedAt' in this.getFilter())) {
    this.where({ deletedAt: null })
  }
  next()
})

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ||
  mongoose.model<UserDoc>('User', userSchema, 'user')
