**CAP-14 - In‑App Documentation, Onboarding, and Reference Hub (Docs That Don't Suck)**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-14 defines the app's documentation system as a first-class feature: an in-app Docs experience that is searchable, easy to maintain, and tightly linked to the actual UI controls and workflows. It includes (1) an information architecture for docs content, (2) in-app help surfaces (tooltips, contextual help, guided prompts), (3) a Glossary/Definitions layer to keep terms consistent, (4) a 'Reference Hub' for trusted external sources and the project's curated link suite, and (5) an 'Agent Handoff Pack' so future agents can change the code without breaking wiring.

# 2\. User outcomes (success criteria)

- When I don't know what something does, the app explains it quickly without burying me in pages of text.
- I can find answers via search (e.g., 'A/B', 'FITS', 'MAST', 'prominence') and jump to the relevant doc.
- Docs match the UI: labels and buttons in docs use the exact same names as the app.
- Docs include citations/links for any scientific claim or reference table; no 'invented' tables.
- The app can show small 'what to do next' hints when something fails (e.g., messy CSV) without spamming popups.
- New agents can open one page and immediately understand entry points, tests, and where to change things safely.

# 3\. In scope / Out of scope

## In scope

- In-app Docs tab/panel with search + navigation.
- Doc content model (tutorials, how-to, reference, explanation) and folder structure.
- Contextual help surfaces: tooltips, inline hints, error help blocks, 'learn more' links.
- Glossary and definitions to keep terminology consistent across UI and exports.
- Reference Hub: curated external sources + project reference link suite integration.
- Agent Handoff Pack: core project docs for future contributors/agents.

## Out of scope (for CAP-14)

- Full public website documentation publishing (optional later; CAP-14 keeps docs local-first).
- Long-form narrative writing (CAP-14 is concise; it focuses on quick answers and reliable references).
- Academic teaching content not directly tied to app workflows (keep it in 'Resources' links, not embedded as essays).

# 4\. Documentation principles (enforceable rules)

- Docs must be task-oriented: help the user do something in the app, not read theory unless requested.
- Docs must mirror the UI labels exactly: if the UI says 'Export what I see', docs must say 'Export what I see'.
- Docs must be evidence-backed: any reference tables (functional groups, line IDs) must link to curated sources or imported datasets (CAP-07).
- Docs are living: if a feature changes, update docs in the same change record (CAP-12 discipline).
- Minimal viable documentation beats a giant stale wiki: keep pages short and correct, and trim aggressively.

# 5\. Documentation Information Architecture (IA)

## 5.1 Four doc types (content model)

CAP-14 adopts a 4-type structure so docs stay organized and users don't get lost:

| **Doc type** | **Purpose** | **Examples in Spectra App** |
| --- | --- | --- |
| Tutorial | Learning-by-doing for first-time users | 'First overlay: load two spectra, annotate, export' |
| How-to guide | Steps to accomplish a task | 'Import JWST x1d from MAST' / 'Fix a messy CSV' |
| Reference | Facts and definitions (no steps) | File format reference, transform definitions, export manifest schema |
| Explanation | Why/intuition, design decisions | Why no X normalization; why pointers-only exports exist |

## 5.2 Recommended docs folder structure (repo)

Recommended paths (adjust to your repo conventions):

docs/  
index.md  
tutorials/  
first_session.md  
howto/  
import_lab_csv.md  
import_nist_lines.md  
import_mast_jwst.md  
a_over_b_safely.md  
reference/  
glossary.md  
file_formats.md  
transforms.md  
export_manifest.md  
explanation/  
design_principles.md  
provenance_and_citations.md  
caps/  
CAP-01_....md  
CAP-02_....md  
...  
references/  
REFERENCE_LINKS.md (your curated suite)  
LICENSE_NOTES.md  

## 5.3 'CAPs as docs' rule

- Each CAP spec must have a matching docs page under docs/caps/ that is user-facing and shorter than the Word spec.
- CAP Word specs remain the implementation contract; docs pages remain the friendly UI help.
- Docs pages must link back to the CAP for deeper details (and vice versa).

# 6\. In‑app Docs UX

## 6.1 Docs surfaces (minimum)

- Docs tab/panel with left nav (categories) + main content viewer.
- Search box that indexes titles + headings + keywords + glossary terms.
- 'Quick answers' section: 6-12 high-frequency questions (Export, A/B, units, messy CSV, FITS).
- Contextual 'Learn more' links from the UI (buttons and settings link to exact anchor sections).

## 6.2 Contextual help patterns

| **Pattern** | **Where it appears** | **When to use (rules)** |
| --- | --- | --- |
| Tooltip | Icon next to a control | For one-sentence meaning + constraint (e.g., 'Y-only normalization') |
| Inline helper text | Below a form field | For common mistakes + valid ranges |
| Inline banner | Top of panel (non-modal) | For recoverable issues and warnings (e.g., 'CSV has 12 header lines') |
| Help drawer | Side drawer overlay | For multi-paragraph help without leaving the workflow |
| Guided prompt | When an error occurs | Ask 1-2 questions only, with file preview, then proceed (CAP-01 rule) |

## 6.3 Docs must be offline-friendly

- All core docs ship with the app (local files).
- External links open in the user's browser; docs should remain usable offline.
- If a link is critical (e.g., token setup steps), provide a short offline summary plus the link.

# 7\. Glossary and definitions (consistency layer)

## 7.1 Glossary scope (minimum)

- Common domain terms used in the UI: wavelength, wavenumber, absorbance, transmittance, reflectance, emission, spectral line, band, resolution.
- App terms: dataset, trace, derived trace, transform, normalization, masking, pointers-only export, provenance, citation-first.
- Connector terms: program/proposal ID, obsid, product type suffix, x1d, s3d (as relevant to CAP-08).

## 7.2 Definition rules

- Definitions must be short and written in plain language.
- Definitions must not over-promise (e.g., matching is candidate ranking, not certainty).
- Any definition that includes a scientific claim must link to an approved reference (curated suite or imported reference dataset).

# 8\. Reference Hub (trusted sources + your curated link suite)

## 8.1 What the Reference Hub is

- A dedicated 'References' area in Docs that points to:
- your curated reference link suite (single source of truth)
- connector docs used by the app (NIST/MAST/HITRAN/etc.)
- licensing and sharing notes (what can/can't be redistributed)

## 8.2 Rules for adding a new external reference

- Add it to docs/references/REFERENCE_LINKS.md (or your chosen path).
- Record why it is trustworthy, what it is used for, and any license constraints.
- Link to the specific page/endpoint used (not just a generic homepage).
- Update any affected docs pages and CAP references in the same change record (CAP-12).

## 8.3 Citation-first behavior in docs

- If docs mention a line list, band assignment table, or telescope product rule, they must include a source link.
- If the app includes any built-in band/range tables, they must be derived from your curated sources and explicitly cited.

# 9\. 'Agent Handoff Pack' (so future agents don't break wiring)

## 9.1 Required files

- README_FOR_AGENTS.md - one page, brutally practical: how to run, where entry points are, and how to not break the UI.
- ARCHITECTURE_OVERVIEW.md - modules, boundaries, and what each CAP maps to.
- RUNBOOK.md - common ops: adding a connector, adding a UI control, adding a parser, adding a CAP doc.
- TROUBLESHOOTING.md - common errors and how to debug them.
- QUALITY_GATES.md - CAP-12 checklist and exact commands to run verify/smoke/tests.
- UI_CONTRACT.md (or JSON + explanation) - what must never disappear.
- REFERENCES.md - points to the curated reference link suite and how to add sources.

## 9.2 'Wiring map' requirement (minimum)

Agents must maintain a wiring map for critical workflows so UI->handler->logic is obvious.

Minimum wiring map format example (store in docs/ARCHITECTURE_OVERVIEW.md):

\- UI: Differential panel  
\- Control: trace_a_select -> handler: on_select_trace_a -> service: differential.select_a()  
\- Control: compute_ratio -> handler: on_compute_ratio -> service: differential.compute_ratio()  
\- Service calls: resample.align() (CAP-06) + mask.safe_divide() (CAP-06)  

## 9.3 Handoff bundle

- When an agent completes a CAP implementation, they must produce:
- a change record file (CAP-12)  
    • updated docs pages (CAP-14)  
    • updated reference links (if any)  
    • updated UI contract (if UI changed)

# 10\. Writing style rules (keep it casual and readable)

- Short sentences. Prefer bullets over paragraphs.
- Use the user's words (lab notebook, overlay, A/B) and define terms once in the glossary.
- For procedures, keep steps short and separate alternative methods into separate sub-sections.
- Avoid jargon unless the user already used it; if used, include a glossary link.

# 11\. Acceptance tests (definition of done)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP14-T01 | Open Docs tab and browse categories | Docs render, navigation works, no broken pages |
| CAP14-T02 | Search for a keyword (e.g., 'A/B') | Search returns the correct pages and anchors |
| CAP14-T03 | Click 'Learn more' from a UI control | Opens the correct docs page at the correct section |
| CAP14-T04 | Trigger a common error (messy CSV) | Inline help appears with 1-2 questions and links to how-to doc |
| CAP14-T05 | Offline use | Core docs still load; external links degrade gracefully |
| CAP14-T06 | Add a new reference source | Reference link suite updated + doc page updated + change record written |
| CAP14-T07 | New agent onboarding | README_FOR_AGENTS is sufficient to run app + locate entry points in <10 minutes |

# 12\. Questions to ask you (feature-level, no coding required)

- Do you want the Docs tab to be a full-page 'Help Center', or a smaller side panel you can keep open while plotting?
- Should the app include a 'First session' guided tutorial (checklist style), or just a tutorial page?
- Do you want docs to be searchable across your notes/notebook too (CAP-10), or only across official docs?
- When something fails (parsing, downloads), do you prefer: (a) inline banner + link to doc, or (b) a short guided prompt that fixes it immediately?
- Do you want 'Reference Hub' to show your curated links only, or also include an automatically generated list of citations used by the current session?

# 13\. Notes for agents (project practices)

- Docs are part of the product: changes without docs are incomplete.
- Use the curated reference link suite for any scientific claims/tables; do not paste uncited content.
- Keep docs consistent with UI labels; update docs when UI text changes (CAP-12 quality gate).
- Prefer local markdown docs rendered in-app; avoid hardcoding doc text inside UI code.

# Appendix A. Project reference links (MUST consult)

You stated the repo contains a curated suite of reference links (uploaded to the project). Agents must consult it before writing scientific reference tables, choosing data-source endpoints, or changing license/sharing behavior. CAP-14 assumes this suite is the single source of truth for approved references.

Recommended single source of truth path (update to match your repo): docs/references/REFERENCE_LINKS.md

# Appendix B. External references used in this CAP (documentation frameworks and style)

- Diátaxis documentation framework (tutorials/how-to/reference/explanation): <https://diataxis.fr/>
- Google developer documentation style guide (procedures + best practices): <https://developers.google.com/style>
- Microsoft Writing Style Guide (procedures and clarity guidance): <https://learn.microsoft.com/en-us/style-guide/>
- W3C WAI accessibility fundamentals / WCAG overview (for help UI accessibility expectations): <https://www.w3.org/WAI/>
- Google Documentation Best Practices (minimum viable docs): <https://google.github.io/styleguide/docguide/best_practices.html>