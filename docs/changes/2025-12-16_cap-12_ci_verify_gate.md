# CAP-12 — CI: run verify gate on PRs

Date: 2025-12-16

## Summary
Adds a GitHub Actions workflow that runs the repo’s existing verification gate (`scripts/verify.ps1`) on pushes and pull requests to `main`.

## Why
- Ensures API + web lint/tests and OpenAPI/type generation stay green.
- Catches regressions before merge using the same command developers run locally.

## What changed
- Added `.github/workflows/verify.yml` to run the full verify gate on `windows-latest`.

## Notes
- The workflow uses Python 3.12 (matches `pyproject.toml` Ruff target version) and Node 20.
