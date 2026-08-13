---
name: page-layer-skill
description: Strict architectural guidelines for the Page Layer. Defines the responsibilities of "Smart Components" including API orchestration, authorization guards, and state management.
references:
  - @ui-component-layer/SKILL.md
  - @service-layer/SKILL.md
  - @state-management-layer/SKILL.md
---

# Page Layer Responsibilities
1. **Authorization & Guards**
- *Admin pages only:* Every **admin** page (`/admin/dashboard` and its tabs) must verify the `loggedinAdmin` state from the store. Unauthorized access must trigger an immediate redirect to `/admin/login`.
- *Passenger pages have no guard:* Gateway (`/gateway`) and passenger tour/bus/seat-map pages (`/tour/:tourId`, `/tour/:tourId/buses/:busId`) require no auth check at all — passengers are never authenticated (see `.rule/glossary.md`). Do not add a `loggedinAdmin`/`loggedinUser` check to these pages.
- There are no `isLock`/`isComingSoon` feature-flag checks in this app — every feature described in `docs/PRD.md` is available at launch; don't build speculative gating for features that don't exist.

2. **Data Orchestration (The "Smart" Hub)**
- *Centralized Fetching:* Primary API calls occur at the Page level. Child components should receive "finished" data as props.
- *Async Strategy:*
  - Use `useEffect` for initial mounting fetches.
  - For the bus seat-map page specifically, fetch the bus (layout + pickup points) first, then the current seat statuses — treat these as two phases so the seat grid can render its structure before individual seat colors/icons arrive.
- *Loading UI:* The Page controls global loading states (Overlays/Skeletons) via `app.slice`. The live seat map itself is owned by `seat.slice.ts` (see `@state-management-layer/SKILL.md`), not by page-local state.

3. **Event & Logic Handling**
- *Action Controller:* Define event handlers (e.g., `handleApprove`, `handleSeatSelect`, `handleCancelSeat`) within the Page and pass them down.
- *Computed State:* Perform data transformations (filtering, sorting, aggregations — e.g. the manifest report's pickup-point grouping) before rendering children to keep child components "dumb" and presentational.
- *Navigation:* All `react-router` logic (`useNavigate`, `useParams`) resides exclusively in the Page layer.
- *Seat Conflicts:* On a `409` from any seat action, the page-level handler re-syncs `seat.slice.ts` from the response and shows a clear, hardcoded Hebrew message (e.g. "המושב הזה נתפס הרגע — בחר/י אחר") — see `.rule/error-handling-rules.md`. There is no `getPhrase`/remote-phrase system in this app.

4. **Layout & Accessibility**
- *RTL Integrity:* Every page root must have `dir="rtl"` and proper text alignment — **except** the seat-map component itself, which stays `dir="ltr"` (see `@ui-component-layer/SKILL.md`, seat map exception).
- *Responsive Shell:* Use a standardized container: `max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10`.
- *Standard Components:* Every Page must utilize `ScreenHeader` for consistent titling, with the title/subtitle passed as plain, hardcoded Hebrew strings (no `PhraseService`/`getPhrase` — this app has no remote-config/phrase layer, see `@ui-component-layer/SKILL.md`).

# Implementation Pattern
```typescript
// AdminDashboardPage.tsx — example of an admin-guarded page
const AdminDashboardPage = () => {
  // 1. Hooks & Store
  const navigate = useNavigate()
  const loggedinAdmin = useStore((state) => state.loggedinAdmin)
  const { data, isLoading, refresh } = useFetchTours()

  // 2. Guard
  if (!loggedinAdmin) return <Navigate to="/admin/login" />

  // 3. Logic
  const handleAction = async (payload) => {
    await tourService.save(payload)
    refresh()
  }

  // 4. Render
  return (
    <main dir="rtl" className="page-container animate-in fade-in">
      <ScreenHeader
        title="ניהול טיולים"
        subtitle="צור, ערוך ונהל את הטיולים והאוטובוסים שלך"
      />

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <PresentationalComponent
          items={data}
          onAction={handleAction}
        />
      )}
    </main>
  )
}
```

```typescript
// BusSeatMapPage.tsx — example of an unguarded passenger page
const BusSeatMapPage = () => {
  const { tourId, busId } = useParams()
  const { bus, isLoading } = useFetchBus(tourId, busId)
  const seats = useStore((state) => state.seats) // seat.slice.ts is the source of truth

  const handleSeatRequest = async (seatId: string, passengerInfo: PassengerInfo) => {
    try {
      await seatService.bookings(tourId, busId, seatId, passengerInfo)
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error('המושב הזה נתפס הרגע — בחר/י אחר')
        refreshSeats() // re-sync seat.slice.ts from the server
      } else {
        toast.error('משהו השתבש, נסה שוב')
      }
    }
  }

  return (
    <main dir="rtl" className="page-container">
      <ScreenHeader title="בחירת מושב" />
      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <SeatMap seats={seats} onSeatSelect={handleSeatRequest} /> {/* renders dir="ltr" internally */}
      )}
    </main>
  )
}
```

# Business Rules
- *Naming:* Files must use `PascalCase` and end with `Page.tsx` (e.g., `AdminDashboardPage.tsx`, `BusSeatMapPage.tsx`, `GatewayPage.tsx`).

- *No Direct CSS:* All styling must be handled via Tailwind classes or the `cn` utility.

- *Separation of Concerns:* A Page should never contain complex UI internals (like SVG paths, the seat-grid markup, or raw HTML tables); these belong in the `ui-component-layer`.