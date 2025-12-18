# 2025-12-17 — CAP-08: MAST reliability (retry/backoff + timeout mapping)

## Summary

MAST API calls are now more resilient to transient upstream failures:

- Retries transient HTTP failures (e.g., 503) with a bounded backoff.
- Maps network/timeout failures to consistent API responses (504 for timeouts).
- Includes a deterministic test that simulates a transient 503 and confirms the API recovers.

## Implementation

- Added a small urllib-based retry wrapper used by:
  - MAST invoke (`/api/v0/invoke`) requests
  - MAST product download (`/api/v0.1/Download/file`) requests
- Configurable via env vars:
  - `MAST_RETRY_MAX_ATTEMPTS` (default 3)
  - `MAST_RETRY_BACKOFF_BASE_S` (default 0.5)
  - `MAST_RETRY_BACKOFF_MAX_S` (default 4.0)
  - `MAST_RETRY_SLEEP_ENABLED` (default 1; tests set 0)
- FastAPI endpoints for MAST invoke now return `504` on `TimeoutError`.

## Evidence

- Retry wrapper: [apps/api/app/mast_client.py](apps/api/app/mast_client.py)
- Timeout mapping: [apps/api/app/main.py](apps/api/app/main.py)
- Transient failure test: [apps/api/tests/test_cap08_mast_endpoints.py](apps/api/tests/test_cap08_mast_endpoints.py)
- Verification: `scripts/verify.ps1`
