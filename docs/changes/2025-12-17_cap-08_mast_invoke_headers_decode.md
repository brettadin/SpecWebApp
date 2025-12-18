# CAP-08 — MAST invoke hardening (headers + decoding)

Date: 2025-12-17

## Goal

Make MAST calls more robust across environments by using more interoperable HTTP headers and safer response decoding.

## What changed

- Updated `Accept` and `User-Agent` headers for MAST invoke requests.
- Decode upstream response as UTF-8 with replacement to avoid hard failures on unexpected bytes.

## Evidence

- Client helper: `apps/api/app/mast_client.py`

## Notes

This is a compatibility hardening step; it does not introduce token UX or protected-product flows.
