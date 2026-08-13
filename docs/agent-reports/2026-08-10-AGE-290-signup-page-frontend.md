All green: lint, build, and the full suite (197 tests, including 9 new SignUpPage tests).

Implementation summary:
- **`frontend/src/pages/SignUpPage.tsx`** (new) — RTL Hebrew signup card matching `raw_from_ai_studio/src/pages/SignUpPage.tsx` (colors/spacing/structure preserved), with fullname/email/password fields, show-hide password toggle, touched-based inline validation (name ≥2, email regex, password ≥6), `role="alert"` feedback banner, sonner toasts, `[SIGNUP]`-tagged error log, and accessibility wiring (`htmlFor`/`useId`, `aria-invalid`, `aria-describedby`, `aria-label` on the toggle). Success redirects to `/login` after 1.2s via a ref-held timer cleared on unmount — no token stored, no auto-login.
- **`frontend/src/services/auth.service.ts`** — added `signup()` posting to `/auth/signup` through `userManagementClient`; it deliberately discards the token and sets no auth state.
- **`frontend/src/types/auth.types.ts`** — added `SignupData`.
- **`frontend/src/App.tsx`** — added the `/signup` route.
- **`frontend/src/pages/LoginPage.tsx`** — added the "אין לך חשבון? יצירת חשבון חדש" entry point (per the human answer in the plan).
- **API contract** — `/auth/signup` already existed; tightened `SignupData` (`fullname` now required + `minLength`, password `minLength: 6`) and documented that the frontend discards the returned token.

One note for the orchestrator: the `PassengerViewPage` booking test failed once under parallel load but passes in isolation and in the final full run — a load-related flake, not a regression from this ticket.

=== FRONTEND AGENT REPORT ===
```
Ticket: AGE-290
Pages built/changed: frontend/src/pages/SignUpPage.tsx (new), frontend/src/pages/LoginPage.tsx (signup link), frontend/src/App.tsx (/signup route)
Services built/changed: frontend/src/services/auth.service.ts (signup()), frontend/src/types/auth.types.ts (SignupData)
Store slices built/changed: none (signup intentionally sets no auth state)
Lint: PASS
Build: PASS
Tests: 197 passed, 0 failed (9 new in frontend/src/pages/SignUpPage.test.tsx)
API contracts:
  - docs/api-contract/api-contract.user-management-service.yaml

Handoff to Backend Agent:
- Implement endpoints per service contract above
- POST /auth/signup must ignore any client-supplied roles and always create roles: ["user"]
- See .rule/database-rules.md for collection schemas
```

STATUS: DONE