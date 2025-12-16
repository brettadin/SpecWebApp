**CAP-05 - Normalization, Unit Display, and Transform Pipeline (Non-Destructive)**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-05 defines how the app performs optional data transforms that make curves comparable while preserving trust. This includes Y-axis normalization/scaling, baseline correction, smoothing (optional), and view-level unit display conversions for the spectral axis. CAP-05 is explicitly non-destructive: raw imported data (CAP-01) remains immutable; transforms produce derived traces and/or view layers with full provenance. The user must explicitly choose any transform; nothing in CAP-05 runs automatically on ingest.

# 2\. User outcomes (success criteria)

- I can make spectra comparable by normalizing/scaling Y values (without changing X).
- Normalization never happens automatically during import; it only happens when I select it.
- I can display the same spectrum in different X units (nm, µm, cm⁻¹, Å) without cumulative conversion errors.
- If I apply baseline correction or smoothing, it is clearly labeled as a transform and fully reproducible.
- Transforms create derived traces that are organized (Original vs Derived), can be cleared, and can be saved to the Library intentionally.
- Export bundles include a machine-readable transform manifest (what I did + parameters + parent dataset IDs).

# 3\. In scope / Out of scope

## In scope

- Y-axis normalization/scaling modes (user-selectable) applied to one or multiple traces.
- Baseline correction options (user-selectable, reproducible).
- Optional smoothing as an explicit transform (not default).
- Display-only unit conversions for the spectral axis (wavelength/wavenumber/frequency/energy) with a canonical baseline to avoid drift.
- Transform pipeline model: derived trace lineage, parameter capture, reversibility, and labeling.
- UI panel for selecting/applying transforms to selected traces; derived trace management controls.

## Out of scope (for CAP-05)

- A−B and A/B operations (CAP-06) - CAP-05 provides resampling alignment primitives but does not define the differential workflow.
- Automated peak picking and compound identification (later CAPs).
- Remote retrieval from external references/archives (CAP-07/08).
- Export UI itself (CAP-11) - CAP-05 defines what metadata must be produced for export.

# 4\. Design principles (trust rules)

- Non-destructive by design: raw X/Y never overwritten; transforms are separate artifacts.
- No silent interpolation: if resampling/alignment is used, it must be explicit and logged (and may be disabled).
- No X normalization: X is physical; user may convert units for display but not normalize.
- Explainability: the UI must label what is transformed and how (badges, provenance, tooltips).
- Reproducibility: every transform is parameterized and included in a manifest.

# 5\. Transform categories

## View-level (display-only) transforms

- X-axis unit display conversion (e.g., nm ⇄ cm⁻¹) using a canonical baseline and explicit equivalencies.
- Axis direction display (increasing vs decreasing) without rewriting stored arrays (optional).
- Crop/zoom is a view state and not a data transform (CAP-03), but may be saved as a 'view preset' later.

## Data-level transforms (produce derived traces)

- Y normalization/scaling (max, min-max, z-score, area, etc.).
- Baseline correction (subtract estimated baseline).
- Smoothing (e.g., Savitzky-Golay) as an explicit derived trace.
- Resampling/alignment to a target X-grid (optional primitive used by CAP-06; must be explicit).

# 6\. UI requirements

## Transform panel (minimum)

- Select target traces (multi-select) from the current plot/session.
- Section: Y normalization/scaling (dropdown + parameters).
- Section: Baseline correction (dropdown + parameters).
- Section: Smoothing (dropdown + parameters, off by default).
- Section: X unit display (dropdown for nm/Å/µm/cm⁻¹; optionally frequency/energy) - view-only.
- Apply button: creates derived trace(s) with clear naming and grouping.
- Derived trace management: 'clear last derived', 'clear all derived', 'save derived to Library'.

## Derived trace labeling and grouping

- Derived traces must appear under a 'Derived' group (CAP-03 trace panel) and visually tagged (badge/prefix).
- Default derived naming uses short prefixes (examples): NORM(max): &lt;name&gt;, BASE(algorithm): &lt;name&gt;, SAVGOL(w,p): &lt;name&gt;.
- Users can assign a short alias; full transform chain remains in provenance.

# 7\. Y normalization/scaling modes (definitions and rules)

## Required modes (v1 baseline)

| **Mode** | **Definition (Y only)** | **Notes / when to use** |
| --- | --- | --- |
| None | No scaling | Default; always available. |
| Max normalization | y' = y / max(\|y\|) | Quick comparability across traces; preserves shape. |
| Min-max scaling | y' = (y - min(y)) / (max(y) - min(y)) | Maps to \[0,1\]; sensitive to outliers. |
| Z-score (standardization) | y' = (y - mean(y)) / std(y) | Useful for comparing relative deviations; can hide absolute meaning. |
| Area normalization | y' = y / ∫\|y\| dx (over selected range) | Makes curves comparable by integrated magnitude; requires X spacing awareness. |

## Rules

- Normalization MUST apply only to Y; X values remain unchanged.
- Normalization MUST be applied per-trace (not across all traces), unless an explicit 'global reference trace' option is selected.
- If y is constant or max(y)==min(y), normalization must refuse safely and explain why (avoid divide-by-zero).
- Normalization parameters must be saved: mode, selected range (if any), and computed statistics (max/min/mean/std/area).

## Range-limited normalization (recommended)

- Allow normalizing over a selected X window (e.g., the currently zoomed region or an explicit x1-x2).
- If a range-limited mode is used, store x1/x2 and the selection method (manual vs current view).

# 8\. Baseline correction (explicit, reproducible)

## Baseline correction goals

- Remove slowly varying background so peaks/bands are easier to compare.
- Never claim the corrected curve is 'more true'; label it as baseline-corrected.
- Provide simple default algorithms and expose parameters cautiously to avoid user overwhelm.

## Recommended baseline options

| **Option** | **Implementation guidance** | **Notes** |
| --- | --- | --- |
| None | No baseline correction | Default. |
| Polynomial baseline | Fit low-order polynomial to designated baseline points or robustly estimated baseline | Simple; can fail if baseline is complex. |
| Algorithmic baseline (library) | Use a baseline correction library with multiple algorithms and consistent API | Prefer known libraries; log algorithm + params. |

## Behavior rules

- Baseline correction MUST output both the corrected signal and the estimated baseline (baseline trace optional to display).
- Baseline correction MUST record algorithm name, parameters, and any regions excluded/used.
- Baseline correction MUST be reversible by deleting the derived trace; the raw trace remains unchanged.

# 9\. Smoothing (optional)

## Positioning

- Smoothing is NOT a default and should be treated as an interpretive aid (especially for noisy lab scans).
- Smoothing must be labeled clearly; it must not be applied silently or assumed in exports unless selected.

## Recommended smoothing option (v1 baseline)

| **Option** | **Parameters** | **Notes** |
| --- | --- | --- |
| Savitzky-Golay | window_length (odd), polyorder | Preserves peak shapes better than simple moving average; still a transform. |

## Rules

- Smoothing MUST be applied on Y only.
- Smoothing MUST preserve array length (same number of points) unless explicitly configured otherwise.
- If parameters are invalid (e.g., window too large or not odd), the UI must block apply and explain.
- Store smoothing parameters and the library/function signature used.

# 10\. X-axis unit display conversions (view-level)

## Supported display units (v1 baseline)

- Wavelength: nm, Å, µm
- Spectroscopic wavenumber: cm⁻¹
- Optional (advanced): frequency (Hz) and energy (eV) if needed for astronomy use-cases

## Canonical baseline rule (prevents cumulative scaling errors)

- Store a canonical X axis for each dataset (exactly as imported) and its declared unit.
- All display conversions must be computed from the canonical axis on demand; never convert from an already-converted display axis.
- If the dataset unit is unknown, block conversion until the user sets an X unit (CAP-01/CAP-02 metadata fix).

## Conversion correctness

- Use a unit system that supports spectral equivalencies (wavelength ⇄ wavenumber ⇄ frequency ⇄ energy).
- Ensure the app distinguishes spectroscopic wavenumber (1/λ) vs angular wavenumber (2π/λ); v1 should default to spectroscopic.

# 11\. Resampling/alignment primitive (optional, explicit)

This section defines a reusable primitive for later capabilities (especially CAP-06). It is included here because it is a transform: it can synthesize intermediate values via interpolation. Because your 'don't lie to me' rules are strict, resampling must be opt-in and clearly labeled.

## Alignment modes

| **Mode** | **Definition** | **Trust notes** |
| --- | --- | --- |
| None (no resampling) | Operate only where X grids already match; otherwise refuse or limit to visual overlay | Safest. |
| Nearest-neighbor | Map values to nearest existing point on target grid | Less smoothing; can alias. |
| Linear interpolation | Interpolate between neighboring points on target grid | Creates synthetic points; label clearly. |

## Rules

- Resampling MUST be optional and default OFF.
- If enabled, resampling MUST operate within the overlap range only (unless user explicitly requests extrapolation; default: no extrapolation).
- Resampling MUST store: method, target grid definition, overlap range used, and a flag that values are interpolated.
- UI must display a trust badge on any trace that includes resampling/interpolation.

# 12\. Provenance and transform manifest

## Transform record (minimum)

| transform_id | UUID for each transform step |
| --- | --- |
| parent_trace_id | Original or derived trace being transformed |
| transform_type | normalize \| baseline \| smooth \| resample \| unit_display |
| parameters | JSON object (mode, window_length, polyorder, etc.) |
| created_at / created_by | Timestamps and actor |
| output_trace_id | Derived trace produced (if data-level) |
| notes | Optional user note explaining intent |

## Manifest rules

- Every derived trace must have a complete lineage chain back to the raw dataset_id + file checksum (CAP-01/02).
- Exports (CAP-11) must include a transforms.json file listing the chain for every exported trace.
- Transform ordering must be explicit (e.g., baseline → normalize → smooth) and stored as an ordered list.

# 13\. Behavior rules (MUST / MUST NOT)

## Non-negotiables

- MUST NOT run any transforms automatically on ingest or by default when plotting.
- MUST NOT normalize X, and MUST NOT apply unit conversions by repeatedly converting the display axis.
- MUST keep raw data immutable; transforms produce derived traces or view-only displays.
- MUST label transformed traces clearly and maintain Original vs Derived grouping.
- MUST support 'clear derived' controls to prevent clutter.
- MUST capture transform parameters and computed statistics for reproducibility.

## Errors and warnings

- If a requested transform is not valid (divide-by-zero, invalid window length), refuse with a clear message and suggestion.
- If a transform depends on units (e.g., wavenumber conversions) and units are missing/unknown, block and instruct the user to set units in dataset metadata.

# 14\. Acceptance tests (concrete checks)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP05-T01 | Apply max normalization to one trace | Derived trace created; y' max(\|y\|)=1; original unchanged; provenance recorded |
| CAP05-T02 | Apply min-max scaling to multiple traces | Derived traces created for each; labeled; original unchanged |
| CAP05-T03 | Apply z-score; confirm mean≈0 std≈1 | Derived trace created; stats stored; original unchanged |
| CAP05-T04 | Apply area normalization over selected x-range | Derived trace created; range stored; reproducible |
| CAP05-T05 | Apply baseline correction; show baseline | Corrected trace + optional baseline trace; algorithm and params stored |
| CAP05-T06 | Apply Savitzky-Golay smoothing | Derived trace created; parameters validated; clear labeling |
| CAP05-T07 | Toggle x display nm⇄cm⁻¹ repeatedly | No cumulative drift; axis correct each time; canonical baseline used |
| CAP05-T08 | Attempt conversion when x_unit unknown | Blocked with message to set units; no silent assumption |
| CAP05-T09 | Resampling OFF with mismatched grids | Operation that requires alignment refuses or warns; no interpolation performed |
| CAP05-T10 | Resampling ON (linear) within overlap | Derived trace marked interpolated; overlap stored; no extrapolation by default |
| CAP05-T11 | Clear derived traces | Derived traces removed from plot; originals remain; library unchanged unless saved |

# 15\. Implementation guidance (what to use - options, not mandates)

## Recommended libraries (Python ecosystem examples)

- Unit conversions: use a quantity/units system with spectral equivalencies (e.g., Astropy units) for wavelength ⇄ wavenumber conversions.
- Smoothing: use a well-documented implementation of Savitzky-Golay (e.g., SciPy).
- Baseline correction: use a baseline correction library that supports multiple algorithms with consistent API (e.g., pybaselines).
- Normalization/scaling: can be implemented directly (simple formulas) or use established scaler implementations (e.g., scikit-learn scalers) if appropriate.

## Where to put what (module boundaries)

- transforms/: pure functions (normalize, smooth, baseline, resample) with no UI dependencies
- units/: canonical axis store + conversion utilities
- provenance/: transform manifest writer + schema validation
- ui/transforms/: transform panel and derived trace management controls

# 16\. Open questions (tracked, not blocking CAP-05 spec)

- Which normalization modes should be default-visible vs 'advanced' (to keep UI clean)?
- Do we need transmittance⇄absorbance conversions in v1 (as a Y-unit transform) or treat it as ingest metadata?
- Which baseline algorithms should be exposed first (keep one simple + one robust)?
- Should smoothing be disallowed for reference datasets by default (to preserve authoritative curves), or allowed with strong labeling?

# Appendix A. Definitions

- Transform: an explicit operation that changes the displayed or derived Y values (and/or derived X grid) without mutating the raw dataset.
- Derived trace: a trace produced by applying one or more transforms to a parent trace; stored with lineage and parameters.
- Canonical axis: the X array stored exactly as imported, used as the only input for unit conversions to prevent drift.
- View-level conversion: a display change (units/labels) that does not change stored arrays.

# Appendix B. Project reference links (MUST consult)

Agents must consult the user-maintained reference link suite in the repository before implementing transforms, especially anything that could be interpreted as 'inventing data' (interpolation/resampling) or that relies on external standards.  
<br/>Single source of truth: docs/references/REFERENCES_RAW.md (or the path used in your project).

# Appendix C. External references used in this CAP

- Astropy spectral equivalencies (wavelength ⇄ wavenumber ⇄ frequency ⇄ energy): <https://docs.astropy.org/en/stable/units/equivalencies.html#spectral-units>
- Astropy spectral() API: <https://docs.astropy.org/en/stable/api/astropy.units.spectral.html>
- SciPy Savitzky-Golay filter: <https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.savgol_filter.html>
- pybaselines documentation (baseline correction library): <https://pybaselines.readthedocs.io/>
- pybaselines quickstart: <https://pybaselines.readthedocs.io/en/latest/quickstart.html>
- scikit-learn StandardScaler (z-score definition): <https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html>
- scikit-learn MinMaxScaler / minmax_scale (min-max scaling definition): <https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.MinMaxScaler.html>