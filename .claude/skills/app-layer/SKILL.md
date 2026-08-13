---
name: app-layer
description: The root orchestrator of the application. Manages global lifecycle, authentication hydration, and top-level UI components like Toasts (sonner) and Modals.
references:
  - @docs/api-contract/api-contract.user-management-service.yaml
  - @state-management-layer/SKILL.md
---

# Requirements (Core Logic)

1. **Authentication Hydration (admin session only):**
   - Hila Tours has exactly one authenticated role — the admin. Passengers are never authenticated (no login/signup; see `.rule/glossary.md`), so there is no passenger session to hydrate.
   - Hydration Flow:
      - On mount: read the admin token from storage (`localStorage` on web, `@capacitor/preferences` on Android — see `.rule/coding-rules.md`) via `auth.service.ts`.
      - Splash State: while `isHydrating`, show `SplashLoader`.
      - Post-Hydration: if a valid token exists, populate `loggedinAdmin` in the store; otherwise the app proceeds unauthenticated (fine for all passenger-facing screens).
   - There is no onboarding/consent/multi-step signup funnel — an admin either has valid credentials and logs in, or doesn't. Do not build a step-gated hydration flow.

2. **Global Component Hosting:**
   - Render the sonner `Toaster` and `Modal` components at the root.
   - Manage the visibility state of global Modals (e.g., Session Expired, Admin Login).

3. **Routing Strategy (Auth Guard):**
   - **Public Routes (no auth required):** `/`, `/gateway` (entry/routing screen), `/tour/:tourId` (passenger tour+bus browsing), `/tour/:tourId/buses/:busId` (passenger seat map + registration modal), `/admin/login`.
   - **Private Routes (admin-only):** `/admin/dashboard` (tabbed: Seat Management, Tour & Bus Management, Manifest Report — see `docs/PRD.md`).
   - Guard Logic:
      - Auth Check: if `!loggedinAdmin` and route is private ⮕ redirect to `/admin/login`.
      - No onboarding/funnel check exists for either role — this app has no multi-step account setup.

4. **Global Layout Wrapper:**
   - Manage the main viewport container (e.g., `min-h-screen`, `bg-slate-50`).
   - Handle RTL/LTR directionality at the HTML level (Hebrew RTL is the primary experience — see `docs/PRD.md`).

5. **Admin Route Guard Implementation:**
   - Create a wrapper component `ProtectedRoute` (per `.rule/naming-rules.md`) for the `/admin/dashboard` route.
   - Inside the guard:
      - Get `loggedinAdmin` from the store.
      - If absent, redirect to `/admin/login`.
      - No further step-gating is needed beyond this single check.

6. **Version Governance & Upgrade Orchestration**
   - **Not currently in scope for Hila Tours** — no version-check or mandatory/recommended-upgrade UI is defined in `docs/PRD.md` or `docs/product-definition.md`. Do not build `UpgradeRequired`/`UpgradeRecommended` components speculatively.
   - If this becomes a real requirement later (e.g. once the native Android build ships and needs forced-update support), it should be scoped explicitly in `docs/product-definition.md` first, following the same `Major/Minor/Patch` comparison approach as prior projects, before being added here.

# Tailwind Implementation Logic
- *Root Container:* `relative w-full min-h-screen overflow-x-hidden selection:bg-blue-100`.
- *Overlay Layer:* High `z-index` (e.g., `z-[9999]`) for the sonner `Toaster` container.
- *Modal Layer:* Admin login modal and any confirmation modals (e.g. delete-tour confirmation) sit below the Toaster but above all page content.

# Files Structure
HILA-TOURS/
└── frontend/
    └── src/
    │   ├── App.tsx                 # Main Logic & Routing
    │   ├── AppProviders.tsx        # Context/Store Providers
    │   └── main.tsx                # Entry point