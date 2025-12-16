# Change Record

- Date: 2025-12-16
- Owner: Copilot
- CAP(s): CAP-06, CAP-03, CAP-05, CAP-12
- Summary: Added differential comparison (A−B and A/B) with explicit A/B selection, overlap-only output, opt-in alignment (nearest/linear/PCHIP), and safe ratio masking, producing derived traces with provenance.

## Why

CAP-06 requires trust-first differential comparison between two traces without mutating stored datasets, with explicit controls for alignment/resampling and safe handling for unstable A/B denominators.

## What changed

### Web

- Added a "Differential (CAP-06)" panel on the Plot page:
  - Trace A / Trace B selectors (independent state)
  - Lock A / Lock B toggles to prevent accidental selector changes
  - Swap A ↔ B button
  - Operation selector: A−B or A/B
  - Optional alignment (explicit opt-in): nearest / linear / PCHIP with selectable target grid (A grid or B grid)
  - Ratio handling (A/B): mask near-zero denominator with optional user-provided threshold τ
  - Clear A/B labels shown near the compute button
- Differential outputs are created as derived traces (session-only by default) and appear under "Derived" alongside CAP-05 derived traces.
- Outputs are overlap-only (values outside overlap are masked as NaN), and interpolation never occurs unless alignment is enabled.
- Derived traces include provenance records:
  - Optional resample record when alignment is enabled (method, target grid, overlap info)
  - Differential record with op, A/B inputs, and ratio masking details (τ + masked count)

### Math/logic

- Added/extended pure utilities for CAP-06 in the shared transforms module:
  - `alignToTargetGrid()` with `none | nearest | linear | pchip` alignment methods.
  - `differentialCompare()` implementing A−B and A/B with overlap-only output and safe ratio masking.
  - When alignment is `none`, mismatched X grids are rejected to preserve explicit opt-in alignment.

### Tests

- Added unit tests covering:
  - A−B on identical grids
  - refusal on mismatched grids when alignment is off
  - A/B masking near zero
  - overlap-only behavior for aligned comparisons
- Added a Plot page integration test that computes A−B and asserts a derived trace appears.

## Files

- Web transforms utilities: `apps/web/src/lib/transforms.ts`
- Web transforms tests: `apps/web/src/lib/transforms.test.ts`
- Plot UI + wiring: `apps/web/src/pages/PlotPage.tsx`
- Plot UI test: `apps/web/src/pages/PlotPage.test.tsx`

## Verification

- `scripts/verify.ps1`: PASS

## Follow-ups

- Consider expanding ratio handling options (epsilon-stabilized ratio, clamp, import as-is) if/when requested by the spec roadmap (currently out of scope in UI).
