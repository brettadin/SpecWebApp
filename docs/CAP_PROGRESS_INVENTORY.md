# CAP Progress Inventory (repo scan)

Date: 2025-12-19

This is a repo-wide inventory mapping each CAP spec in `docs/CAPS/` to the current implementation state in `apps/api`, `apps/web`, tests, and supporting docs.

## Status legend

- **Implemented (core)**: the primary workflow is working end-to-end (may still have gaps vs full CAP).
- **In progress**: meaningful code exists, but key parts of the CAP are missing or not yet wired.
- **Not started**: no meaningful implementation beyond placeholders.

## Rollup

| CAP | Title (short) | Status |
| --- | --- | --- |
| CAP-01 | Dataset ingestion + parsing | Implemented (core) |
| CAP-02 | Dataset library + metadata + sharing | Implemented (core/MVP) |
| CAP-03 | Plot overlays + trace management | Implemented (core) |
| CAP-04 | Notes/labels + region highlights | Implemented (core) |
| CAP-05 | Normalization + unit display + transforms | Implemented (core) |
| CAP-06 | Differential A−B / A/B | Implemented (core) |
| CAP-07 | Reference sources + line lists + citation-first imports | In progress |
| CAP-08 | Telescope/archive retrieval (MAST) + FITS extraction | In progress |
| CAP-09 | Feature detection + identification assistance | In progress |
| CAP-10 | Session notebook + history + workspaces | In progress |
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
- FITS ingest recognizes common filename variants (e.g., `.fts`, `.fits.gz`).
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
- No dedicated UI for “ingest decisions” beyond what preview returns.

---

## CAP-02 — Dataset library, metadata, and sharing

**Status:** Implemented (core/MVP)

**MVP closeout note**
- This CAP is considered “core/MVP implemented” as a local-first library: metadata editing, basic organization (collections/tags/favorites), duplicate prompting (no silent overwrites/duplicates), and an audit trail.
- Full multi-user sharing/permissions/workspaces are explicitly deferred (tracked under “Not yet / gaps vs full CAP”).

**What’s working now**
- Local-first dataset storage (raw bytes + `dataset.json`) with listing + detail APIs.
- Dataset metadata editing (rename + X/Y units + description + tags + favorite) via `PATCH /datasets/{dataset_id}` and the Library dataset editor.
- Collections/folders metadata (`collections`) with Library editing + filtering.
- Duplicate detection (content hash / SHA-256) with explicit choice (use existing vs keep both) across:
  - local ingest (`POST /ingest/commit`)
  - reference imports (CAP-07)
  - telescope imports (CAP-08)
- Minimal local-first audit trail per dataset (`GET /datasets/{dataset_id}/audit`).
- Tag aggregation endpoint for simple filtering UX (`GET /tags`).
- Minimal “trust-first” reference summary exposed in dataset list (for CAP-07/CAP-08 imports).

**Primary evidence**
- Dataset storage + list/detail: `apps/api/app/datasets.py`
- Dataset endpoints: `apps/api/app/main.py`
- CAP-02 tests: `apps/api/tests/test_cap02_dedup_tags_audit.py`
- Web Library dataset editor + search: `apps/web/src/pages/LibraryPage.tsx`
- Change records:
  - `docs/changes/2025-12-19_cap-02_library_tags_dedupe_audit.md`
  - `docs/changes/2025-12-19_cap-02_collections_and_dedupe_reference_telescope.md`

**Not yet / gaps vs full CAP**
- Rich metadata editing UI (notes), search/filter beyond simple text filter in plot view.
- Dataset list organization/hygiene UX (e.g., tabs/sections, collapse, “recent vs all”, hide/archive) to avoid scrolling through large libraries.
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
- Citation-first reference imports:
  - JCAMP-DX reference spectra (URL-based import)
  - Line list CSV/tab data (URL-based import)
  - NIST ASD line lists fetched from typed query inputs (no user-supplied URL) and rendered as stick-line overlays in the Plot inspector UI.
- Reference metadata persisted with datasets (source URL when applicable, retrieved_at, citation, basic license/sharing defaults).
- CAP-02 duplicate prompting is supported on reference import endpoints (use existing vs keep both).

**Primary evidence**
- API import endpoints: `apps/api/app/main.py`
- Reference import implementation: `apps/api/app/reference_import.py`
- NIST ASD import endpoint: `POST /references/import/nist-asd-line-list` in `apps/api/app/main.py`
- Web UI for reference imports: `apps/web/src/pages/LibraryPage.tsx`
- Web UI for typed NIST ASD fetch + overlay controls: `apps/web/src/pages/PlotPage.tsx`
- API tests: `apps/api/tests/test_cap07_reference_import_jcamp.py`, `apps/api/tests/test_cap07_reference_import_line_list_csv.py`

**Not yet / gaps vs full CAP**
- Pluggable connector architecture with “search + import” (NIST WebBook search, HITRAN/ExoMol, etc.) and a unified “Add Reference Data” panel.
- Periodic-table + ion-stage selector UX for atomic lines (current NIST ASD flow is typed-query driven).
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
- CAP-02 duplicate prompting is supported on telescope import endpoints (use existing vs keep both).

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

**Status:** In progress

**What’s present**
- Local-first session notebook MVP:
  - Create and list sessions.
  - Add freeform note events.
  - View a simple event timeline in the Notebook panel.
  - Mark a session as “active” and auto-log key actions (imports, derived saves, exports, annotations, differential, transforms, feature detection).

**Primary evidence**
- API storage + models: `apps/api/app/sessions.py`
- API endpoints: `apps/api/app/main.py`
- Notebook panel UI: `apps/web/src/pages/NotebookPage.tsx`
- Session logging helper: `apps/web/src/lib/sessionLogging.ts`
- API tests: `apps/api/tests/test_cap10_sessions.py`

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
- UI contract JSON exists for nav affordances and is enforced in web tests.

**Primary evidence**
- Verify script: `scripts/verify.ps1`
- UI contract: `docs/ui_contract.json`
- Contract enforcement test: `apps/web/src/App.test.tsx`
- OpenAPI export script: `apps/api/scripts/export_openapi.py`

**Not yet / gaps vs full CAP**
- Automated “smoke workflow” suite (CAP-12 S01–S10) beyond unit tests.

---

## CAP-13 — UI design system, themes, and interaction rules

**Status:** In progress

**What’s working now**
- Three-column shell layout with collapsible Library + Inspector panels.
- State persistence for panel collapse state via `localStorage`.
- Tokenized theme layer and baseline component styling via a shared CSS variables file.
- Consistent base visuals for `input/select/textarea/button` and styled disclosure blocks (`details/summary`).
- App shell polish (nav pills, subtle header translucency/shadow) using theme tokens.

**Primary evidence**
- App shell layout: `apps/web/src/App.tsx`
- Panel slot plumbing: `apps/web/src/layout/panelSlotsContext.ts`, `apps/web/src/layout/PanelSlots.tsx`
- Theme tokens + base styling: `apps/web/src/styles/scientific_theme.css`
- Theme import entrypoint: `apps/web/src/main.tsx`

**Not yet / gaps vs full CAP**
- Light theme (or user-selectable theme switching) and formal contrast/accessibility checks.
- Continued reduction of inline style overrides in favor of a small set of shared primitives/classes.

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
- CAP-15 guardrails for target resolution in the MAST flow:
  - Coordinate input detection (RA/Dec degrees) bypasses name lookup.
  - Name lookup results are cached locally and can be used as an offline fallback.
  - Ambiguous name lookups require an explicit user pick (no silent “first result” selection).
- Global search bar MVP in the top navigation:
  - Quick navigation to core pages.
  - Searches cached local datasets by name/id (offline/test-safe).
- Global search → MAST handoff (CAP-15 bridge):
  - Target actions in the global search can populate the Library MAST query builder via URL params.
  - The MAST search can auto-run once per token (`mastToken`) to avoid repeated triggering.

**Primary evidence**
- MAST name lookup endpoint: `apps/api/app/telescope_mast.py`
- MAST client: `apps/api/app/mast_client.py`
- Web query builder (MAST-only): `apps/web/src/pages/LibraryPage.tsx`
- Target resolution helper: `apps/web/src/lib/targetResolution.ts`
- Global search bar: `apps/web/src/App.tsx`
- Dataset cache helper: `apps/web/src/lib/datasetCache.ts`

**Not yet / gaps vs full CAP**
- Global search bar with multi-entity results (targets/molecules/instruments/local datasets).
- Canonical entity cards, alias handling, query presets, offline cache UX.

---

## Cross-CAP notes / known issues

- The MAST “name lookup failed” issue observed in screenshots remains an open operational issue (likely environment/network or upstream API behavior); the API and UI plumbing exists, but it may require configuration and retry/backoff tuning.
