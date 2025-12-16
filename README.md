# Spectra App (Monorepo)

Local-first web app for importing, plotting, comparing, and exporting spectroscopy datasets with strict provenance.

## Repo layout

- `apps/web`: Vite + React + TypeScript UI (React Router)
- `apps/api`: Python FastAPI service (data ingest/tools/connectors)
- `packages/api-client`: generated TypeScript types from FastAPI OpenAPI
- `docs/`: CAP specs and project discipline docs
- `scripts/`: one-command dev + verify entrypoints (CAP-12)

## Quickstart (Windows)

1. Start dev servers:
   - `./scripts/dev.ps1`

2. Run quality gates:
   - `./scripts/verify.ps1`

## Specs

The capability specs live in `docs/CAPS/` (CAP-01 .. CAP-15). Quality gates are defined in CAP-12.
