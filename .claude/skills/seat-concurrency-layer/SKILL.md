---
name: seat-concurrency-layer
description: Use this skill whenever writing, reviewing, or testing any code that changes a Seat's status in tour-service (bookings, approve, cancel, toggle-reserve, manual-assign, swap-move). This is the single highest-risk area in the Hila Tours codebase — two passengers or an admin action racing on the same seat must never both succeed.
references:
  - @backend-service-layer/SKILL.md
  - @.rule/database-rules.md
  - @.rule/testing-rules.md
  - @agents/security/CLAUDE.md
---

# Seat Concurrency Layer
*Goal:* Guarantee that a seat can never be claimed by two passengers/actions at once, no matter how close together the requests arrive — without resorting to locks, queues, or anything that would make the seat map feel slow or unresponsive.

**Why this exists as its own skill, not just a note in `backend-service-layer`:** every other bug in this app is inconvenient. A double-booked seat is the one bug that reaches a real person standing at a real bus door. It gets its own skill because it deserves a slower, more deliberate pass than "remember to use `findOneAndUpdate`."

## The Core Guarantee
For any two operations that target the same seat at nearly the same instant, **exactly one must succeed and the other must receive a `409`.** Never both-succeed (double-booking), never both-fail (a seat stuck in limbo), never a lost update (one action silently overwriting the other with no error).

## Why Read-Then-Write Fails
```typescript
// This looks correct. It is not.
async function requestSeatBROKEN(seatId: string, passengerInfo: PassengerInfo) {
  const seat = await Seat.findById(seatId)           // Request A reads: status = 'available'
                                                       // Request B reads: status = 'available'  ← both see the same state
  if (seat.status !== 'available') {
    throw new ConflictError('Seat is no longer available')
  }
  seat.status = 'pending'                             // Request A writes: status = 'pending'
  seat.passengerName = passengerInfo.passengerName
  await seat.save()                                   // Request B writes: status = 'pending', overwriting A's passenger info
  return seat                                          // Both calls return success. Both passengers think they got the seat.
}
```
The failure mode isn't exotic — it's two HTTP requests arriving within a few milliseconds of each other, which happens constantly the moment a bus fills up and multiple people tap the same visually-available seat.

## The Fix: One Atomic Operation, Not Two
The check and the write must happen as a single database operation the DB itself makes atomic — never two round-trips from the application.

```typescript
// Correct — the database, not the application, decides who wins the race
async function requestSeat(seatId: string, passengerInfo: PassengerInfo) {
  const seat = await Seat.findOneAndUpdate(
    { _id: seatId, status: 'available' },   // the condition is part of the same atomic operation as the write
    {
      $set: {
        status: 'pending',
        passengerName: passengerInfo.passengerName,
        passengerPhone: passengerInfo.passengerPhone,
        pickupPointName: passengerInfo.pickupPointName,
        requestedAt: new Date(),
      },
    },
    { new: true }
  )

  if (!seat) {
    // findOneAndUpdate returned null: the condition { status: 'available' } didn't match
    // at the instant MongoDB evaluated it — someone else got there first.
    throw new ConflictError('Seat is no longer available')
  }

  return seat
}
```
`findOneAndUpdate` (and `updateOne`, `findOneAndReplace`) are atomic **per document** in MongoDB — the filter and the update are evaluated as one indivisible operation. That's the entire mechanism. No manual locking, no `LockService`, no queue needed for the single-seat case.

## Per-Action Rules

| Action | Transition | Atomic filter |
|---|---|---|
| `bookings` (public) | `available → pending` | `{ _id, status: 'available' }` |
| `approve` (admin) | `pending → taken` | `{ _id, status: 'pending' }` |
| `cancel` (admin) | `pending`/`taken` → `available` | `{ _id, status: { $in: ['pending', 'taken'] } }` |
| `toggle-reserve` (admin) | `available ⇄ reserved` | `{ _id, status: 'available' }` or `{ _id, status: 'reserved' }` depending on direction |
| `manual-assign` (admin) | `available → taken` | `{ _id, status: 'available' }` |

Every row above is a single `findOneAndUpdate` — if it returns `null`, the controller returns `409`. There is no case in this table where reading first and writing second is acceptable, regardless of whether the caller is a passenger or an admin. Admin actions racing each other (two admins both clicking "approve" on the same request) are just as real a race as two passengers.

## The One Multi-Document Case: `swap-move`
`swap-move` is the exception — it changes **two** seats (move a passenger from seat X to seat Y, or exchange two occupants), and MongoDB's single-document atomicity doesn't cover two documents at once. Two options, in order of preference:

1. **MongoDB transaction** (if the Atlas tier/replica-set config supports it): wrap both `findOneAndUpdate` calls in a `session`, and abort the transaction if either update's precondition fails.
   ```typescript
   const session = await mongoose.startSession()
   try {
     await session.withTransaction(async () => {
       const fromSeat = await Seat.findOneAndUpdate(
         { _id: fromSeatId, status: { $in: ['pending', 'taken'] } },
         { $set: { status: 'available', passengerName: null, passengerPhone: null } },
         { session, new: true }
       )
       if (!fromSeat) throw new ConflictError('Source seat is not currently occupied')

       const toSeat = await Seat.findOneAndUpdate(
         { _id: toSeatId, status: 'available' },
         { $set: { status: fromSeat.status /* pending or taken, whichever it was */, passengerName: fromSeat.passengerName, passengerPhone: fromSeat.passengerPhone } },
         { session, new: true }
       )
       if (!toSeat) throw new ConflictError('Destination seat is no longer available')
     })
   } finally {
     await session.endSession()
   }
   ```
2. **Manual compensation** (if transactions aren't available on the deployment tier): perform the first atomic update, and if the second one fails its precondition, atomically revert the first before returning `409` — never leave the source seat in a "already vacated but destination also failed" state.

Never implement `swap-move` as two independent `findOneAndUpdate` calls with no rollback path — a failure on the second call after the first succeeded is a silent data-loss bug (a passenger disappears from both seats).

## What NOT to Reach For
- **Application-level locks / mutexes / `LockService`-style patterns:** unnecessary complexity for this problem — MongoDB's per-document atomicity already solves the single-seat case. Reserve locking patterns (from prior projects like the bus-seat Google Sheets tool) for contexts without a real atomic-update primitive; this isn't that context.
- **Optimistic-locking version fields (`__v` checks) as the *primary* mechanism:** Mongoose's built-in versioning can coexist, but the `findOneAndUpdate` status-filter above is sufficient on its own and simpler to reason about. Don't add a second concurrency mechanism on top "just in case."
- **Retrying a failed `409` automatically:** never auto-retry a seat request that got a `409` — that's the passenger's decision (pick a different seat), not something to paper over silently.

## Testing This Layer
This is the one part of the codebase where "the code compiles and a sequential test passes" is explicitly not sufficient evidence of correctness (see `.rule/testing-rules.md`).

```typescript
// The test that actually proves the guarantee — genuinely concurrent, not sequential
it('allows exactly one of two simultaneous requests for the same seat', async () => {
  const seat = await buildSeat({ status: 'available' })

  const [resultA, resultB] = await Promise.allSettled([
    request(app).post(`/api/tour/${tourId}/buses/${busId}/seats/bookings`).send({ seatIds: [seat.id], ...passengerA }),
    request(app).post(`/api/tour/${tourId}/buses/${busId}/seats/bookings`).send({ seatIds: [seat.id], ...passengerB }),
  ])

  const statuses = [resultA, resultB].map((r) => r.value?.status ?? r.reason)
  expect(statuses.filter((s) => s === 200)).toHaveLength(1)
  expect(statuses.filter((s) => s === 409)).toHaveLength(1)

  const finalSeat = await Seat.findById(seat.id)
  expect(finalSeat.status).toBe('pending') // exactly one passenger's info made it in
})
```
A test that `await`s the two requests one after another (`await postA(); await postB()`) proves nothing about the race — it proves sequential correctness, which was never in question. Use `Promise.all`/`Promise.allSettled` to actually fire them together.

## Implementation Checklist
- [ ] Every single-seat status transition is one `findOneAndUpdate` with the precondition in the filter — never a separate `findById` + `save()`.
- [ ] `swap-move` uses a transaction or an explicit compensating-rollback path — never two unguarded independent updates.
- [ ] No endpoint accepts a `status`/`seatStatus` field from the request body — the endpoint alone determines the resulting status.
- [ ] A genuinely concurrent test (`Promise.all`, not sequential `await`s) exists for every action in the Per-Action Rules table above.
- [ ] `409` is returned (not `400`/`500`) whenever a status precondition fails.
- [ ] No application-level lock/mutex/queue has been introduced for the single-seat case — if one is present, it's almost certainly unnecessary complexity worth removing.