# 2025-12-17 — CAP-15 target resolution guardrails (MAST query builder)

## Summary
Improved the CAP-15 “front door” behavior for the existing MAST query builder in the Library panel:
- Detects coordinate inputs (RA/Dec degrees) and uses them directly.
- Caches name-lookup candidates locally and can fall back to cached results if the lookup fails (offline/API down).
- Handles ambiguous name lookups explicitly: user must pick a candidate rather than silently using the first result.
- Remembers the user’s chosen candidate for that input to reduce repeated disambiguation.

## Evidence
- Target resolver helper + tests: `apps/web/src/lib/targetResolution.ts`, `apps/web/src/lib/targetResolution.test.ts`
- MAST query builder UI changes: `apps/web/src/pages/LibraryPage.tsx`

## Notes
This is still a MAST-scoped slice of CAP-15 (no global search bar, entity cards, presets, or non-MAST resolvers yet).
