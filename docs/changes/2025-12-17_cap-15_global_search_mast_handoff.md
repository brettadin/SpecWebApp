# 2025-12-17 — CAP-15: Global search → MAST handoff

## Summary

Global search can now hand off a target into the Library panel’s MAST query builder via URL parameters, and optionally auto-run the search once per token.

This completes the “bridge” between the CAP-15 global search front door and the existing CAP-08 MAST retrieval UI.

## User-facing behavior

- In the global search dropdown, targets can be routed into the MAST search flow.
- The Library MAST UI reads URL parameters on load/navigation:
  - `mastTarget` (string)
  - `mastAutoSearch=1` (optional)
  - `mastToken` (required for auto-run; prevents repeated triggering)
  - Optional: `mastRadius`, `mastMission`, `mastDataType`
- When auto-run is requested, the search executes at most once per `mastToken`.
- Global search can include the last-used MAST options (radius/mission/type) when launching into the Library MAST flow.
- Pressing Enter in global search will launch MAST when the input parses as coordinates (otherwise Enter behavior remains dataset-first).

## Implementation notes

- The Library MAST search logic was refactored to support a shared `performMastSearch()` implementation.
- URL-param auto-run is guarded to avoid repeated triggering and to avoid unhandled promise rejections in offline/test scenarios.
- The last-used MAST search options are persisted and reused for the handoff.

## Evidence

- Target action emission: [apps/web/src/App.tsx](apps/web/src/App.tsx)
- Param consumption + guarded auto-run: [apps/web/src/pages/LibraryPage.tsx](apps/web/src/pages/LibraryPage.tsx)
- Handoff helpers + tests: [apps/web/src/lib/mastHandoff.ts](apps/web/src/lib/mastHandoff.ts), [apps/web/src/lib/mastHandoff.test.ts](apps/web/src/lib/mastHandoff.test.ts)
- Verification: `scripts/verify.ps1` (web lint/tests + API lint/tests + api-client generation)
