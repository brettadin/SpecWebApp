# 2025-12-17 — UI screenshot assessment (ingest + plot)

Source: user-provided screenshots from the running web UI.

## What the screenshots confirm is working
- **Delimited-text ingest with Ocean Optics-style marker headers works**
  - Preview shows tabular XY rows.
  - Parser reports `delimited-text`.
- **Messy header metadata is being preserved and surfaced (preview)**
  - “Detected header metadata (from the file’s preamble)” table is populated (e.g., Spectrometer, Trigger mode, Integration Time, XAxis mode, Number of Pixels).
- **Import/commit succeeds for the instrument TXT**
  - The “Imported” JSON block shows a new dataset id, created timestamp, sha256, and an `x_count` matching the instrument header (“Number of Pixels”).
- **Units are treated as optional at import time**
  - The imported response contains warnings when `x_unit` / `y_unit` are missing.

## Issues observed (needs addressing)
- **Plot area fails to render**
  - Error shown: “Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object. Check the render method of `PlotPage`.”
  - Impact: prevents plotting and blocks most downstream workflows.
- **Metadata table readability/contrast issue in dark theme**
  - The metadata block in Library preview appears washed out / hard to read in dark mode (light background vs. light text).
- **MAST search/name lookup failing**
  - Error shown: “MAST name lookup failed” (CAP-08 flow).
  - Impact: telescope ingestion path blocked; could be network/API error, CORS, or upstream service issue.
- **Inspector warning about differential X units**
  - “Trace A and/or B has unknown X units…” appears.
  - Impact: expected if users haven’t set units; may be too prominent if they aren’t using Differential.

## What was addressed (code changes)
- **Fix: Plot render crash in web UI**
  - Root cause: `react-plotly.js` module interop can expose the component under `.default` depending on bundler/CJS handling. Rendering the module namespace object triggers the “Element type is invalid … got: object” error.
  - Change: make the Plot component import interop-safe and render `PlotComponent`.
  - Location: `apps/web/src/pages/PlotPage.tsx`.
- **Fix: Metadata table contrast in Library preview**
  - Change: removed the hardcoded light background so the table inherits the app theme colors.
  - Location: `apps/web/src/pages/LibraryPage.tsx`.

## Verification notes
- These fixes are UI/runtime oriented (not fully covered by unit tests).
- Manual smoke check recommended:
  1. Start API + web (`Dev: full stack`).
  2. Load `/plot`, toggle a trace → plot should render.
  3. Import the instrument TXT again → metadata table should remain readable.

## Follow-ups (if still failing)
- If Plot still fails after the interop fix, capture the browser console stack trace and the values of the imported `react-plotly.js` module (what shape it has at runtime).
- For MAST failures: confirm API is reachable from browser, and check API logs for upstream errors/timeouts.
