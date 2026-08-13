---
name: ui-component-layer
description: Governs the architecture, styling, and logic of all React components. Ensures atomic design, strict RTL support, and consistent handling of all UI copy.
references:
  - @css-layer/SKILL.md
allowed_tools: [read_file, write_file, list_dir]
---

# Mandatory Workflow
1. **Blueprint & Skill Alignment:** Before coding, the agent MUST read the specific component SKILL (e.g., a `logo-component.md` if one exists) and its blueprint.
2. **Copy Handling:** Hila Tours has no remote-config/phrase layer (no Splash/`getPhrase` system) — the app is Hebrew-only for v1 (see `docs/product-definition.md`, Out of Scope). UI strings are written directly in JSX as plain Hebrew text. Do not invoke `getPhrase`/`getParam`/`useSplash` — these do not exist in this codebase.

# Execution Flow
1. **RTL Compliance:** All layouts must be verified for RTL (Hebrew) compatibility. Prefer Tailwind logical properties (`ps-*`/`pe-*`/`start-*`/`end-*`, per `@css-layer/SKILL.md`) over directional flips like `flex-row-reverse` — logical properties adapt automatically and keep the component reusable, whereas `flex-row-reverse` hardcodes a one-off flip that can silently break if reused elsewhere.
2. **Iconography:** Use the project-standard icon library (`lucide-react`) as defined in `@ui-rules.md`.
3. **State Management:** Distinguish clearly between local UI state (e.g., `isMenuOpen`, a modal's open/close flag) and global Store state (e.g., `loggedinAdmin`, the live seat map in `seat.slice.ts`).

## Seat Map Component (Hila Tours-specific)
The seat map is the most complex, highest-traffic component in the app and has its own rules layered on top of the general ones above:
- **Read from `seat.slice.ts` only** — never derive or cache seat status locally in the component; it's the single source of truth (see `@state-management-layer/SKILL.md`).
- **Status is never color-only** — each seat renders its status color *and* a distinct icon/label (checkmark for `taken`, clock for `pending`, lock for `reserved`), per the `accessibility-layer` skill and `docs/PRD.md` AC-10.
- **RTL exception** — the seat map itself renders `dir="ltr"` regardless of the surrounding page's RTL direction, since it's a spatial diagram of the physical bus, not text (see `@css-layer/SKILL.md`). Everything around the map (labels, buttons, the registration form) still follows normal RTL.
- **Motion** — status-change and swap-move animations respect `prefers-reduced-motion` (see `accessibility-layer` skill); motion is never the only signal a change occurred.

# Global Directory Isolation
- *Components:* `frontend/src/components/`
- *Logic/Utils:* `frontend/src/utils/`