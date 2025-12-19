# CAP Roadmap — One CAP per dev cycle

This document turns the remaining **In progress** CAPs into a concrete, repeatable “one CAP per dev cycle” closeout plan.

The goal is not to implement every nice-to-have in each CAP; it’s to move a CAP from **In progress** → **Implemented (core)** by delivering a working end-to-end slice, with tests + documentation.

## Definition: “Implemented (core)” (used by this repo)

A CAP can be marked **Implemented (core)** when:

- The primary workflow(s) described in the CAP run end-to-end in the app (happy path).
- The UX surface is discoverable and non-duplicative (CAP-13 / CAP-12 rules).
- The data written is provenance-rich enough to be exportable (CAP-11) and debuggable (CAP-12 ethos).
- Repo verification passes: `scripts/verify.ps1`.
- Docs are updated:
  - Add a change record in `docs/changes/`.
  - Update `docs/CAP_PROGRESS_INVENTORY.md` with evidence + remaining gaps.

## Dev cycle template (repeat for each CAP)

1. **Pick the CAP + closeout scope**
   - Choose a minimal, testable “core” slice.
   - Explicitly list what is *not* being done this cycle.
2. **Write the change record first**
   - Create `docs/changes/YYYY-MM-DD_cap-XX_<short_slug>.md`.
   - Add “Acceptance checks” that map to CAP acceptance tests.
3. **Implement + wire UI**
   - Prefer extending existing patterns over new frameworks.
   - Keep the UX constrained: no duplicate controls.
4. **Add/extend tests**
   - API: pytest where endpoints/services changed.
   - Web: Vitest where UI contract or core flows changed.
5. **Run verification**
   - `scripts/verify.ps1`
6. **Update inventory**
   - Move CAP status to **Implemented (core)** if the core slice is truly done.
   - Otherwise keep **In progress**, but update evidence and shrink the remaining gap list.

---

## CAP-02 — Dataset library, metadata, and sharing

**Current state:** Core/MVP closeout complete (local-first metadata + collections + search/filter, dedupe prompting across import paths, audit trail). Sharing/permissions remain deferred.

**Core closeout scope (recommended)**

- Library UX that can scale beyond “scroll forever”:
  - Search bar + filters (at least: source type, file type, favorites, tags).
  - Tags (create/add/remove) and a minimal collection/folder concept.
  - Dataset detail drawer/panel with structured metadata editing (title/description/source/citation + units).
- Duplicate handling (minimum viable): content-hash duplicate detection with explicit user choice (open existing vs keep both).
- Audit trail (minimum viable, local-first): record key events (create/import, metadata edit, tag changes, delete).

**Out of scope for the CAP-02 closeout cycle**

- Multi-user auth, real group sharing/permissions enforcement, public publishing.

**Primary evidence (completed)**

- Change records:
  - `docs/changes/2025-12-19_cap-02_library_tags_dedupe_audit.md`
  - `docs/changes/2025-12-19_cap-02_collections_and_dedupe_reference_telescope.md`
- Inventory status + evidence: `docs/CAP_PROGRESS_INVENTORY.md`

**Acceptance checks to target (from CAP-02 spec)**

- CAP02-T01, T02, T03, T04, T05 (local-first subset).

**Risks / notes**

- CAP-02 is foundation for CAP-07/08/10/15. Keeping it local-first and file-backed (or SQLite) is fine, but the API contract should stay future-proof.

---

## CAP-07 — Reference sources, line lists, citation-first imports

**Current state:** URL-based JCAMP + line list import exists; NIST ASD typed-query → fetch → stick-line overlay exists; missing connector architecture and richer licensing/caching.

**Core closeout scope (recommended)**

- “Unified Add Reference Data” experience:
  - One panel with at least: **NIST ASD Lines** (typed query) + **Manual URL import**.
  - Always-visible citation box (source, retrieved_at).
- Connector abstraction (minimal but real):
  - Refactor current reference importers behind a connector registry interface (even if only 2 connectors exist at first).
- Cache/refresh:
  - “Refresh from source” that re-fetches and records a new retrieved_at (store prior versions).
- License gate (minimal):
  - Persist `redistribution_allowed` as Yes/No/Unknown.
  - Block “public export/share raw” if Unknown/No (even if CAP-02 sharing itself is deferred).

**Acceptance checks to target (from CAP-07 spec)**

- NIST ASD line list import + overlay with tooltips (core)
- Cache offline behavior for previously imported reference
- Refresh creates a new version

**Risks / notes**

- Avoid HTML scraping. Prefer stable CSV/tab output modes (already aligned).

---

## CAP-08 — Telescope/archive retrieval (MAST) and FITS spectra extraction

**Current state:** MAST search/list/download exists; FITS extraction for common 1D table products works; missing protected-token UX + 2D/3D product handling.

**Core closeout scope (recommended)**

- Make 1D “happy path” rock solid:
  - JWST/HST observation search → product list → download → extract 1D → plot → save to Library.
  - Clear provenance + citations stored.
  - Cache hit avoids re-download.
- Protected access UX (minimum viable):
  - Token input stored locally; clear messaging when required/invalid.
- Parsing report bundle for failures:
  - When extraction fails, retain raw + a structured report users can attach to issues.

**Out of scope for the CAP-08 closeout cycle**

- Full region-selection UI for cubes, time-series analysis.

**Acceptance checks to target (from CAP-08 spec)**

- CAP08-T01, T02, T03, T05, T06, T07 (token UX), T09 (parse report).

**Risks / notes**

- MAST reliability varies by environment; retries/backoff and actionable errors matter more than “perfect availability”.

---

## CAP-09 — Feature detection + identification assistance

**Current state:** Peak/dip detection exists; matching to imported line lists exists; conversion to annotations exists; missing band/range references and richer “confidence” UX.

**Core closeout scope (recommended)**

- Tighten and stabilize the existing feature workflow:
  - Detection results remain stable across UI changes.
  - Matching shows explicit tolerance window and an explainable score breakdown.
  - “Convert to annotation” produces a citation-bearing, non-overconfident label.
- Reference-source integration:
  - Make the CAP-07 NIST ASD fetch usable directly as a reference for matching (no extra import steps).

**Out of scope for the CAP-09 closeout cycle**

- Built-in functional group tables unless they are sourced from curated references.

**Acceptance checks to target (from CAP-09 spec)**

- CAP09-T01..T05, T07, T08, T09.

---

## CAP-10 — Session notebook, history, and collaboration workspaces

**Current state:** Session MVP exists (create/list/notes/timeline; auto-log key actions). Missing robust restore fidelity, sharing summary, and “support bundle” UX.

**Core closeout scope (recommended)**

- Restore fidelity:
  - Re-open a session restores plot state (datasets, visible traces, transforms, derived traces, annotations visibility).
- Timeline completeness:
  - Ensure all core actions create structured timeline events with parameters (imports/transforms/differential/feature detect/match/export).
- Support bundle (minimum viable):
  - “Create support bundle” that packages session + events + pointers and redacts credentials.

**Out of scope for the CAP-10 closeout cycle**

- Real-time collaboration editing.

**Acceptance checks to target (from CAP-10 spec)**

- CAP10-T01..T04, T08.

---

## CAP-13 — UI design system, themes, and interaction rules

**Current state:** Tokenized dark theme + base controls + tabification/collapsibles exist; missing light theme/theme switch and continued reduction of inline overrides.

**Core closeout scope (recommended)**

- Theme switcher:
  - Dark + Light themes, persisted per user (local storage is fine for now).
- Accessibility basics:
  - Visible focus styles, minimum contrast sanity pass for both themes.
- Interaction rules enforcement:
  - Remove/avoid duplicate controls for the same workflow.
  - Replace the remaining inline style overrides that break global theming.

**Acceptance checks to target (from CAP-13 spec)**

- CAP13-T01, T04, T07.

---

## CAP-15 — Target search, name resolution, and query builder

**Current state:** MAST-only query builder + name resolution slice exists; global search is nav + dataset cache only; missing multi-entity results, entity cards, presets.

**Core closeout scope (recommended)**

- Global search that actually routes work:
  - Targets (at least: telescope targets via name→coord resolution)
  - Local datasets
  - Saved searches/presets
- Query presets:
  - Save/re-run MAST searches (local-first).
- Entity card MVP:
  - A minimal Target Card with canonical name, aliases (if known), resolved coordinates, provenance, and “search MAST / search references” actions.

**Acceptance checks to target (from CAP-15 spec)**

- CAP15-T01, T02, T03 (disambiguation), T05, T06, T07 (offline behavior).

---

## Suggested CAP closeout order

If the goal is “wrap the remaining CAPs with the least thrash”, a pragmatic order is:

1. **CAP-02** (unblocks everything else)
2. **CAP-07** (reference connectors + refresh + license gate)
3. **CAP-09** (finish the assistance loop using CAP-07 sources)
4. **CAP-15** (front door + presets; ties into 07/08)
5. **CAP-10** (session restore + support bundles)
6. **CAP-08** (harden + token UX + parse reports)
7. **CAP-13** (light theme + cleanup; can also be done earlier if desired)

If you want a different priority (e.g., telescope-first), we can reorder while keeping the same dev-cycle template.
