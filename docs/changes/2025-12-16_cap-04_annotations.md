# Change Record

- Date: 2025-12-16
- Owner: Copilot
- CAP(s): CAP-04, CAP-03, CAP-12
- Summary: Added dataset-linked annotations (point notes + x-range highlights) with API persistence and Plot UI toggles.

## Why

CAP-04 requires annotations that persist with datasets and can be toggled on/off without clutter or data modification. CAP-12 requires tests + a recorded wiring map.

## What changed

- API:
  - Added dataset-local `annotations.json` persistence (local-first)
  - Added endpoints for listing/creating/updating/deleting annotations
- Web:
  - Added an Annotations panel on Plot page
  - Global toggle to show/hide annotation overlays
  - Minimal forms to add point notes and x-range highlights
  - Render point notes as marker overlays and x-range highlights as translucent vertical bands
- Tests:
  - API CRUD test for annotations
  - Web test ensures enabling annotations fetches them and passes highlight shapes to the plot layout

## Wiring notes (UI -> logic)

- UI: Plot page -> `GET /datasets` and `GET /datasets/{id}/data` (CAP-03)
- UI: Show annotations -> `GET /datasets/{id}/annotations`
- UI: Add point note -> `POST /datasets/{id}/annotations/point`
- UI: Add range highlight -> `POST /datasets/{id}/annotations/range-x`
- UI: Delete -> `DELETE /datasets/{id}/annotations/{annotation_id}`

## Verification

- `scripts/verify.ps1`: PASS

## Follow-ups

- Add edit UX (inline text edit) + confirm-on-delete (CAP-04).
- Add per-dataset annotation toggles and filters (type/author) (CAP-04).
- Include annotations in export bundles (CAP-11).
