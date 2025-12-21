# Architecture overview

## Modules

- `apps/web`: Vite + React + TypeScript UI (React Router)
- `apps/api`: FastAPI service (ingest/parsers/connectors)
- `packages/api-client`: TypeScript types generated from the API OpenAPI schema

## CAP mapping (initial)

- CAP-01 (ingest): `apps/api/app/ingest_preview.py`, `apps/web/src/pages/LibraryPage.tsx`
- CAP-12 (quality gates): `scripts/verify.ps1`, `docs/ui_contract.json`, tests in both apps
- CAP-14 (docs hub): `apps/web/src/pages/DocsPage.tsx`, docs in `docs/`
- CAP-03 (plotting): `apps/web/src/pages/PlotPage.tsx` + API `GET /datasets/{id}/data`
- CAP-04 (annotations): API `GET/POST/PUT/DELETE /datasets/{id}/annotations...` + UI in `apps/web/src/pages/PlotPage.tsx`
- CAP-05 (transforms): UI transform panel + derived traces (`apps/web/src/pages/PlotPage.tsx`, `apps/web/src/lib/transforms.ts`) + API `POST /datasets/{id}/derived`
- CAP-06 (differential): UI differential panel + derived traces (`apps/web/src/pages/PlotPage.tsx`, `apps/web/src/lib/transforms.ts`)

## Wiring map (minimum examples)

- UI: Library page
- Control: file input -> handler: `onPickFile()` -> API: `POST /ingest/preview`
- Control: Import -> handler: `onCommit()` -> API: `POST /ingest/commit`

- UI: Plot page
- Control: trace toggle -> handler: `onToggleDataset()` -> API: `GET /datasets` + `GET /datasets/{id}/data`

- UI: Plot page
- Control: show annotations toggle -> handler: `setShowAnnotations()` -> API: `GET /datasets/{id}/annotations`
- Control: add note/range -> handler: `onAddPoint()` / `onAddRange()` / `onAddRangeY()` -> API: `POST /datasets/{id}/annotations/point` / `POST /datasets/{id}/annotations/range-x` / `POST /datasets/{id}/annotations/range-y`

- UI: Plot page
- Control: apply transforms -> handler: `onApplyTransforms()` -> derived traces created in-session (non-destructive)
- Control: save derived -> handler: `onSaveDerivedToLibrary()` -> API: `POST /datasets/{id}/derived`

- UI: Plot page
- Control: compute differential -> handler: `onComputeDifferential()` -> logic: `differentialCompare()` (optionally `alignToTargetGrid()`) -> derived trace created in-session
