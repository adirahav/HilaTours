import mongoose, { Schema, Document } from "mongoose"
import { applyUuidIdentity } from "../lib/clientShape"

export interface TourDoc extends Document {
  /** Public identity (plan 028). `_id` is internal-only and never serialized. */
  uuid: string
  name: string
  date: Date
  description: string | null
  createdBy: string
  createdAt: Date
  deletedAt: Date | null
}

const tourSchema = new Schema<TourDoc>({
  name: { type: String, required: true },
  date: { type: Date, required: true },
  description: { type: String, default: null },
  // Admin attribution. Stored as the admin's *uuid* string, not an ObjectId
  // ref: Admin lives in user-management-service, so tour-service has no local
  // collection to resolve a uuid against (plan 028 step 4 design fork).
  // Never serialized to clients.
  createdBy: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
})

applyUuidIdentity(tourSchema)

// Exclude soft-deleted docs unless the query explicitly asks for them.
tourSchema.pre(/^find/, function (this: any) {
  if (!("deletedAt" in this.getFilter())) {
    this.where({ deletedAt: null })
  }
})

export const Tour =
  mongoose.models.Tour || mongoose.model<TourDoc>("Tour", tourSchema, "tour")
