# Change Record

- Date: 2025-12-16
- Owner: Copilot
- CAP(s): CAP-07, CAP-01, CAP-02 (policy fields), CAP-03, CAP-12
- Summary: Added a citation-first reference import MVP (JCAMP-DX-by-URL) with raw payload preservation and restrictive-by-default sharing policy metadata.

## Why

CAP-07 introduces trustworthy, reproducible ingestion of external reference data with strict provenance. This MVP establishes the basic pipeline: fetch → preserve raw → parse for plotting → persist citation + license/sharing metadata.

## What changed

### API

- Added `POST /references/import/jcamp-dx`:
  - Server fetches the raw JCAMP-DX payload from `source_url` (stored exactly, with SHA-256).
  - Parses into a normalized spectrum (x/y arrays + units where present).
  - Persists CAP-07 reference metadata under `reference` in `dataset.json`, including:
    - `source_name`, `source_url`, `retrieved_at`, `citation_text`, `query`
    - license fields and a restrictive-by-default `sharing_policy` derived from `redistribution_allowed`.

- Added `POST /references/import/line-list-csv`:
  - Server fetches a CSV/tab payload by URL and parses numeric rows into a simple line list (x positions + strength).
  - Persists CAP-07 reference metadata under `reference` with `data_type=LineList`.

### Web

- Added a minimal "Add reference data (CAP-07)" section in the Library page to import a JCAMP-DX URL with required citation text.
- Extended the Library page CAP-07 section with a minimal line list (CSV URL) import form.

### Plot

- Line list datasets are rendered as stick/bar overlays (instead of continuous spectra) based on the optional `reference.data_type` field.

### Tests

- Added an API test that serves a tiny JCAMP-DX payload from a local HTTP server and verifies the import endpoint persists reference metadata.

## Files

- API import logic: `apps/api/app/reference_import.py`
- API route: `apps/api/app/main.py`
- API test: `apps/api/tests/test_cap07_reference_import_jcamp.py`
- API test: `apps/api/tests/test_cap07_reference_import_line_list_csv.py`
- UI wiring: `apps/web/src/pages/LibraryPage.tsx`

## Verification

- `scripts/verify.ps1`: PASS

## Follow-ups

- Add connector registry + search results UI (NIST WebBook species lookup, NIST ASD line-list query) per CAP-07.
- Add license-aware export/share enforcement once CAP-02 sharing is implemented end-to-end.
