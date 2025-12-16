**CAP-10 - Session Notebook, History, and Collaboration Workspaces**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-10 defines the app's 'clean lab notebook' experience: a session model that records what you did, why you did it, and what data it touched-without turning the app into a cluttered workflow tool. A Session is a structured, saveable notebook that captures datasets used (CAP-02), plot state (CAP-03), annotations (CAP-04), transforms (CAP-05), differential outputs (CAP-06), reference/telescope imports (CAP-07/08), and identification assistance outputs (CAP-09). Sessions can be private, shared with a group/class, or shared as 'pointers only' when licensing requires it.

# 2\. User outcomes (success criteria)

- I can start a new session, add datasets, annotate, transform, compare, and later reopen the session exactly as it was.
- The notebook helps me stay organized without forcing me to write a lot of text.
- The app automatically logs key actions (imports, transforms, A−B/A/B, matching) so I don't have to remember steps.
- I can add quick notes (plain text) and attach them to a dataset, trace, or plot region.
- I can share a session with a class/group; others can open it and reproduce the same view and steps (subject to license gates).
- I can export a session report (CAP-11) that includes plots, citations, and a 'what I did' timeline.

# 3\. In scope / Out of scope

## In scope

- Session entity (save/open/duplicate) + versioned state snapshots.
- Notebook entries (notes, plot snapshots, dataset links, analysis step summaries).
- Automatic action timeline (structured log of operations).
- Workspace model: Personal vs Group/Class workspaces with permission-aware sharing.
- Reproducibility rules: restore plot + selected traces + applied transforms + derived outputs + citations.
- Bug-report / 'share with agent' bundles (session + logs + selected raw payload pointers).

## Out of scope (for CAP-10)

- General 'social network' features (likes, comments, feeds).
- Live multi-user collaborative editing of the same session (real-time).
- Full role-based access control beyond simple roles needed for class/group sharing (Admin/Editor/Viewer).
- Export formats themselves (CAP-11) - CAP-10 defines what the report must be able to include.

# 4\. Core principles

- Notebook-first but low-friction: the app logs actions automatically; user adds optional short notes.
- Non-destructive: sessions reference immutable datasets and derived traces; they do not mutate originals.
- Trust badges: the session must clearly indicate if a step used interpolation/resampling or other synthetic operations (CAP-05/06).
- License-aware: sessions can be shared even when raw files cannot; 'pointers only' must be supported (CAP-02/07/08).
- Never-reset essentials: user identity, loaded datasets, and active plot should not reset unless user explicitly clears/ends session.

# 5\. Session model (what a session is)

## Definition

- A Session is a saved record containing:
- links to datasets used (by dataset_id, checksum, and version)
- plot/trace configuration (what was shown, which traces were active, styling choices)
- analysis timeline (ordered events)
- user notes and annotations
- citations and source links for any non-local data
- app version + schema versions so sessions are reproducible across updates

## Session lifecycle (minimum)

- Create: new session with a title + optional short goal statement (1 line).
- Work: add datasets, plot, annotate, transform, compare; timeline auto-records key actions.
- Save: explicit save plus autosave checkpoints.
- Reopen: load session and restore plot + notebook + dataset references.
- Duplicate: clone session into a new session (useful for 'what-if' branches).
- Share: publish to a group/class workspace with a clear license gate summary.

# 6\. Notebook entries (user-visible notes)

## Entry types (minimum)

| **Entry type** | **What it contains** | **Typical use** |
| --- | --- | --- |
| Quick note | Short text + optional tags | 'Observed CH4 bands near …'; 'Need higher resolution' |
| Plot snapshot | Rendered image + link to plot state | Capture a moment for a report or professor |
| Dataset link | Pointer to dataset_id + metadata preview | Record which references/lab runs were used |
| Step summary | Auto-generated short summary of an operation | 'Applied max normalization'; 'Computed A/B' |
| Annotation bundle | Links to CAP-04 notes/highlights used | Keep labels with narrative context |
| Match evidence | Links to CAP-09 matches + citations | Keep likely IDs with evidence and thresholds |

## Entry behaviors

- Entries must be reorderable (drag) but the action timeline remains chronological.
- Entries can be pinned (always visible at top) - useful for goals and conclusions.
- Entries can be linked to objects: dataset, trace, annotation, match result, export artifact.

# 7\. Action timeline (automatic history)

## What gets logged (minimum)

- Dataset ingest/import (CAP-01) and dataset library operations (CAP-02).
- Reference source import and telescope/archive downloads (CAP-07/08).
- Plot actions that materially change interpretation: trace add/remove, normalization/transform apply, differential compute, masking thresholds changed.
- Feature detection/matching runs (CAP-09) including tolerance, filters, and reference dataset used.
- Save/share/export actions (CAP-02/11).

## What does NOT need to be logged (avoid noise)

- Simple zoom/pan actions (unless user makes a 'Save view as snapshot' entry).
- Hover events, tooltip reads, minor UI layout changes.

## Structured event schema (minimum fields)

| event_id | UUID |
| --- | --- |
| session_id | UUID |
| timestamp | ISO-8601 |
| event_type | ingest \| import_reference \| import_telescope \| plot_change \| transform \| differential \| feature_detect \| match \| annotation \| share \| export |
| actor | user_id or 'system' |
| inputs | object references (dataset_id, trace_id, reference_dataset_id, etc.) |
| parameters | JSON object capturing user-chosen settings |
| outputs | object references (derived_trace_id, match_ids, annotation_ids, export_id) |
| trust_flags | e.g., interpolated=true, masked_ratio=true |
| citations | list of citation pointers (URLs/DOIs) when applicable |

# 8\. Workspace model (personal + group/class)

## Workspace types

- Personal workspace: default; sessions and datasets are private.
- Group/Class workspace: shared library + shared sessions; controlled membership.
- Public workspace (optional later): read-only publishing; only allowed for datasets where license permits redistribution.

## Roles (minimum)

| **Role** | **Can do** | **Notes** |
| --- | --- | --- |
| Owner | All actions; manage sharing; delete session | Typically the creator |
| Editor | Modify notebook entries; add notes; create derived traces within session | May be limited by dataset licenses |
| Viewer | Open and view session; run 'reproduce view' | Cannot change canonical session unless allowed |

## Sharing policy integration (CAP-02/07/08)

- When sharing a session, show a 'Sharing Summary' panel: which datasets will be included as raw vs pointers-only vs blocked.
- If any included dataset is license-restricted, default to pointers-only for that dataset.
- A session can always be shared as 'steps + citations + pointers' even if raw payloads cannot be redistributed.

# 9\. Reproducibility and stability requirements

## Restore rules

- Opening a session must restore:
- which datasets/traces were loaded
- which traces were visible
- which transforms were applied (CAP-05) and their parameters
- which differential outputs exist (CAP-06) and how they were computed
- annotations/labels/highlights (CAP-04) and their visibility toggles
- reference/telescope provenance (CAP-07/08) and citations

## Versioning rules

- Each session must record: app_version, schema_version, and connector_versions (CAP-07/08 connectors) so older sessions can be interpreted.
- Breaking changes must provide a migration step (best effort): older sessions open with a visible 'Migrated' notice and a diff summary.

# 10\. UI requirements (minimal, non-annoying)

## Notebook panel layout (recommended)

- Left pane: Session Notebook + Timeline tabs.
- Main pane: Plot/workbench (CAP-03).
- Right pane (optional): Selected object inspector (dataset metadata, annotation details, match evidence).

## Controls (minimum)

- Session toolbar: New, Save, Duplicate, Share, Export report (CAP-11).
- Quick note button: adds a text entry at current time.
- Snapshot button: saves a plot image + state as a notebook entry.
- Timeline filter: show only events of a type (Transforms only, Differential only, Imports only).

## Never-reset items (explicit)

- User login/session identity must persist across view changes.
- Trace A/B selections (CAP-06) must not reset when other UI controls change.
- Current session context must remain active unless user explicitly closes it.

# 11\. Storage (implementation guidance, not mandates)

## Recommended persistence approach

- Store the session notebook and timeline as structured records (DB or files).
- Store action events in an append-only format to avoid corruption and to support streaming/syncing.

## Suggested file formats for portability

- session.json: high-level session metadata and references.
- events.jsonl (JSON Lines): append-only event stream (one event per line).
- notes.json: notebook entries (or embed in session.json).
- snapshots/: plot images and small preview assets.

## Optional interoperability targets (not required for v1)

- W3C PROV concepts can be mapped onto events (entity/activity/agent) for future provenance export.
- Jupyter notebook format can be an export option later if you want 'lab notebook' portability beyond the app.

# 12\. Error handling and support bundles

- If the app errors during parsing/import/plotting, it must offer 'Create support bundle'.
- Support bundle includes: session.json, events.jsonl, last N log lines, and pointers (not necessarily copies) to raw payloads.
- Support bundle must redact credentials/tokens (CAP-08 auth).

# 13\. Acceptance tests (definition of done)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP10-T01 | Create new session and add two datasets | Session saved; datasets referenced; reopen restores state |
| CAP10-T02 | Add annotations and notebook notes | Notes persist; annotation links work; toggles restore |
| CAP10-T03 | Apply normalization and baseline correction (CAP-05) | Timeline logs transform with parameters; restore reproduces |
| CAP10-T04 | Compute A/B with masking threshold (CAP-06) | Timeline logs operation and threshold; restore reproduces output |
| CAP10-T05 | Import NIST reference + JWST product (CAP-07/08) | Citations and retrieval timestamps captured; cache pointers stored |
| CAP10-T06 | Share session to Group workspace with restricted dataset | Sharing summary shows pointers-only; no raw export leakage |
| CAP10-T07 | Export report from session (CAP-11) | Report includes session summary + timeline + citations + plot snapshots |
| CAP10-T08 | Generate support bundle after an error | Bundle created; credentials redacted; enough info to reproduce |

# 14\. Questions to ask you (feature-level, no coding required)

- Do you want sessions to autosave by default (recommended), or only on manual save?
- When you reopen a session, should it restore the exact plot view (zoom/range), or just the datasets and traces?
- For class/group workspaces: should students be able to edit each other's sessions, or only view + duplicate?
- Do you want a 'session template' feature (pre-loaded references, notes structure), or keep it simple for now?
- How much narrative do you want the app to auto-generate in the notebook (very short vs more descriptive)?

# Appendix A. Project reference links (MUST consult)

You stated the repo contains a curated suite of reference links. Agents must consult it before implementing sharing rules, provenance/citation formats, and any 'what I did' report wording. This CAP includes tooling references, but the project's link suite is the single source of truth for project policy.

Recommended single source of truth path (update to match your repo): docs/references/REFERENCES_RAW.md

# Appendix B. External references used in this CAP (tooling)

- W3C PROV-DM (provenance data model concepts: entity/activity/agent; supports interchange).
- Jupyter notebook format (JSON schema-defined notebook structure; optional future interoperability).
- JSON Lines (newline-delimited JSON) - practical format for append-only event logs.
- OpenTelemetry Logs Data Model (vendor-neutral structured log record conventions).
- W3C PROV-DM: <https://www.w3.org/TR/prov-dm/>
- Jupyter nbformat format description: <https://nbformat.readthedocs.io/en/latest/format_description.html>
- JSON Lines: <https://jsonlines.org/>
- OpenTelemetry Logs Data Model: <https://opentelemetry.io/docs/specs/otel/logs/data-model/>