import { Model, Types } from "mongoose"
import { HttpError } from "./http"
import { isUuid } from "./clientShape"

/**
 * uuid → `_id` resolution (plan 028).
 *
 * Clients only ever send uuids (path params, `seatIds`, `fromSeatId`...).
 * Mongo's `_id` never leaves the process, so every client-supplied id has to
 * be translated here before it can be used in a query filter.
 *
 * IMPORTANT (concurrency): resolution is a *lookup only*. Callers must still
 * apply their existing condition-checked atomic update (`findOneAndUpdate({
 * _id, status: 'available' }, ...)`). Resolving an id then mutating without
 * the status guard would reintroduce the TOCTOU race these endpoints were
 * built to avoid.
 */

/** Resolves one public uuid to its internal ObjectId, or throws 404. */
export async function resolveObjectId(
  model: Model<any>,
  uuid: unknown,
  notFoundMessage: string,
  extraFilter: Record<string, unknown> = {},
): Promise<Types.ObjectId> {
  if (!isUuid(uuid)) throw new HttpError(404, notFoundMessage)
  const doc = await model.findOne({ uuid, ...extraFilter }).select("_id").lean()
  if (!doc) throw new HttpError(404, notFoundMessage)
  return (doc as any)._id as Types.ObjectId
}

/** Resolves one public uuid to the full (lean) document, or throws 404. */
export async function resolveDoc(
  model: Model<any>,
  uuid: unknown,
  notFoundMessage: string,
  extraFilter: Record<string, unknown> = {},
): Promise<Record<string, any>> {
  if (!isUuid(uuid)) throw new HttpError(404, notFoundMessage)
  const doc = await model.findOne({ uuid, ...extraFilter }).lean()
  if (!doc) throw new HttpError(404, notFoundMessage)
  return doc as Record<string, any>
}

/**
 * Resolves a list of public uuids to internal ObjectIds, preserving the
 * caller's order (seat endpoints report per-seat errors by index/id).
 * Throws 400 on a malformed uuid and 404 when one doesn't resolve.
 */
export async function resolveObjectIds(
  model: Model<any>,
  uuids: unknown,
  invalidMessage: string,
  notFoundMessage: string,
  extraFilter: Record<string, unknown> = {},
): Promise<Types.ObjectId[]> {
  if (!Array.isArray(uuids) || uuids.length === 0) {
    throw new HttpError(400, invalidMessage)
  }
  const clean = uuids.map(String)
  if (clean.some((u) => !isUuid(u))) throw new HttpError(400, invalidMessage)

  const docs = await model
    .find({ uuid: { $in: clean }, ...extraFilter })
    .select("_id uuid")
    .lean()
  const byUuid = new Map(docs.map((d: any) => [d.uuid as string, d._id as Types.ObjectId]))

  return clean.map((u) => {
    const id = byUuid.get(u)
    if (!id) throw new HttpError(404, notFoundMessage)
    return id
  })
}
