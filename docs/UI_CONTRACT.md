# UI contract

The UI contract is a small, enforceable list of UI invariants that must never disappear without an intentional change record.

Current contract file:

- `docs/ui_contract.json`

At minimum it covers:

- Primary routes (Library / Plot / Notebook / Docs)
- Required `data-testid`s for nav links so tests can detect regressions
