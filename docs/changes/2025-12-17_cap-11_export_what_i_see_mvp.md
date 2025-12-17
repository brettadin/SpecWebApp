# CAP-11 — Export “What I See” bundle (MVP)

Date: 2025-12-17

## Summary
Adds an MVP “Export what I see” flow that packages the current plot state and plotted traces (exactly as displayed) into a deterministic ZIP bundle with checksums and a manifest.

## User-facing behavior
- Plot page includes a new **Export (CAP-11)** section with a single button: **Export what I see (.zip)**.
- Clicking the button prompts for a filename (defaults to a timestamped `what_i_see_YYYY-MM-DDTHH-MM-SSZ.zip`), sends the current plot snapshot + currently visible traces (original + derived) to the API, and downloads the resulting ZIP.

## API
- `POST /exports/what-i-see.zip`
  - Accepts a JSON payload describing:
    - `plot_state` (display unit, visible traces, annotation toggle, timestamps)
    - `traces[]` (x/y arrays already in display units)
    - optional CAP-09 artifacts (`features`, `matches`) if present
  - Returns a ZIP bundle with deterministic paths, a `MANIFEST.json`, and `checksums/SHA256SUMS.txt`.

## Bundle contents (MVP)
- `provenance/plot_state.json`
- `data/plotted_traces.json`
- `data/plotted_traces.csv` (long format)
- `citations/citations.json` (pulled from referenced datasets’ `reference` metadata when available)
- `annotations/annotations.json` (aggregated from referenced datasets when present)
- `MANIFEST.json`
- `checksums/SHA256SUMS.txt`
- `README.txt`

## Tests
- API: `test_export_what_i_see.py` validates ZIP structure + citations.

## Notes
- This is intentionally “what I see”: client-provided plotted arrays in display units.
- Raw-source inclusion is handled by the dataset export bundle endpoint; this flow is a snapshot/export of the current plot view.
