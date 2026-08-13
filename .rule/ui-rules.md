# UI Rules

## Purpose
- Define default UI libraries for common interface elements.

## Library Choices
- Use `sonner` for toast messages.
- Use `lucide-react` for icons.
- Use `framer-motion` for animations and transitions.

## Usage Notes
- Keep notifications concise and action-oriented — especially for seat actions (e.g. "Seat 14B approved", "Seat 14B was just taken — pick another").
- Reuse icon names consistently across similar features (e.g. one consistent icon for `reserved` seats across the seat map, manifest, and any bus summary view).
- Prefer `framer-motion` variants and transitions over CSS animations for interactive elements — this applies especially to the seat map, where seat status changes (approve, cancel, reserve, manual-assign) and the `swap-move` drag interaction should animate rather than snap instantly.