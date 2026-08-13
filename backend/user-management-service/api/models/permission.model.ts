import { randomUUID } from 'crypto'
import mongoose, { Schema, Document, Model } from 'mongoose'

// A single named capability a `role` can hold. Keyed `<category>:<action>` —
// the `<action>` segment of any `seat:*` key must reuse the canonical seat
// action terms in `.doc/glossary.md` (`bookings`, `approve`, `cancel`,
// `toggleReserve`, `manualAssign`, `swapMove`), never a synonym.
export interface PermissionDoc extends Document {
  uuid: string
  key: string
  description: string
  category: 'tour' | 'bus' | 'seat'
  createdAt: Date
}

const permissionSchema = new Schema<PermissionDoc>({
  uuid: { type: String, default: () => randomUUID(), unique: true, index: true },
  key: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  category: { type: String, required: true, enum: ['tour', 'bus', 'seat'] },
  createdAt: { type: Date, default: Date.now },
})

export function toClientPermission(raw: Record<string, any> | null | undefined) {
  if (!raw) return raw
  const { _id, __v, uuid, ...rest } = raw
  return { id: uuid, ...rest }
}

const transform = (_doc: unknown, ret: Record<string, any>) => toClientPermission(ret)
permissionSchema.set('toJSON', { virtuals: false, versionKey: false, transform })
permissionSchema.set('toObject', { virtuals: false, versionKey: false, transform })

export const Permission: Model<PermissionDoc> =
  (mongoose.models.Permission as Model<PermissionDoc>) ||
  mongoose.model<PermissionDoc>('Permission', permissionSchema, 'permission')
