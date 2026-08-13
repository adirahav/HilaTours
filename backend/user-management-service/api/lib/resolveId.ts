import { Model, Types } from 'mongoose'

/**
 * Client-supplied ids are public uuids — never Mongo `_id`s. These helpers are
 * the single place a uuid is translated into the internal ObjectId used for
 * queries and cross-collection refs.
 */

function notFound(label: string): Error & { status: number } {
  return Object.assign(new Error(`${label} not found`), { status: 404 })
}

export async function resolveObjectId(
  model: Model<any>,
  uuid: unknown,
  label = model.modelName
): Promise<Types.ObjectId> {
  if (typeof uuid !== 'string' || !uuid) throw notFound(label)
  const doc = await model.findOne({ uuid }).select('_id').lean<{ _id: Types.ObjectId }>()
  if (!doc) throw notFound(label)
  return doc._id
}

export async function resolveObjectIds(
  model: Model<any>,
  uuids: unknown,
  label = model.modelName
): Promise<Types.ObjectId[]> {
  if (!Array.isArray(uuids)) throw notFound(label)
  const clean = uuids.filter((u): u is string => typeof u === 'string' && !!u)
  if (clean.length !== uuids.length) throw notFound(label)

  const docs = await model
    .find({ uuid: { $in: clean } })
    .select('_id uuid')
    .lean<{ _id: Types.ObjectId; uuid: string }[]>()

  const byUuid = new Map(docs.map((d) => [d.uuid, d._id]))
  return clean.map((u) => {
    const id = byUuid.get(u)
    if (!id) throw notFound(label)
    return id
  })
}
