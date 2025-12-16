**CAP-11 - Exports, Reproducible Bundles, and 'What I Did' Reports**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-11 defines how the Spectra App exports trustworthy artifacts a professor, teammate, or future-you can trust: plot images, plotted data, raw original files (when allowed), citations/links, app versioning, checksums, and a concise 'what I did' summary. CAP-11 is designed to be license-aware (CAP-02/07/08), provenance-first, and reproducible across time.

# 2\. User outcomes (success criteria)

- I can export exactly what I'm looking at (the current plot) with a clean title, labeled axes, and readable legend.
- I can export the plotted data (not just screenshots) in CSV and/or JSON with units and metadata included.
- I can include the original raw file(s) when permitted, or export pointers-only when redistribution is restricted.
- I always get a short 'what I did' summary + timeline that matches the actual operations performed (transforms, A−B/A/B, matching).
- Every export contains citations/links and retrieval timestamps for any reference or telescope data.
- Exports are packaged cleanly (zip/folder) with a single manifest that explains everything.

# 3\. In scope / Out of scope

## In scope

- Export types and UI, including: plot images, plotted data, raw files, manifests, and session reports.
- Naming conventions and deterministic folder structure for bundles.
- Manifest schema (minimum fields) for reproducibility and auditing.
- License/sharing gates for including raw content.
- Checksums, version stamping, and trace lineage summaries.

## Out of scope (for CAP-11)

- Full publishing workflows (site-wide galleries) - export is local artifact generation.
- Long narrative writing (multi-page lab reports) - export summary remains concise and factual.
- Automated citation formatting into every possible style (ACS/APA/etc.) - the app stores citation text and links; formatting styles can be added later.

# 4\. Export types (what the app must support)

## 4.1 Export 'What I See' (primary user flow)

- Exports the current plot view as PNG and/or SVG and/or PDF.
- Exports the data that is currently plotted (per visible trace) as CSV and/or JSON.
- Includes a concise summary of operations that produced those traces (transforms, differential, matching).
- Includes citations + retrieved timestamps for non-local data.

## 4.2 Export Dataset (single dataset or selection)

- Exports dataset metadata + raw payload (if permitted) + parsed canonical representation.
- Option to export as: raw-only, parsed-only, both (default: both if permitted).
- Includes license policy + whether redistribution is allowed.

## 4.3 Export Session Report (Notebook/Timeline)

- Creates a PDF report containing: session title, objective, key datasets used, key plot snapshots, annotations, matches, citations, and a timeline.
- Report is designed for 'send to professor' trust: it is readable without opening the app.
- Report should reference (or embed) the manifest, and may embed small thumbnails of plots; full-resolution images remain in the export bundle.

## 4.4 Export Support Bundle (for bug reports / agents)

- Produces a minimal reproducibility bundle: session state + event timeline + logs + references to raw payloads.
- Credentials/tokens must be redacted (CAP-08).
- Bundle must include clear instructions: 'how to open/replay this in the app'.

# 5\. File formats (must support)

| **Artifact** | **Required formats** | **Notes** |
| --- | --- | --- |
| Plot image | PNG, SVG | PNG is default for quick sharing; SVG for vector-quality figures. |
| Plot document | PDF | PDF export for printing/sharing; optional PDF/A mode for archival. |
| Plotted data | CSV, JSON | CSV for spreadsheets; JSON for full structured metadata. |
| Manifest | JSON | Single source of truth describing the export bundle. |
| Raw payloads | Original file formats | FITS, JCAMP-DX, CSV/TXT, etc. Included only if allowed. |

# 6\. Deterministic export bundle structure

All multi-artifact exports must be packaged with a consistent folder structure so users can find things quickly.

Recommended folder layout (inside a ZIP or folder):

exports/  
&lt;YYYYMMDD_HHMMSS&gt;\__&lt;session_or_export_name_sanitized&gt;/  
MANIFEST.json  
README.txt  
plots/  
plot.png  
plot.svg  
plot.pdf  
data/  
plotted_traces.csv  
plotted_traces.json  
raw/  
&lt;original_filenames...&gt;  
provenance/  
timeline.jsonl  
citations.bib (optional later)  
citations.json  
annotations/  
annotations.json  
matches/  
features.json  
matches.json  
checksums/  
SHA256SUMS.txt  

# 7\. Manifest (MANIFEST.json) - minimum schema

The manifest is the single source of truth for what the export contains and how it was produced.

## 7.1 Required top-level fields

| manifest_version | e.g., 1 |
| --- | --- |
| export_id | UUID |
| exported_at | ISO-8601 timestamp |
| export_type | what_i_see \| dataset_export \| session_report \| support_bundle |
| app | name + semantic version |
| build | git_commit (if available) + platform info |
| session | session_id + session_title (if applicable) |
| user | user_id (optional) + workspace context (personal/group) |

## 7.2 Dataset and trace inventory

- datasets\[\]: each dataset_id, title, source_type (lab/reference/telescope), source_name, retrieved_at (if applicable), license policy, and checksums.
- traces\[\]: trace_id, label, parent_dataset_id, units (x/y), and whether it is original vs derived.
- derived_lineage\[\]: for each derived trace, store operation (normalize, baseline, A−B, A/B, etc.) + parameters + input traces.

## 7.3 Plot state snapshot

- plot: axis labels + units, range, title, legend settings, visible traces, and any masks applied (view-only).
- If view uses transformed units (CAP-05), record both canonical and displayed units.

## 7.4 Actions summary ('what I did')

- what_i_did: a short bullet list auto-generated from the timeline (CAP-10 events).
- timeline_ref: path to timeline.jsonl (chronological event stream).

## 7.5 Citations

- citations\[\]: citation_id, citation_text, source_url, doi (if present), retrieved_at, and what it supports (dataset_id / figure / match).
- If raw redistribution is blocked, citations must still be included so others can re-fetch.

## 7.6 Checksums

- Every file included in the bundle must have SHA-256 listed in SHA256SUMS.txt.
- MANIFEST.json must include the checksum file path and the checksum of the manifest itself.

# 8\. License and sharing gates (must integrate with CAP-02/07/08)

- If redistribution_allowed = false or unknown for a dataset, raw payloads must be omitted by default.
- When raw is omitted, the manifest must include: source_url + query parameters (if applicable) + retrieval timestamps so others can reproduce.
- If a telescope product required authentication (CAP-08), public export must default to pointers-only.
- The export UI must show a 'Sharing Summary' before generating the bundle: which raw files will be included vs omitted vs pointers-only.

# 9\. 'Don't lie to me' export rules (trust guarantees)

- Export must reflect exactly what is plotted (same trace selection, same transforms, same labels).
- If any smoothing/interpolation/resampling was used, it must be called out in the 'what I did' summary and in lineage.
- If any data was masked (e.g., B≈0 masking in A/B), mask thresholds must be recorded.
- No silent downsampling: if plotted data was downsampled for performance, export must either (a) export full resolution, or (b) clearly label the downsampled export and offer 'export full'.

# 10\. PDF and archival options

- PDF export must embed fonts and include metadata so it prints consistently.
- Optional 'PDF/A mode' (archival) can be offered if feasible; PDF/A forbids certain features (e.g., encryption) and requires embedded fonts and metadata.
- If PDF/A mode is enabled, the report must note the conformance target (e.g., PDF/A-2b) and any limitations (no embedded external content).

# 11\. UI requirements (minimal but complete)

## Export dialog (recommended)

- Export type selector: What I See / Dataset / Session Report / Support Bundle.
- Format toggles: PNG, SVG, PDF; CSV, JSON; include raw (if allowed).
- Include: annotations, highlights, feature matches (CAP-04/09).
- License summary panel: what is included vs pointers-only; warnings for restricted datasets.
- Name + location chooser; default folder name includes timestamp + session title.

## One-click defaults (for speed)

- 'Export what I see (PNG+CSV+manifest)' as the primary one-click option.
- 'Export session report (PDF+bundle)' as a secondary option for professor-ready deliverables.

# 12\. Implementation guidance (what to use - options, not mandates)

- Use a single export service that consumes: plot state (CAP-03), library metadata (CAP-02), timeline (CAP-10), and feature/match results (CAP-09).
- Write bundle files first to a temp directory; validate checksums; then finalize ZIP to avoid partial exports.
- Prefer stable, widely used writers for each format (e.g., PNG/SVG/PDF libraries) rather than custom serialization logic.

# 13\. Acceptance tests (definition of done)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP11-T01 | Export What I See (PNG + CSV + manifest) | Bundle contains plot.png, plotted_traces.csv, MANIFEST.json, checksums |
| CAP11-T02 | SVG export | plot.svg opens in a browser/vector editor; axes + legend readable |
| CAP11-T03 | PDF export | plot.pdf prints correctly; metadata present; links work where supported |
| CAP11-T04 | Include annotations and highlights | annotations.json included; plot export includes visible labels |
| CAP11-T05 | Include feature matches | features.json + matches.json included; citations linked |
| CAP11-T06 | Restricted reference dataset export | raw omitted; pointers and citations included; UI warned user |
| CAP11-T07 | Authenticated telescope import export | public raw export blocked by default; pointer-only option works |
| CAP11-T08 | Export full vs downsampled | If downsampled plotted view, user can export full; manifest clearly states which was used |
| CAP11-T09 | Checksum verification | SHA256SUMS.txt matches all files; manifest includes its own hash |
| CAP11-T10 | Support bundle | Redacts tokens; includes session + timeline + logs; reproducible open instructions |

# 14\. Questions to ask you (feature-level, no coding required)

- For 'Export what I see', do you want the default to include raw files when allowed, or keep raw opt-in to avoid huge bundles?
- Should export filenames be short (for humans) or verbose (for forensic reproducibility)?
- Do you want a 'Professor mode' preset (PDF + PNG + CSV + citations) as a single button?
- When exporting plotted data, do you want a single combined CSV (all traces) or one CSV per trace (or both)?
- Do you want a machine-readable citation format export (BibTeX) later, or keep it JSON-only for now?

# Appendix A. Project reference links (MUST consult)

You stated the repo contains a curated suite of reference links. Agents must consult it before implementing export citation formatting, license/sharing policy wording, and any 'what I did' templates. This CAP includes standard format references, but project policy must come from your link suite.

Recommended single source of truth path (update to match your repo): docs/references/REFERENCES_RAW.md

# Appendix B. External references used in this CAP (format standards)

- SVG 2 specification (W3C)
- PNG specification (W3C Recommendation; Third Edition exists as of 2025)
- CSV format and MIME type (RFC 4180)
- JSON data interchange format (RFC 8259)
- PDF/A standard family (ISO 19005) overview resources
- PDF 2.0 (ISO 32000-2) overview resources
- SVG 2: <https://www.w3.org/TR/SVG2/>
- PNG (Third Edition): <https://www.w3.org/TR/png-3/>
- CSV RFC 4180: <https://datatracker.ietf.org/doc/html/rfc4180>
- JSON RFC 8259: <https://datatracker.ietf.org/doc/html/rfc8259>
- PDF/A (ISO 19005) overview: <https://pdfa.org/resource/iso-19005-pdfa/>
- PDF 2.0 (ISO 32000-2) overview: <https://pdfa.org/resource/iso-32000-2/>