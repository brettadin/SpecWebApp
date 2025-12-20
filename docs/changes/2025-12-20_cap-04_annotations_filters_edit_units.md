# 2025-12-20 — CAP-04: Annotation UX + unit-stable coordinates

## Summary

Improves CAP-04 annotations on the Plot page:

- Stores annotation X coordinates in dataset-native units even when the plot is displayed in converted units.
- Adds per-dataset annotation visibility toggles.
- Adds filtering and inline editing in the annotation list.
- Adds delete confirmation and a highlight opacity control.

## User-facing changes

- **Per-dataset toggles**: choose which visible traces show annotations.
- **Filters**: filter annotations by dataset, type, author, and text (filters affect both the list and plot rendering).
- **Editing**: inline edit for annotation text and coordinates (point x/y, range x0/x1).
- **Safety**: delete requires confirmation.
- **Visual control**: highlight opacity slider for range bands.

## Files touched

- apps/web/src/pages/PlotPage.tsx
- docs/CAP_PROGRESS_INVENTORY.md
