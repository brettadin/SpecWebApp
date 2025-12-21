# CAP-05 — View-level normalization toggle (all displayed traces)

Date: 2025-12-21

## Summary

Normalization has been reworked from a per-dataset “apply transform to create a derived dataset” workflow into a **view-level toggle** that normalizes the **entire displayed graph**.

This improves consistency and predictability when comparing multiple traces and overlays.

## What changed

- Web: added a single **Normalize displayed Y** toggle that scales displayed Y values for **all visible traces**, including:
  - Original spectra traces
  - Derived spectra traces
  - Line list overlays (stick/bar traces)
- Plot overlays that depend on Y values were updated to stay visually aligned under normalization (e.g., feature markers and range highlights).
- Snapshot/export state records the view toggle so “what I saw” includes the setting.

## Notes / spec alignment

- This is an intentional UX simplification compared to the full CAP-05 spec’s “normalization as a parameterized derived transform with stored stats/provenance.”
- Baseline/smoothing and other “derived trace” transforms remain provenance-bearing derived datasets.

## Quality gates

- Web tests updated/added to assert normalization applies to line list overlays as well as spectra traces.
- Repo-wide verify gate remains green.
