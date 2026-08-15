import { Tour } from "../models/tour.model"
import { Bus } from "../models/bus.model"
import { Seat } from "../models/seat.model"
import { listBusesWithPublicSeats, createDefaultBus } from "../bus/bus.service"
import { HttpError } from "../lib/http"
import { toClientTour } from "../lib/clientShape"
import { resolveDoc } from "../lib/resolveId"

export interface TourInput {
  name?: string
  date?: string | Date
  description?: string
}

/**
 * `:tourId` is the tour's public uuid (plan 028). Everything below resolves it
 * to the internal `_id` before touching Mongo, and every value returned goes
 * through `toClientTour`, which projects `uuid` as `id` and drops `_id`.
 */
async function tourByUuid(tourUuid: string, message = "Tour not found") {
  return resolveDoc(Tour, tourUuid, message, { deletedAt: null })
}

// GET /tour and GET /tour/:tourId are public (unauthenticated) — passengers
// need them pre-login. Buses/seats are therefore embedded using the shared
// PII-safe projection from bus.service, never the full Seat document.
export async function listTours() {
  const tours = await Tour.find({ deletedAt: null }).sort({ date: 1 }).lean()
  return Promise.all(
    tours.map(async (tour: any) => ({
      ...toClientTour(tour),
      buses: await listBusesWithPublicSeats(tour._id, tour.uuid),
    })),
  )
}

export async function getTour(tourUuid: string) {
  const tour = await tourByUuid(tourUuid)
  return {
    ...toClientTour(tour),
    buses: await listBusesWithPublicSeats(tour._id, tour.uuid),
  }
}

export async function createTour(input: TourInput, adminUuid: string) {
  if (!input.name || !input.date) {
    throw new HttpError(400, "name and date are required")
  }
  const tour = await Tour.create({
    name: input.name,
    date: new Date(input.date),
    description: input.description ?? null,
    // Admin uuid from the JWT `sub`/`id` claim — internal attribution only.
    createdBy: adminUuid,
  })
  // A tour is never left with zero buses — see bus.service.createDefaultBus.
  await createDefaultBus(tour._id)
  return toClientTour(tour.toObject())
}

export async function updateTour(tourUuid: string, input: TourInput) {
  const existing = await tourByUuid(tourUuid)

  const update: Record<string, unknown> = {}
  if (input.name !== undefined) update.name = input.name
  if (input.date !== undefined) update.date = new Date(input.date)
  if (input.description !== undefined) update.description = input.description

  const tour = await Tour.findOneAndUpdate(
    { _id: existing._id, deletedAt: null },
    { $set: update },
    { returnDocument: "after" },
  ).lean()
  if (!tour) throw new HttpError(404, "Tour not found")
  return toClientTour(tour)
}

export async function softDeleteTour(tourUuid: string) {
  const message = "Tour not found or already deleted"
  const existing = await tourByUuid(tourUuid, message)

  const now = new Date()
  const tour = await Tour.findOneAndUpdate(
    { _id: existing._id, deletedAt: null },
    { $set: { deletedAt: now } },
    { returnDocument: "after" },
  ).lean()
  if (!tour) throw new HttpError(404, message)

  // Cascade soft-delete to buses and their seats — nothing here is hard-deleted.
  const buses = await Bus.find({ tourId: existing._id, deletedAt: null }).select("_id").lean()
  const busIds = buses.map((b: any) => b._id)
  if (busIds.length) {
    await Bus.updateMany({ _id: { $in: busIds } }, { $set: { deletedAt: now } })
    await Seat.updateMany({ busId: { $in: busIds }, deletedAt: null }, { $set: { deletedAt: now } })
  }
  return toClientTour(tour)
}
