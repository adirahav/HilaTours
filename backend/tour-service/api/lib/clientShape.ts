import { randomUUID } from "crypto"
import { Schema } from "mongoose"

/**
 * UUID identity layer (plan 028).
 *
 * Every persisted entity carries a server-generated `uuid` that is its ONLY
 * public identity. Mongo's `_id` stays internal — it remains the primary key
 * and the value stored in cross-collection refs (`Bus.tourId`, `Seat.busId`) —
 * and is never serialized to a client, exactly like `Admin.passwordHash` is
 * never serialized by user-management-service.
 *
 * Two layers enforce this:
 *  1. `applyUuidIdentity(schema)` below installs the `uuid` path plus a
 *     `toJSON` transform, so a Mongoose document accidentally handed to
 *     `res.json()` still comes out as `{ id, ... }` with `_id`/`__v`/`uuid`
 *     stripped. This is the safety net.
 *  2. The `toClient*` mappers below, which every service uses explicitly.
 *     Most queries use `.lean()`, which bypasses Mongoose transforms
 *     entirely, so the mappers — not the transform — are the real contract.
 */

/** Generates the public identity for a new document. */
export const newUuid = (): string => randomUUID()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value)
}

/**
 * Adds the `uuid` path and the client-facing `toJSON` transform to a schema.
 * `unique: true` already creates the index, so no separate `index: true`
 * (that would make Mongoose build the same index twice).
 */
export function applyUuidIdentity(schema: Schema, stripExtra: string[] = []): void {
  schema.add({
    uuid: { type: String, required: true, unique: true, default: newUuid },
  })

  const strip = ["_id", "__v", "uuid", ...stripExtra]
  schema.set("toJSON", {
    virtuals: false,
    transform(_doc: unknown, ret: Record<string, any>) {
      ret.id = ret.uuid
      for (const field of strip) delete ret[field]
      return ret
    },
  })
}

/** Tour as seen by a client. `createdBy` is internal admin attribution. */
export function toClientTour(tour: Record<string, any>) {
  return {
    id: tour.uuid,
    name: tour.name,
    date: tour.date,
    description: tour.description ?? null,
    createdAt: tour.createdAt,
    deletedAt: tour.deletedAt ?? null,
  }
}

/**
 * Bus as seen by a client. `tourId` is serialized as the owning tour's uuid,
 * never the internal ObjectId ref — pass it in from the resolved tour.
 *
 * `busTypeGrid` (plan 037) is the LIVE join to the bus's BusType template,
 * resolved by the caller (`busType.service.busTypeGridForBus`) and passed in
 * here. It carries the real row/col of every seat, gaps included, so the client
 * never has to reconstruct a grid from the flat seat count — which is what lost
 * mid-row gaps in the first place. `null` for a manually-configured bus, which
 * keeps rendering via the client's generic fallback layout.
 *
 * Structural only (row/col/dimensions) — no passenger data — so it is safe on
 * the unauthenticated tour responses as well (SEV-001).
 */
export function toClientBus(
  bus: Record<string, any>,
  tourUuid?: string,
  busTypeGrid: Record<string, any> | null = null,
) {
  return {
    id: bus.uuid,
    ...(tourUuid ? { tourId: tourUuid } : {}),
    name: bus.name,
    seatLayout: bus.seatLayout,
    busTypeId: busTypeGrid?.busTypeId ?? null,
    busTypeGrid,
    pickupPoints: (bus.pickupPoints ?? []).map((p: any) => ({ name: p.name, order: p.order })),
    isDefault: bus.isDefault ?? false,
    createdAt: bus.createdAt,
    deletedAt: bus.deletedAt ?? null,
  }
}

/**
 * BusType template as seen by a client. `totalSeats` is always the
 * server-derived value stored on the document — a client-supplied count is
 * never persisted, so it can never leak back out here.
 */
export function toClientBusType(busType: Record<string, any>) {
  return {
    id: busType.uuid,
    name: busType.name,
    description: busType.description ?? null,
    totalSeats: busType.totalSeats,
    standardRowsCount: busType.standardRowsCount,
    doorRow: busType.doorRow ?? null,
    backRowSeatsCount: busType.backRowSeatsCount,
    disabledSeatSlots: busType.disabledSeatSlots ?? [],
    isDefault: busType.isDefault ?? false,
    createdAt: busType.createdAt,
    deletedAt: busType.deletedAt ?? null,
  }
}

/**
 * Full seat record — PII included, so only ever returned from
 * admin-authenticated routes (SEV-001). `busId` is the owning bus's uuid.
 * `assignedBy` is internal admin attribution and is deliberately withheld.
 */
export function toClientSeat(seat: Record<string, any>, busUuid?: string) {
  return {
    id: seat.uuid,
    ...(busUuid ? { busId: busUuid } : {}),
    position: seat.position,
    status: seat.status,
    pickupPointName: seat.pickupPointName ?? null,
    passengerName: seat.passengerName ?? null,
    passengerPhone: seat.passengerPhone ?? null,
    notes: seat.notes ?? null,
    requestedAt: seat.requestedAt ?? null,
    approvedAt: seat.approvedAt ?? null,
    updatedAt: seat.updatedAt,
  }
}

/**
 * PII-safe seat projection for UNAUTHENTICATED responses (SEV-001 / the
 * PublicSeat contract schema). Identity + position + status only — never
 * passengerName, passengerPhone, notes, pickupPointName, requestedAt,
 * approvedAt or assignedBy. This is the single definition of "public seat".
 */
export function toPublicSeat(seat: Record<string, any>) {
  return { id: seat.uuid, position: seat.position, status: seat.status }
}
