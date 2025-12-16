# Runbook

## Common commands

- Dev servers: `./scripts/dev.ps1`
- Verify (lint/tests/typegen): `./scripts/verify.ps1`

## Add a new API endpoint

- Implement in `apps/api/app/`
- Add tests in `apps/api/tests/`
- Export OpenAPI snapshot via `scripts/verify.ps1`
- Re-generate types: `npm --workspace packages/api-client run gen`

## Add a new UI control

- Wire it to real state / handlers (no dead controls)
- Add/adjust a test (web) so the control is covered
- Update docs if the control changes user workflow (CAP-14)
