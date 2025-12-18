# CAP-12 — UI contract enforcement (nav)

Date: 2025-12-17

## Goal

Enforce `docs/ui_contract.json` as a regression gate so required navigation affordances can’t silently drift.

## What changed

- Web test now reads the UI contract and asserts the required nav test IDs exist.
- Web TypeScript config now supports JSON module imports.

## Evidence

- Contract: `docs/ui_contract.json`
- Test: `apps/web/src/App.test.tsx`
- TS config: `apps/web/tsconfig.app.json`

## Notes

This is enforced automatically anywhere `npm --workspace apps/web run test` runs, including `scripts/verify.ps1`.
