# README for agents / contributors

This repo is a monorepo with a React web UI and a Python FastAPI backend.

## Quickstart (Windows)

- Start both servers: `./scripts/dev.ps1`
- Run quality gates: `./scripts/verify.ps1`

## Where to start

- Web UI entry: `apps/web/src/main.tsx` and `apps/web/src/App.tsx`
- API entry: `apps/api/app/main.py`
- API tests: `apps/api/tests/`
- Web tests: `apps/web/src/*.test.tsx`

## Do-not-break list

- Keep the navigation routes and required `data-testid`s aligned with `docs/ui_contract.json`.
- Don’t add dead UI controls; if you add a control, wire it and test it (CAP-12).
- Avoid silent data distortion (no hidden normalization/resampling).

## When you change behavior

- Add a change record under `docs/changes/` (copy the template).
- Update docs if UI labels or workflows changed (CAP-14).
