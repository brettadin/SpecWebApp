# 2025-12-19 — CAP-02: Collections UI + dedupe prompting for reference/telescope imports

## Summary

Completes the “CAP-02 dedupe story” across import paths and adds a minimal collections/folders UX:

- Extends SHA-256 duplicate prompting (409 + explicit user choice) beyond local ingest to:
  - CAP-07 reference imports (JCAMP-DX, line-list CSV, NIST ASD line list)
  - CAP-08 telescope imports (FITS-by-URL, MAST FITS-by-data-uri)
- Adds collections/folders editing and filtering in the Library dataset UI.

This keeps the existing local-first storage model and reuses the same structured `duplicate_sha256` conflict payload and resolution choices.

## What changed

### API

- Reference imports now support `on_duplicate` (`prompt` | `open_existing` | `keep_both`) and emit the same structured `409` as `/ingest/commit`.
  - `open_existing` returns the existing dataset detail.
  - `keep_both` creates a new dataset and records `dataset.duplicate_kept` with an import-context hint.
- Telescope imports now support `on_duplicate` with the same behavior for FITS-by-URL and MAST imports.
- Duplicate conflicts are surfaced uniformly via a shared helper in the API router.

### Web

- Library “Reference” tab shows a duplicate conflict prompt (Use existing / Keep both / Open existing in Plot).
- Library “Telescope” tab (MAST import) shows the same duplicate conflict prompt.
- Library “Datasets” tab:
  - Adds a collections filter dropdown (derived from existing dataset collections).
  - Shows `collections` on dataset cards.
  - Dataset editor adds a `collections` comma-separated field.

## Verification

- Extended API tests for duplicate prompting + resolution behaviors:
  - `apps/api/tests/test_cap07_reference_import_jcamp.py`
  - `apps/api/tests/test_cap07_reference_import_line_list_csv.py`
  - `apps/api/tests/test_cap08_telescope_fits_by_url.py`
  - `apps/api/tests/test_cap08_mast_endpoints.py`
- Full repo verification: `scripts/verify.ps1`

## Notes

- Collections remain a simple string-list primitive (no nesting/permissions/workspace semantics yet).
- Duplicate detection is by identical raw bytes (SHA-256 of payload bytes). It does not attempt fuzzy/semantic equivalence.
