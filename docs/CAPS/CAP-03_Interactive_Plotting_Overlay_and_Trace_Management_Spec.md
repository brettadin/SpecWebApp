**CAP-03 - Interactive Plotting, Overlay, and Trace Management**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-03 defines the user-facing plotting workspace: rendering one or more spectra as interactive plots; overlaying multiple datasets; trace visibility management; legend/label hygiene; and high-signal interactions (zoom/pan, hover tooltips, quick isolate/show-hide). This capability is the core 'workbench' where users examine fine details, compare shapes, and prepare the context for notes/annotations (CAP-04), normalization and other transforms (CAP-05), and differential operations (CAP-06).

# 2\. User outcomes (success criteria)

- I can plot one dataset immediately after import or from the Library.
- I can overlay many datasets and still keep the plot readable and controllable (no legend chaos).
- I can zoom/pan to inspect fine details quickly and reset the view without losing my place.
- Hover tooltips show accurate X/Y values, units, and dataset name (and optionally source/type).
- I can show/hide traces, isolate one trace, and toggle groups (Lab/Reference/Telescope, Original/Derived) with minimal clicks.
- Plot interactions never distort the underlying data; any visual optimizations are clearly labeled as view-only.

# 3\. In scope / Out of scope

## In scope

- Primary plot area with interactive controls: zoom, pan, reset, hover tooltips.
- Overlay of multiple datasets, with per-trace toggles and grouped toggles.
- Legend/trace list behavior, naming rules, and readability constraints.
- Basic performance safeguards for large datasets (render-time optimizations that do not alter stored data).
- Stable UI state rules so the plot does not reset unexpectedly.

## Out of scope (for CAP-03)

- File parsing and ingest preview (CAP-01).
- Persistent library/search/sharing mechanisms (CAP-02) - CAP-03 consumes datasets from the library and session.
- Point/range annotations and saved labels (CAP-04).
- Normalization and transform chain (CAP-05) and differential ops (CAP-06). CAP-03 must provide hooks to display their outputs.
- External database/archive querying (CAP-07/CAP-08).

# 4\. Design principles (aligned to your Brain Dump)

- Readable by default: a user should not need to drag legends around or manually fix clutter on every plot.
- Minimal popups: most interactions happen inline (trace list panel, grouped toggles).
- Trust-first: no invented data; no silent smoothing/resampling; show warnings for suspicious ranges.
- Fast enough for real work: reasonable interactivity even for large files (with view-only rendering optimizations).
- Consistent naming: legend items must reflect dataset identity while staying short and scannable.

# 5\. Core UI layout requirements

## Required components (framework-agnostic)

- Plot canvas (main area).
- Trace control panel (recommended: left side panel): shows traces, groups, and quick actions.
- Metadata summary panel (recommended: right side or collapsible): shows dataset source/type/units and provenance summary.
- A small, non-intrusive status strip: warnings (e.g., non-monotonic X), render mode (full vs view-decimated), and current overlay count.

## Trace control panel (minimum capabilities)

- Search within traces (filter by name/tag/target).
- Show/hide per trace (checkbox).
- Isolate a trace (one-click), and 'show all' (one-click).
- Group toggles: by source_type (Lab/Reference/Telescope/Other) and by class (Original/Derived).
- Quick actions: rename display label (alias), favorite, open dataset detail (CAP-02), remove from plot (not delete).

## Plot interaction controls (minimum)

- Zoom: drag-to-zoom (box) and/or scroll zoom.
- Pan: click-drag pan mode.
- Reset view: one control to reset to full extent.
- Hover: tooltips at cursor with X/Y + units + dataset name.
- Optional but recommended: crosshair cursor mode for reading values more precisely.

# 6\. Plot behavior rules (MUST / MUST NOT)

## Non-negotiables

- MUST plot the stored X/Y arrays exactly as they exist in the dataset (post-ingest).
- MUST NOT normalize, resample, smooth, interpolate, or gap-fill within CAP-03.
- MUST ensure axis labels show units derived from dataset metadata (or show 'unknown' with a warning).
- MUST ensure legend items are readable and not duplicated; if duplicates exist, disambiguate via short suffixes (e.g., source or dataset_id short).
- MUST preserve user state during normal interactions: adding a trace must not reset selections and should not reset zoom unless explicitly requested.

## Legend and naming rules

- Legend/trace list display names should default to: user title (if set) else filename.
- Support a short 'alias' field for display (keeps UI clean) while retaining full provenance and original names in dataset detail.
- Truncate long names with ellipsis in the UI list but provide full name on hover or in details.
- Derived outputs (later CAP-05/06) must be visually grouped and clearly labeled as derived (e.g., Δ, ÷ prefixes or badges).

## Clutter controls (required)

- Provide a simple 'Hide all but selected' isolate function.
- Provide group hide/show toggles (Lab/Reference/Telescope and Original/Derived).
- Provide a 'Collapse derived' option that collapses derived traces into a single expandable group in the trace panel.

# 7\. Tooltips and fine-detail inspection

## Tooltip minimum content

- Dataset display name (alias if present).
- X value + x_unit (e.g., 1023.4 cm⁻¹).
- Y value + y_unit (or y label like 'Absorbance').
- Optional: source_type and tag(s) (only if not too noisy).

## Tooltip precision and formatting

- Use consistent numeric formatting (e.g., 3-6 significant figures) to avoid unreadable tooltips.
- For extremely large/small values, use scientific notation where appropriate.
- Allow user to toggle 'compact' vs 'detailed' tooltip modes.

## Selecting a region (view-only)

- Support selecting/zooming into a region by box selection.
- Expose the selected X range in the status strip (e.g., 'View: 900-1200 cm⁻¹').
- CAP-04 will use this same interaction pattern for creating saved range highlights; CAP-03 only provides the interaction primitive.

# 8\. Performance and scale

## Large dataset handling (without lying)

- If a dataset is very large, CAP-03 may render a visually equivalent decimated representation for responsiveness, but it must be labeled as 'view-decimated'.
- Decimation MUST NOT change the stored dataset arrays and MUST NOT be used for exports; it is a rendering optimization only.
- Provide a toggle to switch between 'fast view' and 'full' (with the latter allowed to be slower).
- Avoid multisecond UI freezes: progressive rendering or background preparation is acceptable if the UI stays responsive.

## Suggested thresholds (configurable)

| small | < 50k points per trace: render full by default |
| --- | --- |
| medium | 50k-500k points: render full or view-decimated depending on device |
| large | \> 500k points: view-decimated default with full-on-demand |

# 9\. Error handling and trust signals

- If a dataset has warnings from CAP-01 (non-monotonic X, missing units), show a small warning badge on the trace item and in the status strip.
- If X is non-monotonic and user imported as-is, plotting should still work but must warn 'X not ordered; visual may appear jagged'.
- If a dataset has unknown units, axis labels must show 'unknown' rather than assuming units.

# 10\. Acceptance tests (concrete checks)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP03-T01 | Plot one dataset from Library | Plot renders; axis labels present; tooltip shows X/Y/units |
| CAP03-T02 | Overlay 5 datasets | All traces render; trace panel lists 5; show/hide works per trace |
| CAP03-T03 | Group toggles by source_type | Toggling group hides/shows all member traces |
| CAP03-T04 | Isolate one trace and restore | Isolate hides others; 'show all' restores previous visibility state |
| CAP03-T05 | Legend/name hygiene with long names | Names truncate; full name available on hover; no duplicates |
| CAP03-T06 | Zoom/pan + reset view | Zoom and pan operate; reset returns to full extent; no crashes |
| CAP03-T07 | Hover precision on fine features | Tooltip values match underlying data at the hovered point |
| CAP03-T08 | Large file responsiveness | For >500k points: default view-decimated; UI remains responsive; full toggle works |
| CAP03-T09 | State persistence when adding trace | Adding/removing traces does not reset other UI state unexpectedly |

# 11\. Implementation guidance (what to use - options, not mandates)

## Interactive plotting engine options

- Web/Hybrid UI: Plotly (supports hover templates, legend interactions, scroll zoom) - good for rich tooltips and grouping.
- Desktop UI: PyQtGraph (high-performance Qt plotting with smooth interaction) - good for large datasets.
- Other acceptable engines if they meet requirements: Bokeh, Vega-Lite, or QtCharts (must support hover + toggles + zoom).

## Recommended default behaviors if using Plotly-family tooling

- Legend click should toggle trace visibility; legend double-click should isolate (or provide an explicit isolate button to avoid surprises).
- Use legendgroup (or equivalent) to implement group toggles (Original/Derived, Lab/Reference/Telescope).
- Enable scrollZoom where appropriate; provide explicit reset control.

## Recommended default behaviors if using PyQtGraph-family tooling

- Ensure mouse wheel zoom and drag pan are intuitive; provide a visible reset/auto-range control.
- Provide a hover readout (status bar or tooltip) for X/Y values.

# 12\. Open questions (tracked, not blocking CAP-03 spec)

- Should isolate default to legend double-click behavior, or only via an explicit isolate button (reduces accidental isolate)?
- Should the plot keep its zoom state when traces are added/removed by default, or reset to full extent?
- What is the initial default theme (dark) and how many theme variants are required before v1?
- Do we support dual Y axes in v1, or keep it single-axis for clarity?

# Appendix A. Definitions

- Trace: a plotted series representing one dataset's X/Y arrays (or a derived series later).
- Overlay: the act of plotting multiple traces on the same axes for comparison.
- View-decimated: a rendering-only reduction of points to improve responsiveness; not a data transform.

# Appendix B. Project reference links (MUST consult)

The repository includes a user-maintained reference link suite. Agents must consult it before selecting a plotting engine, implementing hover/annotation behavior, or wiring export/display behavior.  
<br/>Single source of truth: docs/references/REFERENCES_RAW.md (or the path used in your project).

# Appendix C. External references used in this CAP

- Plotly documentation on legend interactions and grouping.
- Plotly documentation on hover templates (tooltip formatting).
- Plotly configuration options (e.g., scroll zoom).
- PyQtGraph documentation on mouse interaction patterns (for desktop mode).
- Plotly legends: <https://plotly.com/python/legend/>
- Plotly hover text & formatting (hovertemplate): <https://plotly.com/python/hover-text-and-formatting/>
- Plotly configuration options (scrollZoom): <https://plotly.com/python/configuration-options/>
- PyQtGraph mouse interaction guide: <https://pyqtgraph.readthedocs.io/en/latest/user_guide/mouse_interaction.html>