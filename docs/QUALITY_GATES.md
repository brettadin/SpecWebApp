# Quality gates

The project’s baseline quality gate is:

- `./scripts/verify.ps1`

It runs:

- API formatting + lint (`ruff`) and tests (`pytest`)
- Web lint (`eslint`) and tests (`vitest`)
- API client type generation (`packages/api-client`)

## UI contract

Navigation routes and required test IDs are specified in `docs/ui_contract.json`.

If you change navigation, update the UI contract and tests in the same change.
