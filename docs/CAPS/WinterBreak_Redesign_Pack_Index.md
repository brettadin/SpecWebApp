**WinterBreak Redesign Pack**

_Inventory and usage guide • Generated December 15, 2025_

This document indexes the files you uploaded in "WinterBreak Redesign.zip" and defines how future agents should use them as a single, consistent reference set while implementing the Spectra App redesign.

# 1\. Contents at a glance

- 15 CAP specification documents (CAP-01 through CAP-15)
- Development cycle overview (DOCX + TXT)
- Reference link suite (REFERENCES.md + REFERENCES_RAW.md)
- Starter/brain-dump snapshot (STARTER.txt)

# 2\. Single sources of truth (non-negotiable)

- The CAP documents are the implementation contract for each capability area.
- The reference link suite is the authoritative source list for citations, data-source endpoints, and license notes.
- Any agent that implements code must: (1) read the relevant CAP(s), (2) consult REFERENCES.md / REFERENCES_RAW.md, and (3) write a change record describing what changed, why, and where it is wired (see CAP-12).

# 3\. CAP index

| **CAP** | **Filename** | **Title (from filename)** | **Purpose summary** |
| --- | --- | --- | --- |
| CAP-01 | CAP-01_Dataset_Ingestion_and_Parsing_Spec.docx | CAP-01 Dataset Ingestion and Parsing Spec | Dataset ingestion and parsing (robust CSV/TXT/FITS/JCAMP handling; messy-file recovery) |
| CAP-02 | CAP-02_Dataset_Library_Metadata_and_Sharing_Spec.docx | CAP-02 Dataset Library Metadata and Sharing Spec | Dataset library, metadata, and sharing (catalog, tags, provenance, permissions) |
| CAP-03 | CAP-03_Interactive_Plotting_Overlay_and_Trace_Management_Spec.docx | CAP-03 Interactive Plotting Overlay and Trace Management Spec | Interactive plotting, overlay, and trace management (legend hygiene, grouping, performance) |
| CAP-04 | CAP-04_Notes_Labels_and_Region_Highlights_Spec.docx | CAP-04 Notes Labels and Region Highlights Spec | Notes, labels, and region highlights (annotations tied to datasets/traces; toggleable) |
| CAP-05 | CAP-05_Normalization_Unit_Display_and_Transform_Pipeline_Spec.docx | CAP-05 Normalization Unit Display and Transform Pipeline Spec | Normalization, unit display, and transform pipeline (non-destructive Y-only transforms; provenance) |
| CAP-06 | CAP-06_Differential_Comparison_AminusB_and_AoverB_Spec.docx | CAP-06 Differential Comparison AminusB and AoverB Spec | Differential comparison (A-B, A/B, resampling alignment; stability guardrails) |
| CAP-07 | CAP-07_Reference_Sources_Line_Lists_and_Citation_First_Imports_Spec.docx | CAP-07 Reference Sources Line Lists and Citation First Imports Spec | Reference sources and line lists (citation-first imports; credible databases) |
| CAP-08 | CAP-08_Telescope_Archive_Data_Retrieval_and_FITS_Spectra_Extraction_Spec.docx | CAP-08 Telescope Archive Data Retrieval and FITS Spectra Extraction Spec | Telescope archive retrieval + FITS extraction (MAST/JWST/HST workflows; product handling) |
| CAP-09 | CAP-09_Feature_Detection_and_Identification_Assistance_Spec.docx | CAP-09 Feature Detection and Identification Assistance Spec | Feature detection and identification assistance (peaks/dips, matching, evidence tracking) |
| CAP-10 | CAP-10_Session_Notebook_History_and_Collaboration_Workspaces_Spec.docx | CAP-10 Session Notebook History and Collaboration Workspaces Spec | Session notebook, history, and collaboration workspaces (timeline + shareable sessions) |
| CAP-11 | CAP-11_Exports_Reproducible_Bundles_and_What_I_Did_Reports_Spec.docx | CAP-11 Exports Reproducible Bundles and What I Did Reports Spec | Exports and reproducible bundles ('what I did' reports; manifests; checksums) |
| CAP-12 | CAP-12_Quality_Gates_Regression_Prevention_and_Agent_Discipline_Spec.docx | CAP-12 Quality Gates Regression Prevention and Agent Discipline Spec | Quality gates and regression prevention (UI contract, smoke suite, agent discipline) |
| CAP-13 | CAP-13_UI_Design_System_Themes_and_Interaction_Rules_Spec.docx | CAP-13 UI Design System Themes and Interaction Rules Spec | UI design system and themes (clean lab notebook UX; anti-reset rules; readability) |
| CAP-14 | CAP-14_In_App_Documentation_Onboarding_and_Reference_Hub_Spec.docx | CAP-14 In App Documentation Onboarding and Reference Hub Spec | In-app documentation and onboarding (Docs hub; glossary; reference hub; agent handoff) |
| CAP-15 | CAP-15_Target_Search_Name_Resolution_and_Query_Builder_Spec.docx | CAP-15 Target Search Name Resolution and Query Builder Spec | Target search + name resolution + query builder (planets/stars/molecules; searchable routing) |

# 4\. Reference link suite

Files included:

- REFERENCES.md (curated / cleaned)
- REFERENCES_RAW.md (raw compilation; may include working notes)

Rule for agents: if you add a new external source while implementing a CAP, you must add it to the reference link suite and note how it is used, plus any license/sharing constraints. Do not hardcode scientific tables or claims without a source.

# 5\. Development cycle overview

Files included:

- Spectra_App_Dev_Cycle_Overview.docx
- Spectra App - Development Cycle Overview.txt

Recommended usage: treat the Development Cycle Overview as the high-level roadmap and progress tracker; treat each CAP as the detailed spec for the relevant subsystem.

# 6\. Brain-dump snapshot

File included: STARTER.txt

This is a snapshot of the refined requirements brain dump used to derive the CAP series. Do not treat it as implementation detail; treat it as product intent and user priorities.

# 7\. Agent rules of engagement (quick checklist)

- Read: CAP(s) + references before coding.
- Preserve: working UI and wiring; no feature loss or duplicate controls.
- Document: one change record per meaningful update (what/why/how/wiring/tests).
- Verify: run the smoke workflow suite (CAP-12) before declaring a change complete.
- Export trust: keep 'don't lie to me' rules; always stamp exports with version/date/citations.

# 8\. Suggested next deliverables

- A single "Master CAP Map" markdown page that links each CAP to the modules/packages that implement it.
- A small "known dataset pack" used by smoke tests (CAP-12) to catch regressions early.
- A lightweight UI contract artifact (CAP-12) if not already present in the repo.