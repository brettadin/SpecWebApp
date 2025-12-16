# Change Record

- Date: 2025-12-16
- Owner: Copilot
- CAP(s): CAP-03, CAP-12
- Summary: Implemented a minimal interactive Plot workspace with overlay + trace list controls (show/hide, isolate) backed by the API dataset endpoints.

## Why

CAP-03 requires an interactive plotting workbench where multiple datasets can be overlaid without legend chaos, with quick per-trace visibility management. CAP-12 requires changes to be verifiable and non-regressing.

## What changed

- Implemented `/plot` page to:
  - fetch datasets from the API
  - overlay selected datasets on an interactive plot
  - provide a docked trace list with: filter, show/hide, isolate, show-all/hide-all
  - show axis labels including units (or `unknown` when missing)
- Added a unit test for Plot overlay behavior with `fetch` + Plotly mocked.

## Wiring notes (UI -> logic)

- UI: Plot page -> `GET /datasets` to list available datasets.
- UI: Trace toggle -> `GET /datasets/{id}/data` to fetch X/Y series for plotting.

## Verification

- `scripts/verify.ps1`: PASS

## Follow-ups

- Add group toggles (Lab/Reference/Telescope, Original/Derived) once source/type metadata exists (CAP-02/CAP-07/CAP-08).
- Add warning badges in trace list using dataset warnings (requires including warnings in list responses or fetching detail).
- Consider view-decimation labeling/controls for very large traces (CAP-03 performance section).
