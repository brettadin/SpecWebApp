# Change Record

- Date: 2025-12-20
- Owner: brettadin
- CAP(s): CAP-03
- Summary: Wire up CAP-03 trace management UX (group toggles, aliasing, quick actions) plus plot status strip, zoom persistence, and labeled view-decimation.

## Why

CAP-03 requires the plotting workbench to remain readable and controllable with many overlays: users need group toggles, isolate/show/hide controls, consistent naming, stable zoom state, and performance safeguards for large traces that are explicitly labeled as view-only.

## What changed

- Trace inspector (“Traces” tab) now includes:
  - Filter by name/id/tags/collections
  - Show all / Hide all
  - Group toggles for Lab/Reference/Telescope/Other + Derived
  - Collapse/expand derived traces
  - Per-trace quick actions: Alias, Favorite, Details, Remove (hide)
- Plot area now includes a small status strip with:
  - Overlay counts, axis unit summary
  - Current view range readout
  - Render mode label (Full view vs Fast view / View-decimated)
  - Explicit “Reset view” action
- Plot state stability:
  - Plotly `uirevision` prevents zoom/pan from resetting during normal trace changes.
- Snapshot compatibility:
  - Plot snapshot schema accepts new CAP-03 UI state (fast view, tooltip mode, derived collapse state, aliases) in a backward-compatible way.

## Wiring notes (UI -> logic)

- UI state lives in `PlotPage` and is persisted/restored via the plot snapshot state.
- “Details” dispatches a `spectra:library-open-dataset` custom event (hook for the Library UI).
- “Remove” maps to “hide from plot” (visibility off), not deletion.

## Verification

- `apps/web`: `npm test`
- `apps/web`: `npm run lint`

## Follow-ups

- If/when the Library detail panel wiring lands, replace the custom event with a direct route or shared state action.
- Consider surfacing ingest trust warnings as badges in the trace list (CAP-03 §9).
