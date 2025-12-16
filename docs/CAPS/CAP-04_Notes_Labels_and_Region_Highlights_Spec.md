**CAP-04 - Notes, Labels, and Region Highlights (Annotations)**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-04 defines how users create, edit, toggle, and share annotations attached to spectra: point notes (x,y), range highlights (x1-x2), labels for peaks/dips, and contextual notes. Annotations must be visible on plots (CAP-03) as tooltips/overlays, must persist with datasets via the Library (CAP-02), and must export cleanly with reproducibility metadata (CAP-11). CAP-04 explicitly avoids altering data arrays; it augments interpretation and communication.

# 2\. User outcomes (success criteria)

- I can click a point and add a note that appears on hover or when notes are toggled on.
- I can select an X-range (x1-x2) to highlight and label it (e.g., functional group band, known methane feature).
- I can edit or delete my notes later, and notes remain attached to the dataset when I reopen the app.
- I can share notes with the dataset (private/group/public) according to the dataset's permissions.
- Annotations do not clutter the plot by default; I can toggle them on/off and filter them (mine vs shared vs templates).
- Exports include annotations and the context needed to interpret them (author, timestamps, coordinates, units).

# 3\. In scope / Out of scope

## In scope

- Point notes (anchored to data coordinates; optional y anchoring).
- Range highlights: vertical spans (x1-x2) with optional band labeling; optional horizontal spans (y1-y2) when needed.
- Peak/dip labels as a special-case point note (can be user-created; automatic peak finding is CAP-05 or a later CAP).
- Annotation visibility controls: toggle all, toggle per dataset, toggle per author/type.
- Persistence: store annotations in Library and bind them to dataset versions/IDs; audit basic changes.
- Sharing: annotations inherit dataset visibility and sharing permissions; authorship tracked.
- Export contract: annotations included in the export manifest and plot renders.

## Out of scope (for CAP-04)

- Automated assignment of features to molecular motions or spectral line identification (later: CAP-07/08/09 depending on implementation).
- Advanced collaborative editing (real-time multi-user conflicts) - CAP-04 supports multiple authors but not live co-editing.
- Complex drawing tools (freehand) - focus is point + range annotations.
- Time series annotations (explicitly out of v1 scope per Brain Dump).

# 4\. Design principles

- Be useful without clutter: default view should remain readable; annotations are opt-in display layers.
- Trust-first: annotations never imply the data changed; they are overlays only.
- Shareable context: a note without who/when/why is not enough-authorship and timestamps are mandatory.
- Unit-stable anchoring: annotations are stored in dataset-native coordinates (x, y) as imported/defined; any display conversions must be traceable.
- Low friction: 1-2 actions to add a note or highlight; editing is direct and obvious.

# 5\. User workflows (short stories)

## Workflow A - Add a point note at (x,y)

- User hovers a trace and clicks a point (or uses a 'Add note' tool mode).
- App opens a small inline editor (not a big popup) to enter text; optional fields: label/category.
- Annotation appears as a small marker/badge on the plot and shows text in tooltip.
- Annotation is saved to the dataset record in the Library.

## Workflow B - Highlight a band (x1-x2)

- User drags a box across the X axis region (or uses a 'Highlight range' tool).
- App snaps to the selected x1 and x2 bounds and asks for a label (e.g., 'CH4 band', 'C=O stretch').
- App renders a translucent vertical highlight spanning the plot height with a small label.
- User can later adjust endpoints by dragging handles (desktop) or editing values (web).

## Workflow C - Shared dataset annotations (group/class)

- Dataset is shared to a group (CAP-02).
- Different users add notes/highlights; each annotation records its author and time.
- Viewer can filter annotations by author/type (e.g., show only my notes; show instructor notes).

## Workflow D - Export with annotations

- User exports a plot and data bundle (CAP-11).
- Export includes the plot render with visible annotations (if toggled) and an annotations.json file for machine-readable re-use.
- Export manifest includes the annotation set and coordinate/unit information.

# 6\. UI requirements

## Required plot-layer tools (integrates with CAP-03)

- Global toggle: Show annotations (on/off).
- Tool modes: Add point note; Add range highlight; Select/edit annotations.
- Annotation list panel (collapsible): shows annotations for selected dataset(s) with search/filter (type, author, tag).
- Quick edit: clicking an annotation opens inline edit (text + category + optional link).
- Delete: must require confirmation (undo is recommended).

## Annotation types (minimum)

| **Type** | **UI creation** | **Visual on plot** | **Typical use** |
| --- | --- | --- | --- |
| Point note | Click point / Add note mode | Small marker + tooltip | Specific feature/peak/dip note |
| Range highlight (x1-x2) | Drag select region / Highlight mode | Vertical translucent band + label | Functional group region, methane bands, etc. |
| Reference label (manual) | From list or manual | Marker/badge or line | Line markers for known references (auto later) |
| General dataset note | Dataset detail panel | Not necessarily on plot | High-level context, provenance notes |

## Clutter controls

- Filter by: dataset, type, author, tag.
- Opacity controls for highlights (global slider).
- Limit label density: if too many labels overlap, collapse into count badges; full text remains in the annotation list.

# 7\. Data model (stored form)

## Annotation entity (minimum fields)

| annotation_id | Stable internal ID (UUID). |
| --- | --- |
| dataset_id | Dataset this annotation belongs to (CAP-02 Dataset). |
| dataset_version_id | Optional; if versioning exists, bind to version or specify 'applies_to_all_versions'. |
| author_user_id | User identity (or 'local/anonymous'). |
| created_at / updated_at | Timestamps. |
| type | point \| range_x \| range_y \| dataset_note \| reference_marker |
| text | User-entered text/label. |
| tags | Optional list (e.g., CH4, CO2, H2O, functional_group). |
| x0, x1 | For point: x0 only. For range: x0,x1. Stored in dataset-native x_unit. |
| y0, y1 | For point: y0 optional (if anchoring to a specific trace y value). For y-range: y0,y1. |
| x_unit / y_unit | Stored explicitly to avoid ambiguity; defaults to dataset units at creation. |
| trace_binding | Optional: bind to a specific trace_id if multiple traces are present; else dataset-level. |
| visibility | inherits_dataset \| private \| group \| public (default inherits_dataset). |
| style | Optional: color/opacity/line style label; keep simple; theme-controlled by default. |
| link | Optional URL/DOI/reference pointer when the note cites something. |

## Storage rule

- Annotations are stored as separate records linked to datasets; datasets remain immutable.
- Annotation edits are tracked in an audit log (CAP-02 AuditEvent) as 'annotation_created/updated/deleted'.
- If a dataset is duplicated or versioned, annotation carryover behavior must be explicit (copy, link, or none).

# 8\. Coordinate semantics and unit safety

- Store x coordinates in dataset-native x units as imported (e.g., cm⁻¹ for IR, nm for UV-Vis).
- If the UI allows unit display conversions later, annotations must remain attached to the same physical coordinate; conversions must be applied consistently at render-time.
- For range highlights, store endpoints in numeric form and keep x0 < x1 regardless of axis direction in display.
- Do not assume y anchoring is stable across normalization/transforms; if a note must track a peak across transforms, store it as x-only with 'y_auto' rendering (optional).

# 9\. Plot rendering guidance (implementation options)

## Plotly-family (web/hybrid)

- Use figure annotations for text labels (fig.add_annotation) and layout shapes for highlights/regions.
- For simple full-height vertical regions, use add_vrect/add_hrect where available.
- Tooltips: hovertemplate for traces + separate annotation hover behavior via custom callbacks as needed.

## PyQtGraph-family (desktop)

- Use GraphicsItems to render text/markers; for editable X-ranges use LinearRegionItem for interactive dragging.
- For more complex region selection, ROI classes are available.

# 10\. Behavior rules (MUST / MUST NOT)

## Non-negotiables

- MUST NOT alter stored dataset X/Y arrays when creating annotations.
- MUST preserve annotation authorship and timestamps; never overwrite without recording updated_at.
- MUST allow annotations to be toggled off globally and per dataset.
- MUST respect dataset permissions: if you cannot edit a dataset, you cannot modify or delete its annotations unless you are the annotation author and policy permits.
- MUST keep annotation text editable after creation.

## Sharing rules

- Default annotation visibility inherits dataset visibility/sharing settings.
- Users may optionally keep personal/private notes on shared datasets (visibility=private).
- Public datasets must display at least the public annotations; private notes remain private.

# 11\. Export requirements (CAP-04 contributions)

- Exports (CAP-11) must include a machine-readable annotations file (e.g., annotations.json).
- Plot exports must reflect the current 'Show annotations' toggle state: if enabled, annotations appear in the image/PDF/SVG; if disabled, they do not.
- Export manifest must include: annotation counts, authors (as IDs or anonymized labels), coordinate/unit fields, and a checksum of annotations.json for integrity.

# 12\. Acceptance tests (concrete checks)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP04-T01 | Add point note at x,y on a trace | Note appears; tooltip shows note text; saved and persists after restart |
| CAP04-T02 | Edit point note text | Text updates on plot and in list; updated_at changes; audit event recorded |
| CAP04-T03 | Delete point note | Note removed; can undo (if supported); audit event recorded |
| CAP04-T04 | Create range highlight x1-x2 | Band renders; label visible; endpoints editable |
| CAP04-T05 | Toggle annotations off/on | Plot hides/shows annotations without affecting traces or zoom state |
| CAP04-T06 | Filter annotations by author/type | List and plot reflect filters correctly |
| CAP04-T07 | Shared dataset: two users add notes | Both sets visible; authorship correct; permissions enforced |
| CAP04-T08 | Export with annotations on | Exported plot includes annotations; annotations.json included; manifest references it |
| CAP04-T09 | Export with annotations off | Exported plot excludes annotations; annotations.json still included (flagged as hidden_in_render=true) |

# 13\. Open questions (tracked, not blocking CAP-04 spec)

- Should point notes default to x-only anchoring (more robust across transforms), with y as optional?
- Do we allow per-annotation color, or enforce theme-based styles only (simpler, cleaner UI)?
- What is the default policy on shared datasets: can non-owners delete others' annotations, or only their own?
- Do we need annotation versioning, or is updated_at + audit log sufficient for v1?

# Appendix A. Definitions

- Annotation: a user-created overlay (note/label/highlight) attached to a dataset.
- Point note: annotation anchored to a specific coordinate (x, optionally y).
- Range highlight: annotation spanning an interval (x1-x2 or y1-y2) used to mark a band/region.
- Annotation layer: the UI display mode that renders annotations on the plot.

# Appendix B. Project reference links (MUST consult)

Agents must consult the user-maintained reference link suite in the repository before implementing annotation storage formats or adding external reference-driven labels.  
<br/>Single source of truth: docs/references/REFERENCES_RAW.md (or the path used in your project).

# Appendix C. External references used in this CAP

- Plotly text and standalone annotations (fig.add_annotation): <https://plotly.com/python/text-and-annotations/>
- Plotly shapes (layout shapes for regions): <https://plotly.com/python/shapes/>
- Plotly horizontal/vertical shapes helpers (add_vrect/add_hrect): <https://plotly.com/python/horizontal-vertical-shapes/>
- Plotly annotations reference (layout.annotations): <https://plotly.com/python/reference/layout/annotations/>
- PyQtGraph LinearRegionItem (editable x-range marker): <https://pyqtgraph.readthedocs.io/en/latest/api_reference/graphicsItems/linearregionitem.html>
- PyQtGraph ROI system (general selection tools): <https://pyqtgraph.readthedocs.io/en/latest/api_reference/graphicsItems/roi.html>
- W3C Web Annotation Data Model (optional interoperability baseline): <https://www.w3.org/TR/annotation-model/>