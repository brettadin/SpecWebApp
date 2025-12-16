**CAP-12 - Quality Gates, Regression Prevention, and Agent Discipline**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-12 defines the project-wide quality system that prevents the failures listed in your "Never again" section: feature loss, dead UI controls, undocumented changes, confusing logs, and agents 'forgetting' wiring. This cap specifies: mandatory documentation artifacts, verification scripts, regression smoke tests, logging standards, change-record discipline, and release hygiene. CAP-12 is the meta-cap: it does not add a user-facing spectroscopy feature, but it ensures every future CAP can be implemented safely without breaking what already works.

# 2\. User outcomes (success criteria)

- New features stop breaking old features (regressions are caught early and fixed immediately).
- Every UI control does something real; no dead or duplicate controls survive review.
- Agents leave a readable trail: what changed, why, how it was wired, and where to look next.
- Errors are understandable to humans and actionable for agents (stack traces + context + next steps).
- Exports always include version/date and a truthful 'what I did' summary (CAP-11), with no silent transformations.
- There is a repeatable 'release checklist' that makes builds predictable and reduces chaos.

# 3\. In scope / Out of scope

## In scope

- Repo hygiene rules: where docs go, how versions are tracked, and how changes are recorded.
- Quality gates: mandatory verification checks that must pass before moving to the next CAP.
- Regression suite: smoke tests covering the app's critical user workflows across CAP-01 to CAP-11.
- Logging + error handling standards (human-facing + machine/actionable).
- Agent workflow discipline: inline comments, wiring checklists, and 'no feature loss' guardrails.
- Release hygiene: version stamping, export stamping, and reproducible run scripts.

## Out of scope (for CAP-12)

- Continuous cloud deployment pipelines (the project is local-first).
- Complex enterprise RBAC/SSO (beyond minimal group sharing needs).
- Real-time multi-user co-editing (explicitly out of scope).

# 4\. Non-negotiables (project rules)

- No silent distortion: no hidden normalization on ingest; no hidden X-axis transforms; no hidden resampling.
- No feature loss: do not remove/replace UI panels or workflows unless explicitly specified and documented.
- No dead controls: every button/toggle must be wired to a working implementation or be removed/hidden.
- No invisible wiring: tricky UI->logic connections require inline comments pointing to the implementation entry points.
- No unverifiable exports: every export includes version/date, checksums, citations/pointers as applicable, and 'what I did'.

# 5\. Required repository artifacts

## 5.1 Single source of truth versioning

- version.json (or equivalent) is the authoritative version source.
- The UI must display app version and build info consistently (top bar/badge), and exports must embed it (CAP-11).
- Every change record references the version bump (or explicitly states why no bump occurred).

## 5.2 Change records (one per agent update)

A dedicated change record must be written for every meaningful agent work session.

Required structure (recommended path): docs/changes/YYYY/MM/DD/&lt;timestamp&gt;\__&lt;agent_or_author&gt;\__&lt;short_slug&gt;.md

| **Section** | **What it must include** |
| --- | --- |
| Summary | One paragraph: what changed and why |
| Files changed | Explicit list of files touched (paths) |
| Wiring notes | Which UI control calls what function/module; include keys/ids where relevant |
| Behavior changes | User-visible changes; MUST/MUST NOT deltas |
| Tests run | Which regression/smoke tests were executed (CAP-12 suite) |
| Known issues / follow-ups | Anything deferred; link to CAP/Open Questions |

## 5.3 UI contract

Maintain a machine-checkable UI contract so future changes cannot accidentally remove core UI elements.

- docs/ui_contract.json (or equivalent) enumerating required tabs/panels/controls and expected labels.
- scripts/verify_ui_contract.py validates the running UI structure (or validates declared UI config).
- If the UI contract changes, it must be intentional and documented in the change record.

## 5.4 Reference link suite (single source of truth)

- docs/references/REFERENCE_LINKS.md (or the path you use) must contain: approved sources, access notes, and license constraints.
- Agents must add any new authoritative links they used while implementing CAP-07/08/09 (and future caps).
- If a source license is unknown, default to restrictive sharing and document what needs verification (CAP-07/08 gate).

# 6\. Verification and regression suite

## 6.1 Mandatory checks before moving to the next CAP

- Verify project structure: no nested duplicate repos, no missing entrypoints, no broken imports.
- Verify UI contract: required tabs/controls exist and are wired.
- Run smoke workflow: ingest -> plot -> annotate -> transform -> differential -> export (see §6.2).
- Review legend + trace naming: no duplicate labels; derived traces grouped (CAP-03).
- Confirm 'don't lie' sanity checks: monotonic X; no negative wavelength; no nonsense ranges without explanation.
- Write change record and update any touched docs.

## 6.2 Baseline smoke workflows (minimum set)

| **Smoke ID** | **Workflow** | **Pass criteria** |
| --- | --- | --- |
| S01 | Ingest CSV with metadata header lines | Parser handles or prompts; no crash; dataset saved |
| S02 | Overlay 3+ traces (mixed sizes) | Plot renders; legend readable; trace names stable |
| S03 | Create point note + region highlight | Annotations render; toggle on/off; persist (CAP-04) |
| S04 | Apply Y-only normalization + smoothing | Transforms are labeled; undo/clear works; no X corruption (CAP-05) |
| S05 | Compute A−B and A/B with swap A↔B | Selections persist; outputs correct; A/B handles B≈0 safely (CAP-06) |
| S06 | Import reference (NIST/line list) and overlay | Citation visible; source link stored; share gate correct (CAP-07) |
| S07 | Telescope import (MAST) and plot 1D spectrum | Raw preserved; extracted trace plot; provenance stored (CAP-08) |
| S08 | Run feature detect + match | Results show tolerance/score; citations; can convert to annotations (CAP-09) |
| S09 | Export What I See | Bundle includes plot+data+manifest+checksums+what-I-did (CAP-11) |
| S10 | Open saved session | Restores plot/traces/transforms/annotations (CAP-10) |

## 6.3 Automated testing targets (recommended, staged)

- Unit tests: parsing edge cases (CAP-01), unit conversion idempotence (CAP-05), safe division masking (CAP-06).
- Integration tests: library persistence (CAP-02), derived trace grouping (CAP-03), export bundle integrity (CAP-11).
- UI wiring tests: ensure key buttons invoke intended handlers and update state (CAP-03/04/06).
- Golden tests: fixed sample datasets produce stable outputs (within tolerances) to detect regressions.

# 7\. Logging and error handling standards

## 7.1 Human-friendly errors

- Every user-facing error must include: what failed, why it likely failed, and what to do next.
- When relevant, show a 'Preview the file' option and ask 1-2 minimal questions (per your Brain Dump).
- Avoid vague messages ('something went wrong') unless accompanied by an actionable 'Details' section.

## 7.2 Agent/actionable logs

- Logs must include: timestamp, module, operation, dataset_id/trace_id (when relevant), and exception details.
- Prefer structured logs (JSON) for machine parsing, alongside a readable console log.
- Include a 'Create support bundle' button (CAP-10/11) that packages session + last logs + pointers to raw payloads.
- Redact credentials/tokens in logs and bundles (CAP-08).

# 8\. Wiring discipline (prevent dead UI)

## 8.1 Mandatory wiring checklist (per feature)

- UI control exists and is discoverable (no hidden duplicate).
- UI control has a unique state key and persists appropriately (no unintended resets).
- UI control calls exactly one handler entrypoint (clear path for debugging).
- Handler calls pure logic functions (testable) rather than embedding logic in UI callbacks.
- Handler errors are caught and routed to user-friendly messages + logs.
- The feature is covered by at least one smoke test scenario and (if possible) a unit test.

## 8.2 Inline comments requirement

- Add inline comments only where needed: tricky state, tricky parsing, tricky math, or non-obvious design decisions.
- Comments must answer: 'why this is here' and 'what breaks if you change it'.
- Comments should point to related CAP docs (e.g., 'See CAP-06 §8 for ratio masking rules').

# 9\. Release hygiene (local-first)

## 9.1 Reproducible run and install

- Provide a single 'RUN_LOCAL' script or command that reliably starts the app.
- Pin dependency versions (requirements.txt/lockfile) and document OS-specific setup notes.
- Provide a 'VERIFY' script that runs: tests + UI contract check + a minimal smoke run where feasible.

## 9.2 Export and report stamping

- Every export includes: app version, export timestamp, manifest schema version, and checksums (CAP-11).
- Every session includes: schema version and connector versions (CAP-10).

# 10\. Acceptance tests (definition of done for CAP-12)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP12-T01 | Introduce a UI regression (remove a required tab) | verify_ui_contract fails and blocks 'done' |
| CAP12-T02 | Add a new UI control without wiring | Smoke test catches dead control; change record flags and requires fix |
| CAP12-T03 | Introduce a parsing regression | Unit/integration tests fail; error message remains actionable |
| CAP12-T04 | Run baseline smoke suite on a known dataset pack | All S01-S10 pass |
| CAP12-T05 | Generate change record after an update | Change record includes wiring notes + tests run |
| CAP12-T06 | Create support bundle after an exception | Bundle created; token redaction confirmed; replay instructions included |

# 11\. Questions to ask you (feature-level, no coding required)

- Do you want a strict rule that EVERY agent update must include a new change record file (recommended)?
- Should the app block release/export if the UI contract check fails, or just warn loudly?
- How big should the 'known dataset pack' be for smoke tests (tiny fast pack vs heavier realistic pack)?
- Do you want a visible 'Quality status' badge in the UI (e.g., last verify run: PASS/FAIL)?
- For group/class use: should students be able to export bundles that include raw files, or should class exports default to pointers-only?

# Appendix A. Templates (copy/paste ready)

## A.1 Change record header template

Title: &lt;CAP or area&gt; - &lt;short description&gt;  
Date: &lt;YYYY-MM-DD&gt;  
Author/Agent: &lt;name&gt;  
App version: &lt;x.y.z&gt;  
<br/>Summary:  
\- …  
<br/>Files changed:  
\- …  
<br/>Wiring notes:  
\- UI: &lt;control&gt; -> &lt;handler&gt; -> &lt;module.function&gt;  
<br/>Behavior changes:  
\- …  
<br/>Tests run:  
\- verify_ui_contract  
\- smoke: S01, S02, …  
<br/>Known issues / follow-ups:  
\- …  

## A.2 UI contract idea (minimum fields)

{  
"required_tabs": \["Overlay", "Differential", "Docs"\],  
"required_panels": \["Dataset Library", "Annotations", "Export"\],  
"required_controls": \[  
{"id": "trace_a_select", "type": "dropdown", "cap": "CAP-06"},  
{"id": "swap_a_b", "type": "button", "cap": "CAP-06"},  
{"id": "export_what_i_see", "type": "button", "cap": "CAP-11"}  
\]  
}  

# Appendix B. Project reference links (MUST consult)

Your repository contains a curated suite of reference links and project policies. Agents must consult it before implementing any new connectors, changing sharing rules, or adding domain tables. CAP-12 treats that link suite as the single source of truth for approved sources and license constraints.

Recommended single source of truth path (update to match your repo): docs/references/REFERENCE_LINKS.md

# Appendix C. External references used in this CAP (engineering standards)

- Semantic Versioning (SemVer) overview: <https://semver.org/>
- pytest (Python testing): <https://docs.pytest.org/>
- Python logging module: <https://docs.python.org/3/library/logging.html>
- Pre-commit framework (optional): <https://pre-commit.com/>
- Conventional Commits (optional): <https://www.conventionalcommits.org/>