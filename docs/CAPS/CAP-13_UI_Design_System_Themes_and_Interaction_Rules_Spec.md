**CAP-13 - UI Design System, Themes, and "Stay Sane" Interaction Rules**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-13 defines the user experience rules that keep the Spectra App clean, fast, and readable-without turning into a button jungle. This cap introduces a lightweight design system (typography, spacing, color tokens, component rules), theme support (dark/light + optional 'low-flair' mode), accessibility/contrast rules, and explicit interaction constraints to prevent resets, clutter, duplicate controls, and unreadable legends.

# 2\. User outcomes (success criteria)

- The UI feels like a clean lab notebook: minimal friction, but everything I need is easy to find.
- Legends and labels stay readable without me constantly dragging/resizing things.
- Changing one setting does not reset unrelated selections (especially Trace A/B, active datasets, notes toggles).
- The app has consistent visuals across screens (spacing, fonts, button styles, icons).
- Dark mode looks good (not gaudy) and is readable; light mode is available; optional 'low-flair' theme exists.
- Errors are understandable, actionable, and do not spam popups.

# 3\. In scope / Out of scope

## In scope

- Design tokens: typography scale, spacing scale, color palette/tokens, elevations/shadows (if applicable).
- Theme system: at minimum Dark + Light, with optional 'Low-flair dark' (reduced accent).
- Layout conventions: where the Library/Notebook/Plot live; how panels expand/collapse; what is pinned vs contextual.
- Legend/trace list behavior rules to prevent unreadable legends and constant repositioning.
- Interaction rules: no duplicated controls, minimal popups, consistent confirmation dialogs.
- Accessibility/contrast rules (practical, not academic).

## Out of scope (for CAP-13)

- Implementing every UI screen from scratch-CAP-13 defines standards and acceptance; implementation happens during CAP-specific builds.
- Branding/marketing visuals and complex animations (keep it scientific-first).
- Full internationalization/localization (can be added later).

# 4\. Core principles (from your Brain Dump, made enforceable)

- Minimal but powerful: few core panels, rich actions inside them; avoid feature duplication.
- No constant manual layout work: avoid drag-to-position legends by default; use stable docked lists and toggles.
- No state loss: changing one control must not reset unrelated state (Trace A/B persistence is a known pain point).
- Fast feedback: operations show progress; UI stays responsive; big files do not freeze the entire app.
- Errors teach: show what failed, why, and next steps; detailed logs available without extra popups.

# 5\. Layout system (recommended default)

## 5.1 'Three-column lab bench' layout

| **Zone** | **Purpose** | **Rules** |
| --- | --- | --- |
| Left (Library) | Datasets/traces list, search/filter, grouping | Always available; can collapse; never blocks plot interactions |
| Center (Workbench) | Primary plot + tabs (Overlay/Differential/Docs/etc.) | Main focus; no clutter; plot always visible |
| Right (Notebook/Inspector) | Session notebook + selected object details | Optional; can collapse; no forced writing |

## 5.2 Panel behaviors

- Panels are collapsible; collapse state persists per user.
- Use drawers/sidebars for secondary controls instead of popups.
- Prefer inline validation (highlight field + helper text) over modal dialogs.
- If a modal is required (duplicate filename conflict, destructive action), it must be short and have 2-3 clear options max.

# 6\. Legend and trace readability (hard rules)

## 6.1 Legend model (no constant manual repositioning)

- Default legend is not a floating box that must be dragged for every dataset.
- Primary legend UI is a docked Trace List: each trace has a color swatch, short display name, visibility toggle, and 'more' menu.
- Plot-internal legend can exist but should be compact and optionally hidden; docked Trace List is the authoritative legend.
- Long names: truncate in UI with tooltip; preserve full name in metadata and exports.

## 6.2 Naming and grouping rules

- Derived traces must be grouped under their parent(s): "Original" vs "Derived" (CAP-03/CAP-06).
- Support user-defined groups (e.g., 'H2O samples', 'CO2 samples', 'Jupiter set') with group toggles (show/hide all).
- If duplicate filenames occur, do not auto-suffix unless user chooses it or does not respond to the conflict prompt (align with Brain Dump).
- Never allow the legend to silently duplicate identical labels; enforce de-dup or add suffix with an explanation.

## 6.3 Quick interactions

- Hovering a trace name highlights it on the plot (visual emphasis).
- Clicking a trace focuses it (dim others) without removing them (toggle).
- Search within trace list filters live; it does not remove traces, only filters the list view.

# 7\. Themes and style system

## 7.1 Themes (minimum)

- Dark (default): science-lab look, strong contrast, low clutter.
- Light: readable for printing/sunlight, consistent spacing and hierarchy.
- Optional: Low-flair dark (same dark theme but reduced accent saturation).

## 7.2 Design tokens (framework-agnostic)

Define a small set of tokens; all UI components must use tokens instead of hard-coded colors/sizes.

| **Token category** | **Examples** | **Rules** |
| --- | --- | --- |
| Typography | H1/H2/H3, body, caption, monospace for data | Consistent hierarchy; avoid tiny text for critical info |
| Spacing | xs/s/m/l/xl | Use spacing scale; no one-off paddings unless justified |
| Color | bg, surface, text, muted, accent, warning, error, success | Accent is for emphasis, not decoration; never rely on color alone to convey meaning |
| Borders | radius-s/m/l | Keep consistent rounding; avoid mixed radii everywhere |
| Focus/Selection | focus ring, selected row background | Visible keyboard focus; consistent selected state across panels |

## 7.3 Accessibility and contrast

- Follow WCAG 2.2 contrast expectations for text and interactive targets where applicable (web/desktop equivalents).
- Provide a 'High contrast' toggle if feasible (optional for v1, recommended for v2).
- Never encode meaning only by color: always pair color with icon/label (e.g., 'Error' + red).

# 8\. Interaction rules that prevent clutter and resets

## 8.1 'Never reset' list (UI contract items)

- User login / workspace selection
- Loaded datasets in current session
- Trace visibility toggles
- Annotation toggles and selection
- Trace A / Trace B selections (CAP-06)
- Current session identity and notebook state (CAP-10)

## 8.2 Controls and duplication policy

- No two controls may perform the same job with different implementations (duplicate features are prohibited).
- If a new control replaces an old one, the old control must be removed (or hidden behind an explicit 'legacy' toggle) and documented (CAP-12 change record).
- Every control must have a one-line tooltip (what it does) and must be test-covered (CAP-12 smoke suite).

## 8.3 Popups and confirmations

- Avoid popups. Prefer inline banners and side panels.
- Use confirmations only for destructive actions or confusing collisions (delete, overwrite, replace).
- Provide 'Don't ask again' for frequent confirmations (optional but recommended).

# 9\. Error presentation (user-friendly and agent-friendly)

## 9.1 Error message structure

| **Part** | **Example content** | **Rule** |
| --- | --- | --- |
| What happened | "Could not parse file: extra header lines" | Plain language |
| Why | "The first 12 lines are metadata, not numeric columns" | Short and specific |
| What to do | "Select the data start line or choose columns" | 1-3 actions max |
| Details | Stack trace + file preview + parser report | Collapsible; copyable; not a popup wall |

## 9.2 Error surfaces

- Inline banner near the affected panel (primary).
- Notebook/timeline entry for the error (CAP-10), so errors are not 'lost'.
- Log record with dataset_id/session_id and context (CAP-12).

# 10\. Performance UX (what users see)

- Long operations show progress (spinner + text label + cancel when possible).
- UI stays responsive; avoid blocking the plot thread with file IO or downloads.
- Degrade gracefully: if a file is huge, offer preview/partial load rather than freezing.
- Cache status is visible (downloaded vs needs fetch), but not noisy.

# 11\. Acceptance tests (definition of done)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP13-T01 | Switch between Dark and Light themes | All panels remain readable; no clipped text; plot remains legible |
| CAP13-T02 | Load 10+ traces and use trace list | Trace list is readable; search works; plot highlight works; no legend chaos |
| CAP13-T03 | Add derived traces (A−B, A/B) repeatedly | Derived traces group correctly; easy 'clear derived'; names remain readable |
| CAP13-T04 | Change settings in Differential panel | Trace A/B selections do not reset; unrelated state unchanged |
| CAP13-T05 | Trigger parsing error | Error is shown inline with next steps; 'Details' available; no popup spam |
| CAP13-T06 | Duplicate filename upload | User sees 2-3 clear options; behavior matches Brain Dump rules |
| CAP13-T07 | Keyboard focus navigation (basic) | Focusable controls show visible focus; no 'lost' focus in dark mode |

# 12\. Questions to ask you (feature-level, no coding required)

- Do you want the default layout to be 'Library left, Plot center, Notebook right', or should Notebook be a tab inside the left panel?
- For legend behavior: should the plot-internal legend be hidden by default (trace list only), or shown compactly by default?
- How much 'color spectrum accent' do you want: subtle underlines only, or occasional gradient headers?
- Do you want a 'presentation mode' toggle (hides side panels; maximizes plot for screenshots)?
- For group/class use: should the UI show a clear badge when you're in a group workspace vs personal?

# 13\. Notes for agents (project practices)

- This cap is enforced by CAP-12: UI contract must include theme toggle presence, panel layout, and trace list behavior.
- Agents must not add controls unless they are discoverable, non-duplicative, and test-covered.
- If the project is Qt/PySide-based: define tokens in a central theme module and apply via stylesheets/palettes consistently.
- If the project is web-based: define tokens as CSS variables and keep components token-driven.
- Always consult the repo's reference link suite for any UI guidelines already chosen for the project.

# Appendix A. Project reference links (MUST consult)

You stated the repo contains a curated suite of reference links. Agents must consult it before choosing any UI framework-specific patterns, icon sets, or accessibility targets that are project policy. CAP-13 provides general standards and options; your link suite is the single source of truth for project decisions.

Recommended single source of truth path (update to match your repo): docs/references/REFERENCE_LINKS.md

# Appendix B. External references used in this CAP

- WCAG 2.2 (W3C Recommendation): <https://www.w3.org/TR/WCAG22/>
- What's New in WCAG 2.2 (W3C WAI): <https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/>
- Material Design 3 - Styles/Color/Typography: <https://m3.material.io/styles> ; <https://m3.material.io/styles/color/overview> ; <https://m3.material.io/styles/typography/applying-type>
- Apple Human Interface Guidelines - Typography/Color/Accessibility: <https://developer.apple.com/design/human-interface-guidelines/typography> ; <https://developer.apple.com/design/human-interface-guidelines/color> ; <https://developer.apple.com/design/human-interface-guidelines/accessibility>
- Qt Designer Manual (if using Qt Widgets): <https://doc.qt.io/qt-6/qtdesigner-manual.html>