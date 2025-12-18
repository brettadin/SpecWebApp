# 2025-12-17 — CAP-15 global search bar MVP (local datasets + quick nav)

## Summary
Implemented a minimal CAP-15-style “front door” search bar in the top navigation (no new pages):
- Quick navigation shortcuts (Plot, Docs).
- Searches cached local datasets by name/id.
- Designed to be offline/test-safe: it relies on a local cache populated by the Library dataset refresh.

## Evidence
- Global search UI: `apps/web/src/App.tsx`
- Dataset cache helper + tests: `apps/web/src/lib/datasetCache.ts`, `apps/web/src/lib/datasetCache.test.ts`
- Cache population: `apps/web/src/pages/LibraryPage.tsx`

## Notes
This is still a minimal slice:
- No multi-entity external resolver results (targets/molecules/instruments) in the dropdown yet.
- No canonical entity cards or saved query presets yet.
