# Style Rules

## Purpose
- Define CSS organization and maintainable styling patterns for this app (`frontend/`, Hila Tours).

## Stack
- Tailwind CSS v4 (CSS-first, via `@tailwindcss/vite` — no `tailwind.config.js`) — utility-first styling.
- `cn()` — for conditional class merging (via `clsx` + `tailwind-merge`), located at `frontend/src/lib/utils.ts`.
- Tailwind utilities are the default for all styling. Custom CSS in `main.css` is limited to what utilities genuinely cannot express (see File Structure below).

## Theme Configuration
- All design tokens are defined in `frontend/src/main.css` using Tailwind v4's `@theme` block.
- Do not hardcode colors, fonts, or spacing inline — always reference theme tokens via their generated utility classes.
- Current tokens (extend this list here as new tokens are added — do not let this drift from `main.css`):

```css
/* frontend/src/main.css */
@import "tailwindcss";

@theme {
  /* Colors */
  --color-primary: #f59e0b;
  --color-secondary: #0f172a;
  --color-accent: #10b981;
}
```

- **Only `--color-primary`, `--color-secondary`, and `--color-accent` are confirmed** (from the AI Studio demo). The following tokens exist in previous projects but aren't yet defined here — add them once decided, and remove this note once done:
  - `--color-primary-hover` / `--color-secondary-hover` (hover states for the two main colors)
  - `--color-danger` / `--color-danger-hover` — for destructive actions (e.g. delete tour/bus, cancel a seat)
  - `--color-success` — could reuse `--color-accent` (`#10b981` already reads as emerald/green) or be defined separately
  - `--color-warning` — useful specifically for `pending` seat status
  - `--font-sans` — typography token
  - `--color-border-subtle` — for card/input borders

- No `--radius-*` tokens are defined — use raw Tailwind radius utilities directly (e.g. `rounded-xl`, `rounded-[2rem]`), matching prior projects' convention, unless decided otherwise.

## Domain-Specific Color Mapping (seat map)
- The seat map is the one place in the UI where color directly encodes domain state (`seatStatus`). Map each status to a token, not a raw hex value, so the mapping stays centralized and themeable:
  - `available` → a neutral/light tone (e.g. white/light background with a border) — not one of the semantic colors, to avoid confusion with success/danger.
  - `pending` → `--color-warning` once defined, or `--color-primary` (`#f59e0b` already reads as amber) if no dedicated warning token is introduced.
  - `taken` → `--color-danger` (occupied = not available) or a neutral "filled" tone — confirm which reads better against `--color-primary`.
  - `reserved` → a distinct tone (e.g. `--color-secondary` background, possibly with a lock icon) so it's visually different from `taken` even though both are unavailable to passengers.
- Once this mapping is decided, encode it as a small lookup (e.g. `seatStatusStyles: Record<SeatStatus, string>`) rather than scattering inline conditionals across seat components.

## Conditional Classes
- Use `cn()` for all conditional or merged class strings.
- Never use string concatenation or ternary strings for class names.

```ts
// frontend/src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

```tsx
// Usage
<button className={cn(
  'px-4 py-2 rounded-xl font-medium',
  isValid ? 'bg-accent text-white' : 'bg-danger text-white',
  disabled && 'opacity-50 cursor-not-allowed'
)}>
  Submit
</button>
```

## Authoring Rules
- Use Tailwind utility classes directly on elements — do not introduce new custom CSS classes or CSS Modules for component styling.
- Reference `@theme` tokens via Tailwind's generated utilities (e.g. `bg-primary`, `text-secondary`, `border-accent`).
- Use `cn()` whenever classes depend on props, state, or conditions — this applies especially to seat cells, whose class depends entirely on `seatStatus`.
- Keep className strings readable — break long strings across lines when needed.
- Do not use `style={{}}` inline styles for anything expressible in Tailwind. Inline styles are only acceptable for genuinely runtime-computed values — e.g. dynamic seat-map grid positioning derived from a bus's row/column layout, drag coordinates during swap-move — never for static styling.

## File Structure
- `frontend/src/main.css` — entry point: `@import "tailwindcss"`, the `@theme` block, and the limited set of things Tailwind utilities can't express (to be filled in as needed, e.g. keyframe animations for drag-and-drop seat swapping, custom scrollbar, etc.).
  - Do not add anything here that a Tailwind utility class could express instead.
- `frontend/src/lib/utils.ts` — `cn()` utility for class merging.

## Open Questions / TBD
- Confirm `--color-danger`, `--color-warning`, `--font-sans`, and `--color-border-subtle` tokens (not provided by the AI Studio demo yet).
- Decide the final color-to-seatStatus mapping above and remove the "TBD" framing once locked in.