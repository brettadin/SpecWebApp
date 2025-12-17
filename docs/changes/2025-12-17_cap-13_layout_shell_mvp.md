# CAP-13 — Layout shell (MVP)

Date: 2025-12-17

## Summary
Introduces a shared “lab bench” shell layout to align with CAP-13: left Library panel, center Workbench (routed content), and right Notebook/Inspector panel.

## User-facing behavior
- The app uses a 3-column layout:
  - Left: Library panel (collapsible)
  - Center: Workbench (Plot, Docs)
  - Right: Notebook/Inspector panel (collapsed by default; expandable)
- Panel collapse state persists per user on the current device via `localStorage`.

## Notes
- This is a layout-first slice; existing pages (Plot, Docs) retain their internal layouts for now.
- Follow-ups will migrate Plot’s sidebar controls into the global panels and introduce design tokens/themes.
