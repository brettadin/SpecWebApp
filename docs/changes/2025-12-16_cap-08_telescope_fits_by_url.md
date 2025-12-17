# Change Record

- Date: 2025-12-16
- Owner: Copilot
- CAP(s): CAP-08, CAP-01, CAP-02 (sharing defaults), CAP-12
- Summary: Implemented a CAP-08 MVP for FITS-by-URL and MAST (name lookup/search/products + download-by-dataURI) with cache-aware preview/import, refresh-safe cache versioning, minimal env-based auth pass-through, upstream error mapping, and UI visibility of cache history.

## Why

CAP-08 requires trustworthy telescope/archive ingestion with raw preservation and explicit extraction mapping. This MVP provides remote FITS retrieval (by URL and via MAST products) and imports a plottable 1D spectrum using explicit (HDU, x/y) mapping, with citation-first provenance and reproducible caching.

## What changed

### API

- Added `POST /telescope/preview/fits-by-url`:
  - Fetches a remote FITS payload by URL.
  - Enumerates table HDUs and returns candidate columns + suggested x/y indices.

- Added `POST /telescope/import/fits-by-url`:
  - Fetches a remote FITS payload by URL.
  - Extracts x/y using an explicit (hdu_index, x_index, y_index) mapping.
  - Persists raw FITS bytes and a parsed spectrum dataset.
  - Stores provenance under `reference` (citation-first) and defaults sharing policy to private.

- Added CAP-08 MAST helper endpoints (query-only; no downloads yet):
- Added CAP-08 MAST helper endpoints:
  - `POST /telescope/mast/name-lookup` (wraps `Mast.Name.Lookup`)
  - `POST /telescope/mast/caom-search` (wraps `Mast.Caom.Filtered.Position` when filters are provided)
  - `POST /telescope/mast/caom-products` (wraps `Mast.Caom.Products`, adds `recommended` boolean per row)

- Added CAP-08 MAST product download → FITS extraction endpoints (offline-testable):
  - `POST /telescope/mast/preview/fits-by-data-uri`
    - Downloads a product via MAST `Download/file` using a `data_uri`.
    - Returns the same preview structure as `/telescope/preview/fits-by-url`.
  - `POST /telescope/mast/import/fits-by-data-uri`
    - Downloads a product via `data_uri`.
    - Extracts x/y using explicit (hdu_index, x_index, y_index) mapping and imports into the Library.
    - Cache-aware by default: repeated calls reuse a local cached copy unless `refresh=true` is provided.

  ### Cache versioning (refresh preserves history)

  When `refresh=true` is used for MAST downloads, the previous cached bytes are now preserved as an immutable, versioned cache entry (rather than being overwritten). The cache metadata JSON tracks a `versions` list (downloaded_at + sha256 + filename) for reproducibility.

  The MAST preview endpoint (`/telescope/mast/preview/fits-by-data-uri`) now also returns a `cache` object including `latest` and `versions` so the UI can show (or later select) cached versions.

### Persisted provenance (product metadata)

When importing from MAST (`/telescope/mast/import/fits-by-data-uri`), the web client includes selected product metadata in the `reference.query` payload so it is persisted into `dataset.json`:

- `data_uri`
- `product_filename`
- `calib_level`
- `product_type`
- `recommended`

### Cache-aware `retrieved_at`

For MAST `data_uri` imports, `reference.retrieved_at` is now set from the download cache metadata (i.e., when the product bytes were actually fetched), not just the time of import. This avoids provenance drift when preview populates the cache and import reuses it.

### Minimal auth pass-through (env)

For protected MAST services/products, the API supports passing an `Authorization` header via environment variables:

- `MAST_AUTHORIZATION`: full header value (e.g. `Bearer ...`)
- `MAST_BEARER_TOKEN`: token only; the client will send `Authorization: Bearer <token>`

This is intentionally an MVP (no UI token storage) to keep CAP-08 flows offline-testable and avoid persisting secrets.

### Upstream error mapping

MAST upstream HTTP errors now map to clearer API responses:

- 401/403/404 propagate as-is (for missing/invalid auth, forbidden, or missing products)
- Upstream 5xx errors map to `502 Bad Gateway`

### Tests

- Added an API test that serves a tiny FITS file from a local HTTP server, exercises preview + import, and verifies the saved dataset contains the extracted data and reference summary fields.
- Added an API test that runs against a local fake MAST `/invoke` server to verify the MAST endpoints without relying on external network access.
- Extended the MAST test server to also emulate `Download/file`, and added a test that previews/imports a FITS product by `data_uri` end-to-end.

### Web

- Library MAST preview now displays cache information returned by the API (`cache_hit`, latest cached download metadata, and version history) so users can understand offline/reproducibility behavior.

## Files

- API implementation: apps/api/app/telescope_import.py
- API routes: apps/api/app/main.py
- API test: apps/api/tests/test_cap08_telescope_fits_by_url.py
- MAST client: apps/api/app/mast_client.py
- MAST endpoints: apps/api/app/telescope_mast.py
- API test: apps/api/tests/test_cap08_mast_endpoints.py
- Web UI: apps/web/src/pages/LibraryPage.tsx

## Verification

- scripts/verify.ps1: PASS

## Follow-ups

- Expand MAST filters and metadata (instrument, date range, spectral range, processing level, proposal/program IDs) per CAP-08 spec.
- Support selecting/downloading multiple products (checkboxes) and an “advanced” toggle for non-recommended artifacts.
- Add token entry + secure local credential storage (OS keychain), plus clearer UX for protected/exclusive products.
- Expand FITS extraction beyond table HDUs: 2D rectified products and 3D cube → region-based 1D extraction (with explicit parameters and labeling).
- Propagate archive quality flags and add view-only masking/toggles (and wavelength-axis display reversal as view-only).
- Produce a parse-report bundle on extraction failure (raw preserved + actionable diagnostics) instead of just failing.
- Add size-aware UX (warn before huge downloads; allow metadata-only preview when possible).
- Implement CAP-02 sharing gates specific to protected imports (default private, block public share; “share pointer only” option).
