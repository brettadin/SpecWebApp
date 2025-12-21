# 2025-12-20 — CAP-04: Y-range highlights (range_y)

## Summary

Adds CAP-04 horizontal range highlights (`range_y`) end-to-end:

- API supports create/update/list/delete of `range_y` annotations.
- Plot UI supports creating Y-range highlights, filtering them, inline editing y0/y1, and plot-side dragging of y0/y1 bounds with persistence.

## Why

CAP-04’s annotation types include optional horizontal spans (y1–y2) “when needed”. This closes that gap while keeping the existing CAP-04 interaction patterns consistent with `range_x`.

## What changed

### API

- Added `POST /datasets/{dataset_id}/annotations/range-y`.
- Added request model + persistence for `type="range_y"` with `y0/y1` ordering normalization.
- Extended update ordering invariant to keep `y0 < y1` for `range_y`.

### Web

- Added a “Y-range highlight” create section in the Plot annotate panel.
- Added `range_y` to the annotation type filter.
- Added inline editing for `range_y` coordinates (`y0/y1`).
- Plot rendering draws `range_y` as a horizontal band (Plotly shape with `xref: 'paper'`, `yref: 'y'`).
- Plot-side dragging of bounds persists via `onRelayout` (debounced), same mechanism as `range_x`.

## Wiring notes (UI -> logic)

- UI: Plot page annotate panel
  - Create: `onAddRangeY()` -> API: `POST /datasets/{id}/annotations/range-y`
  - Edit inline: `onSaveEditingAnnotation()` -> API: `PUT /datasets/{id}/annotations/{annotation_id}`
  - Drag bounds: Plotly `onRelayout` -> debounced `onUpdateAnnotation()` -> API: `PUT /datasets/{id}/annotations/{annotation_id}`

## Files touched

- API:
  - `apps/api/app/annotations.py`
  - `apps/api/app/main.py`
  - `apps/api/tests/test_annotations.py`
- Web:
  - `apps/web/src/pages/PlotPage.tsx`
- Docs:
  - `docs/CAP_PROGRESS_INVENTORY.md`
  - (this file)

## Verification

- Web:
  - `npm run lint` (apps/web)
  - `npm test` (apps/web)
- API:
  - `pytest` (apps/api)

## Follow-ups

- Consider adding a focused web test that covers creating a `range_y` highlight from the annotate panel (the existing plot tests already cover drag-persistence for `range_x`).
