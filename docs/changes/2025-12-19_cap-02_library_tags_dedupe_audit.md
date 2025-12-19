# 2025-12-19 — CAP-02: Library metadata (tags/favorites/description), dedupe prompt, audit trail

## Summary

Implements a minimal CAP-02 slice focused on making the Dataset Library usable at small-to-medium scale:

- Adds CAP-02 metadata fields to datasets: `description`, `tags`, `favorite`, `collections` (stored in `dataset.json`).
- Adds a local-first per-dataset audit trail (`audit.jsonl`) for create + metadata edits.
- Adds duplicate-by-content (SHA-256) detection for `/ingest/commit` with an explicit user choice.
- Improves the Library “Datasets” tab to show and edit these fields, plus quick search + favorites-only filter.

## What changed

### API

- `/ingest/commit` detects identical-bytes duplicates and returns `409` with structured details by default.
  - Supports `on_duplicate=open_existing` to return the existing dataset.
  - Supports `on_duplicate=keep_both` to create a new dataset and record a `dataset.duplicate_kept` audit event.
- Added CAP-02 endpoints:
  - `GET /datasets/{dataset_id}/audit`
  - `GET /tags`
  - `GET /collections`

### Web

- Library dataset metadata editor now supports:
  - `description`
  - `tags` (comma-separated UI)
  - `favorite`
- Datasets tab adds:
  - Search (name/tags/id/source/description)
  - Favorites-only toggle
- Ingest import flow shows a duplicate conflict prompt with actions to use existing or keep both.

## Verification

- Added API tests:
  - duplicate-by-sha prompt + resolution behaviors
  - metadata persistence for tags/description/favorite
  - audit trail existence
  - tag aggregation endpoint
- Full repo verification: `scripts/verify.ps1`

## Notes / follow-ups

- Collections/folders are stored and can be patched, but the UI for editing and filtering by collections is not added yet.
- Duplicate handling is implemented for `/ingest/commit`; extending the same policy to reference imports and telescope imports would complete the CAP-02 dedupe story.
