# Change Record

- Date: 2025-12-18
- Owner: GitHub Copilot
- CAP(s): CAP-01, CAP-02, CAP-07, CAP-08, CAP-13
- Summary: Treat common FITS variants (`.fts`, `.fits.gz`) as FITS in preview+ingest (avoid mislabeling as `delimited-text`), and capture follow-up UX/workflow items for future work.

## Why

- Some FITS files were being treated as `delimited-text` based on filename extension alone (e.g., `.fts` and `.fits.gz`), which makes the preview look wrong and blocks the intended FITS ingest flow.

## What changed

- API preview (`POST /ingest/preview`) now reads up to 50MB (same as commit) to reliably detect FITS table HDUs.
- FITS detection now recognizes common filename variants: `.fts` and gzip-compressed `.fits.gz`/`.fts.gz`.
- For gzip-compressed FITS, preview/commit attempt decompression before FITS parsing.
- Added regression tests covering `.fts` and `.fits.gz` for both preview and ingest commit.

## Wiring notes (UI -> logic)

- Library page uses `POST /ingest/preview` to determine parser type and present the right options.
- With the updated detection, FITS-like uploads no longer fall through to the delimited-text preview path.

## Verification

- `scripts/verify.ps1`: recommended
- API focused: `python -m pytest -q` (covers new FITS tests)

## Follow-ups

- **Line list detection (nice-to-have)**: consider a heuristic/explicit import mode for “spectral line list” CSVs (e.g., repeated/clustered X, sparse X gaps) so they render as stick overlays rather than connected line plots.
- **Telescope (MAST) workflow**: still reported as non-working in the UI; needs end-to-end debugging from target search → products → preview → import.
- **Reference import (no-URL UX)**: replace URL-based reference import with typed search + server-side fetch (similar to NIST ASD lines flow).
- **Inspector/Library list hygiene**: add organization primitives (e.g., sections/tabs, collapse, “recent” vs “all”, hide/archive, per-session grouping) to avoid scrolling through large dataset lists.
