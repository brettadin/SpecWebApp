# CAP-08 — MAST name lookup request fix

Date: 2025-12-17

## Goal

Improve real-world compatibility of the MAST name lookup call (observed as “MAST name lookup failed” in UI screenshots) by matching MAST’s expected request shape.

## What changed

- Removed the redundant `format` key from the `params` object for `Mast.Name.Lookup`.
  - The request already declares `format: "json"` at the top level.

## Evidence

- Request builder: `apps/api/app/telescope_mast.py`

## Notes

This change is intentionally minimal and should not affect other MAST services.
