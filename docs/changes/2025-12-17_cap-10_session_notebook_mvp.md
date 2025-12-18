# CAP-10 — Session notebook MVP

Date: 2025-12-17

## Goal

Start CAP-10 with a minimal, working “session notebook” so users can:
- create a session
- record notes
- review a timeline of events

## What changed

### API
- Added local-first session storage under `data/sessions/`.
- Added endpoints:
  - `GET /sessions`
  - `POST /sessions`
  - `GET /sessions/{session_id}`
  - `POST /sessions/{session_id}/events`

### Web
- Replaced the Notebook panel placeholder with a simple session list + timeline viewer + “add note” control.

## Evidence

- API implementation: `apps/api/app/sessions.py`
- API wiring: `apps/api/app/main.py`
- API tests: `apps/api/tests/test_cap10_sessions.py`
- UI: `apps/web/src/pages/NotebookPage.tsx`

## Notes

This is intentionally MVP scope (no collaboration, no automatic event capture from Plot/Library actions yet).
