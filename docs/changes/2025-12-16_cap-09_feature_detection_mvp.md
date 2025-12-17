# Change Record

- Date: 2025-12-16
- Owner: Copilot
- CAP(s): CAP-09, CAP-04 (annotations), CAP-05 (unit display)
- Summary: Added a CAP-09 MVP Feature Finder (peaks/dips) plus a Match panel that supports (a) line list matching with explicit tolerance (±Δx) and (b) band/range matching using range annotations as reference intervals; match rows can be clicked to highlight the corresponding marker, and top matches can be converted into CAP-04 annotations (with citations embedded in text).

## Why

CAP-09 requires assistance-oriented feature detection that operates on the trace exactly as displayed, is transparent about parameters, and can be turned into persisted annotations.

## What changed

### Web

- Added a small, dependency-light feature detector for 1D traces:
  - Modes: `peaks` and `dips` (dips via inverted signal).
  - Computes center position, value, a simple prominence estimate, and an approximate width.
  - Supports basic controls: minimum prominence and minimum separation in displayed X units.

- Added a **Feature Finder (CAP-09)** panel to the Plot page:
  - Select trace(s) (visible originals + visible derived traces).
  - Run peaks/dips detection and render markers directly on the plot.
  - Select detected features and convert them to CAP-04 point annotations.

- Added reverse X conversion helpers so annotations are stored in dataset-native (canonical) units even when the plot is displaying converted units.

- Added a **Match to Line List (CAP-09)** panel to the Plot page:
  - Select a reference line list dataset (imported via CAP-07 line-list import).
  - Set a tolerance window (±Δx) in displayed X units.
  - Run matching and see ranked candidates per feature (closeness score with optional strength tie-break).
  - Apply top matches to annotations (CAP-04) with source/citation text embedded.

- Extended matching to **Band/range references**:
  - Use a reference dataset's `range_x` annotations as the interval set.
  - Match features whose center lies within an interval and rank by closeness to interval midpoint.

- Match results show the selected reference's URL/retrieval date/citation text for transparency.

- Clicking a Feature Finder row or a Match row highlights that marker on the plot.

- Match results now include a small scoring breakdown panel for the selected feature, showing the top candidates with the fields used in scoring (e.g., $x_{ref}$, $\Delta$, score, strength; or band/range interval and score).

- Applying top matches to annotations persists a compact candidate label (to keep notes readable) while the Match panel retains richer per-candidate detail.

### Tests

- Unit tests for feature detection and for reverse unit conversion.
- Plot page test validating feature markers appear after running the Feature Finder.
- Plot page test validating the match scoring breakdown renders after selecting a match row.

## Files

- Feature detection: apps/web/src/lib/featureDetection.ts
- Plot UI: apps/web/src/pages/PlotPage.tsx
- Unit conversion helpers: apps/web/src/lib/transforms.ts
- Tests: apps/web/src/lib/featureDetection.test.ts, apps/web/src/lib/transforms.test.ts, apps/web/src/pages/PlotPage.test.tsx

## Verification

- scripts/verify.ps1: PASS

## Follow-ups

- Consider compacting candidate labels used in persisted annotations vs. UI display (avoid overly verbose notes).
- Add confidence labeling/ambiguity messaging beyond simple count warnings.
- Ensure provenance of detection/matching parameters is recorded in exports (CAP-11).
