# Versioning Rules

## Purpose
- Define branch, commit, merge, and release versioning expectations for this repository.

## Core Principles
- Execute implementation work from a dedicated branch, not from main.
- Keep changes small, reviewable, and scoped to a single intent.
- Never commit, merge, or publish release tags without explicit approval.

## Branch Rules
- Create a new branch before executing an approved plan.
- Keep one plan or workstream per branch.
- Keep branch names predictable and lowercase using this pattern:
	- `task/<topic>` for new capabilities.
	- `bug/<topic>` for bug fixes.
	- `maintenance/<topic>` for maintenance.
	- `docs/<topic>` for documentation-only changes.
- Prefer singular domain terms in branch names when applicable — e.g. `task/seat-approve-flow`, `bug/manifest-pickup-grouping`, `task/tour-crud`, `bug/swap-move-race-condition`.
- When a change spans both a microservice and the frontend, one branch can cover both — keep commits within it scoped by folder (`backend/tour-service/...` vs. `frontend/...`) rather than splitting into two branches, unless the work is genuinely independent.

## Commit Rules
- Do not commit until the user explicitly approves committing.
- Keep commit messages concise and action-oriented.
- Use imperative commit subjects, for example: `add seat approve endpoint`, `fix pending seat race condition`.
- Avoid bundling unrelated changes in the same commit — e.g. don't mix a `tour-service` seat-logic change with an unrelated frontend styling change.

## Merge Rules
- Do not merge branches without explicit approval.
- Require at least one review pass before merge when collaboration is involved.
- Resolve comments and open questions before merge.
- For changes to seat-state logic (`seat.service.ts`) specifically, confirm the concurrency/race-condition behavior has been checked before merge — this is the highest-risk area in the codebase (see `testing-rules.md`).

## Versioning Model
- Use Semantic Versioning for releases: `MAJOR.MINOR.PATCH`.
- Increment `MAJOR` for breaking changes.
- Increment `MINOR` for backward-compatible features.
- Increment `PATCH` for backward-compatible fixes.
- Since `frontend/`, `user-management-service`, and `tour-service` deploy independently, version each one separately rather than sharing a single repo-wide version number — a breaking change in `tour-service`'s API shouldn't force a version bump in `user-management-service` or vice versa.

## Pre-release and Build Metadata
- Use prerelease identifiers for non-final versions when needed:
	- `1.4.0-alpha.1`
	- `1.4.0-rc.1`
- Use build metadata only for build traceability, for example: `1.4.0+build.20260731`.

## Release Process Rules
- Create release tags only after approval.
- Ensure release notes summarize user-visible changes and any breaking behavior — call out explicitly if a change affects the seat-state contract (e.g. a new `seatStatus` value, a changed response shape from `seats/approve`), since the frontend and `tour-service` must stay in sync on this.
- Verify tests and critical validation steps pass before publishing a release.