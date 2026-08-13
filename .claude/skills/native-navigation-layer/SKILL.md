---
name: native-navigation-layer
description: Use this skill to orchestrate native back-button behavior and screen navigation stacks in mobile environments (Capacitor/Android). Enforces precise UX rules for the passenger and admin flows, modal dismissal, and double-press app exit logic to ensure a predictable and non-frustrating user experience.
allowed_tools: [read_file]
examples:
   - input: "Handle native back button on the Gateway/Entry screen"
     output: "App.addListener('backButton', () => { moveAppToBackground(); });"
---

# Native Navigation & Back-Button Architecture (UX/Nav)
*Objective:* Control the native navigation ecosystem to ensure the hardware/gesture back-button mirrors the user's cognitive model. This layer prevents accidental app exits, eliminates navigation loops, and elegantly handles the two distinct flows in this app: the unauthenticated passenger flow and the authenticated admin flow.

**Key Focus Areas:**
- *Stack Hygiene:* Ensuring strict linear tracking and stripping historical screens (like the Admin Login modal) from the history stack once passed.

- *Double-Press to Exit:* Intercepting the root back-button event to show user feedback before sending the app to the background.

- *Modal Dismissal:* Back-button on an open modal (Passenger Registration, Manual Assign/Swap-Move, Admin Login) closes the modal — it never navigates the underlying page.

- *Context-Aware Back Behavior:* Dynamic evaluation of the user's current route and authentication status (admin logged in or not — passengers are never authenticated, see `.rule/glossary.md`) before executing navigation.

## Core Principles

### 1. Root & Base Horizon
- *Gateway Horizon:* The Gateway/Entry screen (`/gateway`) is the app's true root for the passenger flow. Pressing the native back button from Gateway must immediately trigger app closure/exit (after the double-press confirmation — see §3).

- *Admin Dashboard Horizon:* Once an admin is logged in, `/admin/dashboard` is the primary functional root for that session. Pressing back from the dashboard must never navigate backward through tab history; instead, it must invoke `Move App to Background` (with double-press confirmation).

- *Passenger Browsing Horizon:* From the passenger tour/bus browsing screens (`/tour/:tourId`, `/tour/:tourId/buses/:busId`), back button steps back one level (bus → tour list → Gateway) — standard linear history, not a guarded root.

### 2. Modal & Sub-View Orchestration
- *Modal-First Dismissal:* Any open modal (Passenger Registration modal, Manual Assign/Swap-Move modal, Admin Login modal) must intercept the back-button event and close itself first — it must never fall through to navigate the page underneath. This is the most common navigation interaction in this app, since both the passenger seat-request flow and most admin seat actions happen inside modals rather than dedicated routes.

- *Admin Dashboard Tabs:* Switching tabs within the Admin Dashboard (Seat Management / Tour & Bus Management / Manifest Report) must NOT push new history entries — back button from any tab returns to the dashboard's `Move App to Background` behavior (§1), not to a previously-viewed tab.

- *Seat Map Sub-Selection:* Selecting a seat (opening the registration modal, or an admin action modal) is a modal overlay, not a route change — back-button closes the modal and returns to the seat map exactly as it was, with no data loss on the in-progress seat map view.

### 3. Double-Press Exit (Root Screens Only)
- *Toast Feedback Interception:* The first back-button press on a root screen (Gateway for passengers, Admin Dashboard for a logged-in admin) must show a non-modal Toast: "לחץ שוב ליציאה" ("Press again to exit").

- *Double-Press Background Escape:* If the user presses the native back button a second time within a 2-second threshold on a root screen, the app must gracefully execute `Move App to Background`.

- *The "Do Nothing" Prohibition:* Never ignore a native back-button press completely without visual feedback — a suppressed press with no toast/response creates a frozen UI perception.

### 4. Authentication-Driven Branching
- *Admin logged in:* Back button from `/admin/dashboard` → root behavior (§1/§3). Back button from any admin sub-modal → close the modal, stay on the dashboard.
- *Admin logged out (or session expired via a `401`):* Back button from `/admin/login` → passenger Gateway (`/gateway`), not app exit — the admin can still back out to the passenger side of the app rather than being stuck.
- *Passenger (always unauthenticated):* No auth branching needed — passenger navigation is purely route-based (§1) plus modal dismissal (§2). There is no "incomplete registration" or partially-authenticated state to guard, since a passenger's seat request either hasn't been submitted yet (still on the seat map) or has (shows as `pending` — no locked intermediate UI state to protect against back-navigation).

### 5. Memory Stack Safety
- *Destructive Navigation:* When an admin successfully logs in, `replace`/stack-reset the `/admin/login` route out of history so the back button from `/admin/dashboard` never returns to the login screen.
- *Post-Booking:* After a passenger's seat request is submitted (seat now `pending`), do not push a separate "confirmation" route that could be navigated back into inconsistently — the registration modal simply closes and the seat map reflects the new `pending` status in place.

## Implementation Checklist
- [ ] Root views (Gateway, Admin Dashboard) handle exit/background routines instead of standard history popping.

- [ ] All modals (Passenger Registration, Manual Assign/Swap-Move, Admin Login) intercept and consume the back-button event before it reaches page-level navigation.

- [ ] Admin Dashboard tab switches do not create additional back-button history entries.

- [ ] Root screens implement the Double-Press to Background sequence with a localized Toast warning.

- [ ] The Admin Login route is wiped from history (`replace`) upon successful login.

- [ ] Back-button behavior is checked against admin auth state (`loggedinAdmin` present or not) wherever the two flows could diverge.