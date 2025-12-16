# Change Record

- Date: 2025-12-16
- Owner: Copilot
- CAP(s): CAP-05, CAP-03, CAP-12
- Summary: Added non-destructive transform pipeline (normalize/baseline/smooth) and view-only X unit display conversion, with derived trace management and save-to-Library.

## Why

CAP-05 requires optional, explicit, non-destructive transforms that improve comparability without mutating raw imported data. It also requires drift-free unit display conversion based on a canonical axis.

## What changed

### Web

- Added a Transform panel on the Plot page:
  - Target trace selection (from currently visible traces)
  - Y normalization modes: max, min-max, z-score, area (range optional)
  - Baseline correction: polynomial baseline (optional baseline trace display)
  - Smoothing: Savitzky-Golay (explicit; off by default)
  - X unit display: view-only conversion (nm / Å / µm / cm⁻¹) computed from canonical X
- Derived traces are grouped under "Derived" in the trace panel, can be toggled, cleared, and saved.

### API

- Added `POST /datasets/{dataset_id}/derived` to create a new dataset from a parent dataset's X and a provided derived Y, storing a transform manifest for later export.

### Tests

- Added unit + normalization tests for CAP-05 utilities.
- Added API test ensuring derived dataset creation persists metadata and a manifest.

## Files

- Web transforms utilities: `apps/web/src/lib/transforms.ts`
- Web transform tests: `apps/web/src/lib/transforms.test.ts`
- Plot UI wiring: `apps/web/src/pages/PlotPage.tsx`
- API endpoint: `apps/api/app/main.py`
- API sha256 metadata consistency: `apps/api/app/datasets.py`
- API test: `apps/api/tests/test_cap05_derived_save.py`

## Verification

- `scripts/verify.ps1`: PASS
