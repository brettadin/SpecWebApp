# Change Record

- Date: 2025-12-16
- Owner: Copilot
- CAP(s): CAP-11 (Exports)
- Summary: Added a minimal CAP-11 “Dataset export” ZIP bundle endpoint in the API that packages dataset metadata, annotations, derived transforms, and (when allowed) raw payloads with a manifest and checksums.

## Why

CAP-11 requires trustworthy, reproducible export artifacts. This slice focuses on a single-dataset export bundle (CAP-11 §4.2) with license-aware raw inclusion.

## What changed

### API

- Added `GET /datasets/{dataset_id}/export/dataset.zip` to export a single dataset as a ZIP bundle.
- Bundle contents (minimal deterministic structure):
  - `MANIFEST.json` (minimum schema + pointers)
  - `README.txt`
  - `data/dataset.json`
  - `annotations/annotations.json` (if present)
  - `provenance/transforms.json` (if present, derived datasets)
  - `raw/*` (only if permitted)
  - `checksums/SHA256SUMS.txt`
- License/sharing gate:
  - For datasets with `reference.sharing_policy.export_raw_ok=false`, raw payloads are omitted and the manifest includes pointers (URL/retrieved/citation) for reproducibility.

### Tests

- Added API tests covering:
  - Local ingest datasets include raw by default.
  - Reference-like datasets with `export_raw_ok=false` omit raw and include pointers.

## Files

- API bundle builder: apps/api/app/export_bundle.py
- API route: apps/api/app/main.py
- Tests: apps/api/tests/test_export_bundle.py

## Verification

- scripts/verify.ps1: PASS

## Follow-ups

- CAP-11 “What I see” export (plot images + plotted traces + plot state snapshot).
- Session timeline (“what I did”) integration once CAP-10 event stream is available.
- More complete manifest schema alignment (datasets/traces/lineage sections) as export surface grows.
