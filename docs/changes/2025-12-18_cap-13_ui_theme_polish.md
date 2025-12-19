# CAP-13 — Theme tokens + UI polish (scientific dark)

Date: 2025-12-18

## Summary

Bring the web UI closer to the CAP-13 design-token direction by introducing/expanding a tokenized theme layer and tightening baseline component styling (inputs/buttons/disclosure) without changing workflows.

## Why

- The UI was reading as overly rigid and visually “flat,” with inconsistent control styling across pages.
- CAP-13 calls for a design-token layer; having a single token file makes incremental reskinning easier than scattered inline colors.

## What changed

- Added/expanded a tokenized theme file and base element styling:
  - global tokens (background/foreground/card/border/accent/ring, radii, shadows)
  - consistent styling for `input`, `select`, `textarea`, `button`
  - improved `details/summary` styling for collapsible blocks
- App shell polish:
  - nav items as “pills” using theme tokens
  - slightly translucent header background + subtle shadow
  - sidebar shadows to reduce the “boxed grid” feel
- Buttons:
  - subtle accent underline glow on hover/focus (not a full button glow)

## Wiring notes (UI → logic)

- Theme is applied globally via `apps/web/src/main.tsx` importing `apps/web/src/styles/scientific_theme.css`.
- Base styles apply to native elements (`button`, `input`, etc.) so most existing UI benefits without refactors.

## Verification

- `scripts/verify.ps1`: pass
- Web tests: `npm --workspace apps/web run test` (included in `scripts/verify.ps1`)

## Follow-ups

- Some buttons use inline `background: ...` styles (shorthand) which can override `background-image` and reduce visibility of the underline effect.
  - Prefer `backgroundColor` in inline styles to preserve the underline.
  - Alternatively: move those button styles into CSS classes over time.
