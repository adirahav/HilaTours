import mongoose, { Schema, Document, Types } from "mongoose"
import { applyUuidIdentity } from "../lib/clientShape"

export interface PickupPoint {
  name: string
  order: number
}

export interface BusDoc extends Document {
  /** Public identity (plan 028). `_id` is internal-only and never serialized. */
  uuid: string
  /** Internal ObjectId ref — serialized to clients as the tour's uuid. */
  tourId: Types.ObjectId
  name: string
  seatLayout: Record<string, unknown>
  pickupPoints: PickupPoint[]
  /**
   * True only for the bus auto-created alongside its tour (see
   * bus.service.createDefaultBus). Never settable via client input — a tour
   * must always keep at least one bus, so this one is deletion-protected
   * (bus.service.softDeleteBus rejects it).
   */
  isDefault: boolean
  createdAt: Date
  deletedAt: Date | null
}

const pickupPointSchema = new Schema<PickupPoint>(
  {
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
  },
  { _id: false },
)

const busSchema = new Schema<BusDoc>({
  tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true, index: true },
  name: { type: String, required: true },
  seatLayout: { type: Schema.Types.Mixed, required: true },
  pickupPoints: { type: [pickupPointSchema], default: [] },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
})

applyUuidIdentity(busSchema)

busSchema.pre(/^find/, function (this: any) {
  if (!("deletedAt" in this.getFilter())) {
    this.where({ deletedAt: null })
  }
})

export const Bus =
  mongoose.models.Bus || mongoose.model<BusDoc>("Bus", busSchema, "bus")
