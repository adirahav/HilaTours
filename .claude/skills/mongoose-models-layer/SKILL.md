---
name: mongoose-models-layer
description: Use this skill when defining, extending, or querying any Mongoose model in either backend microservice. Covers schema definitions, the soft-delete pattern, required indexes, and sensitive-field stripping — the DB-side counterpart to state-management-layer's frontend rules.
references:
  - @.rule/database-rules.md
  - @.rule/naming-rules.md
  - @backend-service-layer/SKILL.md
  - @seat-concurrency-layer/SKILL.md
---

# Mongoose Models Layer
*Goal:* Keep every collection's shape, soft-delete behavior, and indexing consistent across both services, so no query anywhere in the codebase has to "remember" a rule that should be enforced by the schema itself.

**Core Principle:** A rule that must be repeated in every service function is a rule that will eventually be forgotten in one of them. Push soft-delete filtering, sensitive-field stripping, and enum validation into the schema — not into the callers.

## Which Models Live Where
- **`user-management-service`** owns `Admin` only.
- **`tour-service`** owns `Tour`, `Bus`, `Seat`.
- Neither service ever imports or queries the other's models directly — cross-service data needs (e.g. `Tour.createdBy` referencing an `Admin._id`) are stored as a plain `ObjectId`, not a live cross-database `ref` that gets populated, since the two services don't share a connection.

## Schema Definitions

```typescript
// backend/user-management-service/src/models/Admin.ts
import { Schema, model } from 'mongoose'

const adminSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
})

export const Admin = model('Admin', adminSchema)
```

```typescript
// backend/tour-service/src/models/Tour.ts
import { Schema, model } from 'mongoose'

const tourSchema = new Schema({
  name: { type: String, required: true },
  date: { type: Date, required: true },
  description: { type: String, default: null },
  createdBy: { type: Schema.Types.ObjectId, required: true }, // Admin._id — not a live ref, see above
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
})

export const Tour = model('Tour', tourSchema)
```

```typescript
// backend/tour-service/src/models/Bus.ts
import { Schema, model } from 'mongoose'

const pickupPointSchema = new Schema({
  name: { type: String, required: true },
  order: { type: Number, required: true },
}, { _id: false })

const busSchema = new Schema({
  tourId: { type: Schema.Types.ObjectId, ref: 'Tour', required: true },
  name: { type: String, required: true },
  seatLayout: { type: Schema.Types.Mixed, required: true }, // shape TBD, see .rule/database-rules.md Open Questions
  pickupPoints: { type: [pickupPointSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
})

export const Bus = model('Bus', busSchema)
```

`Seat`'s schema is covered in `@seat-concurrency-layer/SKILL.md` and `@backend-service-layer/SKILL.md` — the `status` enum and its indexes are the one part of this codebase with its own dedicated skill; don't duplicate that schema definition here.

## Soft Delete — Enforce It in the Schema, Not the Caller
`Admin`, `Tour`, and `Bus` are soft-deleted. Don't rely on every service function remembering to add `{ deletedAt: null }` — add a schema-level hook once, per model:

```typescript
// applies to Admin, Tour, and Bus schemas — add this block to each
function excludeDeleted(this: any, next: () => void) {
  const filter = this.getFilter ? this.getFilter() : this._conditions
  if (filter.deletedAt === undefined) {
    this.where({ deletedAt: null })
  }
  next()
}

tourSchema.pre('find', excludeDeleted)
tourSchema.pre('findOne', excludeDeleted)
tourSchema.pre('countDocuments', excludeDeleted)
```

- A `DELETE` route calls `findByIdAndUpdate(id, { deletedAt: new Date() })` — never `findByIdAndDelete`/`deleteOne`.
- If a service genuinely needs to see soft-deleted records (e.g. an admin "show archived" view, if ever added), query with an explicit `{ deletedAt: { $ne: null } }` or `.setOptions({ skipSoftDeleteFilter: true })` rather than removing the hook.
- `Seat` does **not** use this pattern — seats are deleted/recreated together with their parent `Bus`, not soft-deleted individually (see `.rule/database-rules.md`).

## Sensitive Field Stripping
`Admin.passwordHash` must never be serialized into an API response. Enforce this in the schema's `toJSON`, not by remembering to `.select('-passwordHash')` on every query:

```typescript
adminSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash
    return ret
  },
})
```

## External Identity — `uuid`, never `_id`
Same principle as sensitive-field stripping, applied to identity: `_id` is an internal Mongo ObjectId used for refs and queries; it must never reach a client. Every model additionally carries a `uuid` field, which is what clients see as `id`. Add both the field and the `toJSON` transform to **every** model (`Admin`, `Tour`, `Bus`, `Seat`) — don't rely on controllers to map it per response:

```typescript
import { randomUUID } from 'crypto'

const tourSchema = new Schema({
  uuid: { type: String, default: randomUUID, unique: true, index: true },
  // ...rest of the fields
})

tourSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret.uuid
    delete ret._id
    delete ret.uuid
    delete ret.__v
    return ret
  },
})
```

Combine this with the `passwordHash` transform on `Admin` (both transforms run in the same `toJSON` function — don't register two separate ones).

**Client → server direction:** any client-supplied `id` in a URL param or request body is a `uuid`, not an ObjectId. Resolve it in the service layer (`Model.findOne({ uuid: id })`) before using it in any query or building a ref (`tourId`, `busId`, `createdBy`, `assignedBy`) — never pass a client-supplied string straight into `findById`/`_id` filters.

**Embedded/lean responses:** `.lean()` queries bypass Mongoose document methods, including `toJSON` — if a service returns a `.lean()` result directly to a controller that serializes it, the `uuid`→`id` mapping and `_id` stripping must be done explicitly in the service (a small `toPublic()`/`mapSeat()`-style helper), not assumed to happen automatically.

## Required Indexes
| Model | Index | Why |
|---|---|---|
| `Admin` | unique `email` | login lookup + duplicate-signup prevention |
| `Admin` | unique `username` | duplicate-signup prevention |
| `Tour` | `createdBy` | admin's own tours (if per-admin scoping is ever added) |
| `Bus` | `tourId` | list buses for a tour |
| `Seat` | unique compound `busId + position` | prevents duplicate seat positions on one bus |
| `Seat` | compound `busId + status` | fast seat-map queries filtered by status |

Define indexes directly on the schema (`schema.index({...})`), not via a separate manual `createIndex` script — so they're created automatically wherever the app connects (dev, test, prod), and they're visible next to the schema they belong to.

## Query Conventions
- Prefer `.lean()` for read-only queries that don't need Mongoose document methods — faster and avoids accidental mutation of a cached document.
- Never build a query filter from unvalidated client input directly (e.g. `Tour.find(req.body)`) — this is a NoSQL-injection vector. Only pass through fields the route explicitly expects, each validated to its expected type.
- Population (`.populate('tourId')`) is fine within `tour-service` (Bus → Tour, Seat → Bus) since they share a connection; never `.populate()` across the service boundary into `user-management-service`'s `Admin` collection — fetch admin display info via that service's API if ever needed, not a cross-DB populate.

## Testing
- Use an in-memory or dedicated test MongoDB instance (see `.rule/testing-rules.md`) — never point tests at the real Atlas cluster.
- Test the soft-delete hook itself once per model (a deleted document is excluded from `.find()`/`.findOne()` but still fetchable via an explicit override) — don't re-test it inside every unrelated service test.
- Test index uniqueness violations explicitly (e.g. creating two seats with the same `busId`+`position` should throw) rather than assuming the index exists because it's declared in code.

## Implementation Checklist
- [ ] `Admin`, `Tour`, and `Bus` schemas each have the soft-delete `pre('find'/'findOne')` hook.
- [ ] `Admin` schema strips `passwordHash` via `toJSON` transform — no query needs to remember `.select('-passwordHash')`.
- [ ] All required indexes (see table above) are declared on the schema, not created ad hoc.
- [ ] No query builds its filter directly from unvalidated `req.body`/`req.query`.
- [ ] No cross-service `.populate()` — `user-management-service` and `tour-service` never query each other's collections.
- [ ] Every model has a `uuid` field and a `toJSON` transform that maps `uuid`→`id` and deletes `_id`/`__v` — no response anywhere exposes a raw `_id`.
- [ ] Any `.lean()` result that reaches a controller directly is mapped through an explicit `uuid`→`id` helper (lean bypasses `toJSON`).
- [ ] Every controller/service that receives a client-supplied `id` resolves it via `Model.findOne({ uuid: id })` before using it in a query or ref — never treats it as a raw `_id`.