# 2025-12-17 — CAP-02 Dataset metadata editing (rename + units)

## Summary
Added a minimal but workflow-critical metadata editing capability for datasets:
- API: `PATCH /datasets/{dataset_id}` supports updating `name`, `x_unit`, and `y_unit`.
- Web: Library page now includes an inline editor on each dataset row to rename and fix units.

This unblocks Plot features that require known units (e.g., unit conversion and some CAP-09 feature/match workflows).

## Evidence
- API implementation: `apps/api/app/datasets.py`, `apps/api/app/main.py`
- API test: `apps/api/tests/test_ingest_commit_and_list.py`
- Web UI: `apps/web/src/pages/LibraryPage.tsx`

## Notes
- Empty strings for `x_unit`/`y_unit` are treated as `null`.
- Name updates reject empty/whitespace-only strings.
