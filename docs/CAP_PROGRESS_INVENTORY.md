# CAP Progress Inventory (repo scan)

Date: 2025-12-17

This is a repo-wide inventory mapping each CAP spec in `docs/CAPS/` to the current implementation state in `apps/api`, `apps/web`, tests, and supporting docs.

## Status legend

- **Implemented (core)**: the primary workflow is working end-to-end (may still have gaps vs full CAP).
- **In progress**: meaningful code exists, but key parts of the CAP are missing or not yet wired.
- **Not started**: no meaningful implementation beyond placeholders.

## Rollup

| CAP | Title (short) | Status |
| --- | --- | --- |
| CAP-01 | Dataset ingestion + parsing | Implemented (core) |
| CAP-02 | Dataset library + metadata + sharing | In progress |
| CAP-03 | Plot overlays + trace management | Implemented (core) |
| CAP-04 | Notes/labels + region highlights | Implemented (core) |
| CAP-05 | Normalization + unit display + transforms | Implemented (core) |
| CAP-06 | Differential A−B / A/B | Implemented (core) |
| CAP-07 | Reference sources + line lists + citation-first imports | In progress |
| CAP-08 | Telescope/archive retrieval (MAST) + FITS extraction | In progress |
| CAP-09 | Feature detection + identification assistance | In progress |
| CAP-10 | Session notebook + history + workspaces | Not started |
| CAP-11 | Exports + reproducible bundles | Implemented (core) |
| CAP-12 | Quality gates + regression prevention | Implemented (core) |
| CAP-13 | UI design system + interaction rules | In progress |
| CAP-14 | In-app documentation + reference hub | Implemented (core) |
| CAP-15 | Target search + name resolution + query builder | In progress |

---

## CAP-01 — Dataset ingestion and parsing

**Status:** Implemented (core)

**What’s working now**
- Ingest preview (no hidden transforms) and ingest commit flows.
- Format handling: delimited text, JCAMP-DX, FITS.
- Messy-header/preamble capture and metadata extraction for delimited text ingest.
- Basic trust warnings (missing units, non-monotonic X) and monotonic decreasing auto-reversal to canonical plotting.

**Primary evidence**
- API endpoints + orchestration: `apps/api/app/main.py`
- Preview + delimited parsing: `apps/api/app/ingest_preview.py`
- FITS extraction: `apps/api/app/fits_parser.py`
- JCAMP-DX parsing: `apps/api/app/jcamp_dx.py`
- Web ingest UI: `apps/web/src/pages/LibraryPage.tsx`
- API tests: `apps/api/tests/test_ingest_preview.py`, `apps/api/tests/test_ingest_commit_and_list.py`

**Not yet / gaps vs full CAP**
- Broad acceptance test matrix (many formats/instruments) is not formalized as a suite.
- No checksum-based dedupe or conflict UX (beyond SHA storage).
- No dedicated UI for “ingest decisions” beyond what preview returns.

---

## CAP-02 — Dataset library, metadata, and sharing

**Status:** In progress

**What’s working now**
- Local-first dataset storage (raw bytes + `dataset.json`) with listing + detail APIs.
- Minimal “trust-first” reference summary exposed in dataset list (for CAP-07/CAP-08 imports).

**Primary evidence**
- Dataset storage + list/detail: `apps/api/app/datasets.py`
- Dataset endpoints: `apps/api/app/main.py`
- Web listing usage: `apps/web/src/pages/LibraryPage.tsx`, `apps/web/src/pages/PlotPage.tsx`

**Not yet / gaps vs full CAP**
- Metadata editing UI (units/title/tags/collections), search/filter beyond simple text filter in plot view.
- Sharing/permissions/audit trail (CAP-02’s full policy surface).
- Dedupe rules and explicit dataset versioning semantics.

---

## CAP-03 — Interactive plotting, overlays, and trace management

**Status:** Implemented (core)

**What’s working now**
- Multi-trace overlay plotting with a docked trace list and stable visibility toggles.
- Robustness helpers (finite coercion, error boundary) to reduce render crashes.
- Trace grouping concept exists (original vs derived) in the UI.

**Primary evidence**
- Plot/workbench: `apps/web/src/pages/PlotPage.tsx`
- Plot tests: `apps/web/src/pages/PlotPage.test.tsx`

**Not yet / gaps vs full CAP**
- Persistent workspaces / plot state persistence (ties into CAP-10).
- Performance features like decimation controls and large-trace ergonomics.

---

## CAP-04 — Notes, labels, and region highlights

**Status:** Implemented (core)

**What’s working now**
- Dataset annotations API: list/create/update/delete.
- Two annotation types: point notes and X-range highlights.
- Plot overlay + toggle to show/hide annotations.

**Primary evidence**
- Annotation model + persistence: `apps/api/app/annotations.py`
- Annotation endpoints: `apps/api/app/main.py`
- Plot UI for create/list/toggle: `apps/web/src/pages/PlotPage.tsx`
- API tests: `apps/api/tests/test_annotations.py`

**Not yet / gaps vs full CAP**
- Rich region highlight types (2D boxes/polygons), filtering/tagging of annotations.
- Deeper export contract integration (some export is present via CAP-11, but not the full CAP-04 schema).

---

## CAP-05 — Normalization, unit display, and transform pipeline

**Status:** Implemented (core)

**What’s working now**
- Non-destructive transforms in the plot view: normalization, baseline correction, smoothing.
- X unit display conversion among common spectral units.
- Derived traces include a provenance record and can be saved to the Library as derived datasets.

**Primary evidence**
- Transform library: `apps/web/src/lib/transforms.ts`
- Transform UI + provenance + “save derived”: `apps/web/src/pages/PlotPage.tsx`
- Derived dataset API: `apps/api/app/main.py`
- API test: `apps/api/tests/test_cap05_derived_save.py`

**Not yet / gaps vs full CAP**
- Full transform “pipeline editor” UX and durable transform stacks for sessions.
- Wider transform catalog (resampling UX beyond what CAP-06 uses, etc.).

---

## CAP-06 — Differential comparison (A−B and A/B)

**Status:** Implemented (core)

**What’s working now**
- A/B + A−B with explicit A and B selectors.
- Locking A/B and swapping A↔B.
- Overlap-only compare, optional explicit alignment (resampling) with labeled provenance.
- Ratio safety handling via masking near-zero denominators.

**Primary evidence**
- Differential math + alignment + ratio masking: `apps/web/src/lib/transforms.ts`
- Differential panel + derived trace provenance: `apps/web/src/pages/PlotPage.tsx`

**Not yet / gaps vs full CAP**
- More ratio handling options (epsilon stabilize, clamp) and richer unit-consistency gating.
- Dedicated tests for differential math edge cases (currently mostly UI-level coverage).

---

## CAP-07 — Reference sources, line lists, citation-first imports

**Status:** In progress

**What’s working now**
- Citation-first reference imports by URL:
  - JCAMP-DX reference spectra
  - Line list CSV/tab data
- Reference metadata persisted with datasets (source URL, retrieved_at, citation, basic license/sharing defaults).

**Primary evidence**
- API import endpoints: `apps/api/app/main.py`
- Reference import implementation: `apps/api/app/reference_import.py`
- Web UI for reference imports: `apps/web/src/pages/LibraryPage.tsx`
- API tests: `apps/api/tests/test_cap07_reference_import_jcamp.py`, `apps/api/tests/test_cap07_reference_import_line_list_csv.py`

**Not yet / gaps vs full CAP**
- Pluggable connector architecture with “search + import” (NIST/HITRAN/ExoMol, etc.).
- Cache invalidation (“refresh from source”) and richer license gating.

---

## CAP-08 — Telescope/archive retrieval (MAST) and FITS spectra extraction

**Status:** In progress

**What’s working now**
- MAST helpers:
  - Name lookup → coordinates
  - CAOM search with filters
  - Product listing for an observation
- Download + cache of MAST product bytes (by `dataURI`) and FITS preview/import (table HDU extraction).
- Citation-first dataset creation for telescope imports (restrictive sharing by default).

**Primary evidence**
- MAST client + caching: `apps/api/app/mast_client.py`
- MAST service wrappers: `apps/api/app/telescope_mast.py`
- FITS preview/import (URL and dataURI): `apps/api/app/telescope_import.py`
- Web UI (MAST search + product selection + preview/import): `apps/web/src/pages/LibraryPage.tsx`
- API tests: `apps/api/tests/test_cap08_mast_endpoints.py`, `apps/api/tests/test_cap08_telescope_fits_by_url.py`

**Not yet / gaps vs full CAP**
- Support for 2D/3D products (rectified spectra and cubes) and region selection.
- Token management UX (secure storage) for protected products.

---

## CAP-09 — Feature detection and identification assistance

**Status:** In progress

**What’s working now**
- Local peak/dip detection with basic controls (prominence threshold, minimum separation).
- Rendering detected features on the plot + results table.
- Matching workflow to imported reference datasets (line lists) and conversion of matches/features into annotations.
- Export includes optional features/matches artifacts when provided.

**Primary evidence**
- Feature detection algorithm: `apps/web/src/lib/featureDetection.ts`
- Feature/match UI + annotation conversion: `apps/web/src/pages/PlotPage.tsx`
- Export bundle includes features/matches: `apps/api/app/export_bundle.py`

**Not yet / gaps vs full CAP**
- Reference-source connectors for line lists (CAP-07 integration beyond manual import).
- Band/range references (functional group tables) with citation-first sourcing.
- More explicit scoring breakdowns and confidence UX.

---

## CAP-10 — Session notebook, history, and collaboration workspaces

**Status:** Not started

**What’s present**
- Placeholder page only.

**Primary evidence**
- Placeholder UI: `apps/web/src/pages/NotebookPage.tsx`

---

## CAP-11 — Exports, reproducible bundles, and “What I did” reports

**Status:** Implemented (core)

**What’s working now**
- Export “what I see” ZIP from the current plot state (data + plot snapshot + manifest + checksums).
- Export a single dataset as a reproducible ZIP.
- Annotations and citation pointers are included where available.

**Primary evidence**
- Export bundle builder: `apps/api/app/export_bundle.py`
- Export endpoints: `apps/api/app/main.py`
- Plot export UI: `apps/web/src/pages/PlotPage.tsx`
- API tests: `apps/api/tests/test_export_bundle.py`, `apps/api/tests/test_export_what_i_see.py`

**Not yet / gaps vs full CAP**
- Image/PDF export (plot rendering to PNG/SVG/PDF).
- Session report PDF (depends on CAP-10 session model).
- Support bundle UX and redaction guarantees.

---

## CAP-12 — Quality gates, regression prevention, and agent discipline

**Status:** Implemented (core)

**What’s working now**
- `scripts/verify.ps1` runs API lint/format/tests, exports OpenAPI, runs web lint/tests, regenerates api-client.
- UI contract JSON exists for nav affordances.

**Primary evidence**
- Verify script: `scripts/verify.ps1`
- UI contract: `docs/ui_contract.json`
- OpenAPI export script: `apps/api/scripts/export_openapi.py`

**Not yet / gaps vs full CAP**
- A dedicated UI contract verifier script (the contract exists, but verification is not yet enforced in `verify.ps1`).
- Automated “smoke workflow” suite (CAP-12 S01–S10) beyond unit tests.

---

## CAP-13 — UI design system, themes, and interaction rules

**Status:** In progress

**What’s working now**
- Three-column shell layout with collapsible Library + Inspector panels.
- State persistence for panel collapse state via `localStorage`.

**Primary evidence**
- App shell layout: `apps/web/src/App.tsx`
- Panel slot plumbing: `apps/web/src/layout/panelSlotsContext.ts`, `apps/web/src/layout/PanelSlots.tsx`

**Not yet / gaps vs full CAP**
- Theme system (dark/light tokens) and consistent component styling (currently mostly inline styles).
- Accessibility/contrast enforcement and a true design-token layer.

---

## CAP-14 — In-app documentation, onboarding, and reference hub

**Status:** Implemented (core)

**What’s working now**
- In-app Docs hub with search + categories.
- Imports and renders local markdown (agent docs, glossary, reference hub) and all CAP specs.

**Primary evidence**
- Docs UI: `apps/web/src/pages/DocsPage.tsx`
- Docs content: `docs/README_FOR_AGENTS.md`, `docs/reference/glossary.md`, `docs/references/REFERENCE_LINKS.md`

**Not yet / gaps vs full CAP**
- Contextual “learn more” wiring from individual controls to specific doc anchors.
- User-facing shortened CAP pages (currently the full CAP specs are displayed).

---

## CAP-15 — Target search, name resolution, and query builder

**Status:** In progress

**What’s working now**
- A MAST-focused slice of name resolution and query building exists inside the Library UI.
- Name lookup is explicit and does not silently pick a target.

**Primary evidence**
- MAST name lookup endpoint: `apps/api/app/telescope_mast.py`
- MAST client: `apps/api/app/mast_client.py`
- Web query builder (MAST-only): `apps/web/src/pages/LibraryPage.tsx`

**Not yet / gaps vs full CAP**
- Global search bar with multi-entity results (targets/molecules/instruments/local datasets).
- Canonical entity cards, alias handling, query presets, offline cache UX.

---

## Cross-CAP notes / known issues

- The MAST “name lookup failed” issue observed in screenshots remains an open operational issue (likely environment/network or upstream API behavior); the API and UI plumbing exists, but it may require configuration and retry/backoff tuning.
