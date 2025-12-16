**CAP-09 - Feature Detection and Identification Assistance (Peaks/Dips, Line/Band Matching)**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-09 defines how the Spectra App helps users (a) detect candidate features (peaks and dips) in spectra, (b) match those features against credible reference materials (line lists and band/range references), and (c) turn matches into saved annotations with citations. CAP-09 is explicitly assistance-oriented: it proposes likely matches with confidence signals and provenance, but does not claim definitive identification.

# 2\. User outcomes (success criteria)

- I can click a trace and run 'Find peaks' or 'Find dips' with a few simple controls.
- Detected features are visible on the plot and can be converted into saved notes/labels (CAP-04).
- I can choose a reference source (e.g., NIST ASD line list, HITRAN/ExoMol line list, functional-group band tables) and match my detected features to it.
- Matches show: what it likely is, why (tolerance + score), and where the reference came from (link/DOI + retrieval date).
- The app never hides interpolation, smoothing, or synthetic assumptions; if anything is computed, it is labeled and logged (CAP-05).
- If the data is too noisy or ambiguous, the app tells me it's ambiguous instead of making confident claims.

# 3\. In scope / Out of scope

## In scope

- Feature detection: peaks (maxima) and dips (minima/absorption features) from user-selected traces.
- Basic peak properties: center, height, prominence, width (as computed from the selected trace).
- Reference matching: feature centers matched to line lists (atomic/molecular) and to band/range references (IR functional groups, known compound bands).
- Result presentation: ranked candidates + evidence, with citations and a 'convert to annotation' workflow.
- Periodic-table selector for atomic line list retrieval (ties to CAP-07 NIST ASD connector).
- Export integration: matches and the chosen references appear in export manifests (CAP-11).

## Out of scope (for CAP-09)

- Full atmospheric retrieval / radiative transfer fitting (later cap).
- Machine-learning identification models (later cap).
- Time-series feature tracking (explicitly out of v1 scope per your Brain Dump).
- Automatic 'final answers' (CAP-09 remains assistance + evidence-based ranking).

# 4\. Trust and 'don't lie to me' rules (CAP-09 specific)

- CAP-09 must separate measured features from reference claims: 'Detected feature' vs 'Matched candidate'.
- Feature detection must operate on the selected trace exactly as shown (raw or transformed)-the UI must display what trace was used.
- No 'invented' peaks: if smoothing or baseline correction is applied, it must be a user-selected transform (CAP-05) and the feature finder must disclose it.
- Matching must always display the tolerance window and whether any resampling/alignment was used (CAP-05/06).
- If evidence is weak, the result must be labeled 'low confidence' rather than forcing a guess.

# 5\. Feature detection: what it does

## Detection modes (minimum)

| **Mode** | **What it detects** | **Typical use** |
| --- | --- | --- |
| Peaks (maxima) | Local maxima based on signal shape and thresholds | Emission spectra, reflectance bumps, prominent UV-Vis peaks |
| Dips (minima) | Local minima (often absorption features) | Absorbance/transmittance dips, absorption lines |
| Derivative-based line finding (optional) | Zero crossings / derivative logic for lines | Astronomy-style emission/absorption line discovery |

## User controls (keep simple; advanced behind a toggle)

- Sensitivity / threshold (basic): a single slider controlling minimum prominence (recommended default).
- Minimum separation (basic): avoids reporting many tiny peaks near each other.
- Optional advanced: minimum width, maximum width, and local window length.
- Noise hint (optional): user can provide 'noise level' or uncertainty; otherwise app estimates from baseline region (v1 optional).

## Peak properties captured (minimum)

- center_x (feature position)
- height_y (value at the feature)
- prominence (relative stand-out from baseline)
- width (at a chosen relative height)
- trace_id + trace_label used for detection
- view_state flags: whether the trace is derived / smoothed / baseline-corrected

# 6\. Reference matching: what it does

## Reference types supported

| **Reference type** | **Source examples** | **Matching strategy** |
| --- | --- | --- |
| Atomic line lists | NIST ASD lines | Match detected feature centers to lines within tolerance |
| Molecular line lists | HITRAN/ExoMol transitions | Match centers to transitions; optionally filter by line strength |
| Band / range references | Functional group IR ranges; known compound band windows | Match feature center (or cluster) into reference intervals |

## Matching inputs and constraints (v1 baseline)

- Matching uses X only (feature center position) by default; intensity is optional as a re-ranking signal if reference provides strengths.
- Matching requires compatible X-dimension: wavelength with wavelength, wavenumber with wavenumber. If not compatible, user must convert display units or fix metadata (CAP-05/CAP-02).
- Matching is overlap-only by default; no extrapolation.

## Tolerance model (must be explicit)

- User sets a tolerance (Δx) in displayed units (e.g., ±0.5 nm or ±2 cm⁻¹).
- Optionally, tolerance can be expressed as 'ppm' or a fraction of resolution if resolution metadata exists (advanced).
- The UI must show: 'Matching window = \[x−Δx, x+Δx\]' for any selected detected feature.

## Ranking and scoring (explainable, not magic)

- Primary score: closeness to reference (|x_feature − x_ref| / Δx).
- Optional re-ranking signals: reference line strength (if available), feature prominence/width, and whether multiple features support the same candidate (cluster evidence).
- Any scoring must be transparent: show the numeric components and do not hide them behind 'AI'.

# 7\. UI requirements

## Feature Finder panel (minimum)

- Select trace(s) to analyze (multi-select).
- Choose mode: Peaks or Dips.
- Basic controls: sensitivity (prominence threshold) + minimum separation.
- Run button: produces a feature table + renders markers on the plot.
- Results table: sortable by center, prominence, width; clicking a row highlights that marker on the plot.
- 'Convert to annotation' button: creates CAP-04 point notes for selected features (with optional labels).

## Match panel (minimum)

- Choose reference: line list (atomic/molecular) or band/range set.
- Choose tolerance (Δx) and optional filters (element/ion, molecule, isotopologue, strength threshold).
- Run match: produces ranked candidates per feature (or per selected features).
- Result cards show: candidate label, reference source, x_ref, Δx, score, and a 'cite' link.
- 'Apply labels' button: converts top match results to annotations (CAP-04), with citations embedded in annotation metadata.

## Periodic table selector (atomic lines)

- UI: periodic table grid; click an element to select it; choose ion stage (I, II, III...).
- On selection, app fetches line list via CAP-07 connector (NIST ASD) and makes it available for matching/overlay.
- Tooltip on lines includes element/ion + wavelength/ν~ + any available transition information from the source.

## Optional: entity cards (visual context)

- When a candidate is selected (e.g., CO2, H2O, CH4, Na I), show an 'Entity Card' with a small image/icon and short facts.
- Entity cards must be link-backed to credible sources (no uncited summaries).
- This is optional for v1; CAP-09 allows it but does not require it for acceptance.

# 8\. Data model

## Feature record (minimum fields)

| feature_id | UUID |
| --- | --- |
| trace_id | Which trace was analyzed |
| center_x | Feature center coordinate (dataset-native + explicit unit) |
| center_x_unit | Stored unit |
| value_y | Signal value at feature center (optional) |
| prominence | As computed |
| width | As computed (with rel_height recorded) |
| detector | Algorithm name + version |
| parameters | Sensitivity, min distance, etc. |
| created_at | Timestamp |

## Match record (minimum fields)

| match_id | UUID |
| --- | --- |
| feature_id | Link to detected feature |
| reference_dataset_id | Which reference set was used (CAP-02 dataset) |
| candidate_label | Human label (e.g., 'CO2 ν3 band', 'Na I 589.0 nm') |
| ref_position_x | Reference position/center |
| ref_unit | Unit |
| tolerance_dx | Δx used |
| score | Explainable numeric score |
| evidence | JSON: closeness, strength (if used), cluster support, notes |
| citation | link/DOI + retrieved_at (from CAP-07/08) |

## Conversion to annotation

- A selected feature or match can be saved as a CAP-04 annotation with: text label + candidate + citation pointer + method parameters.
- Annotations must not claim certainty; default prefix: 'Candidate: … (Δx=…, source=…)'.

# 9\. Algorithms (implementation guidance, not mandates)

## Peak/dip detection (baseline choice)

- Use a stable, well-documented peak finder for 1D arrays with property filters (height, distance, prominence, width).
- For dips, run the same peak finder on the inverted signal (−y), then map results back to original y.

## Derivative-based line finding (optional)

- Provide an astronomy-oriented 'find lines by derivative' mode for users working with emission/absorption line patterns.
- This is optional and can be added after the simpler peak/dip mode works reliably.

## Performance considerations

- Operate on visible/selected ranges when possible (optional).
- Avoid repeated recalculation: cache feature results per trace + parameter hash until the trace changes.

# 10\. Export requirements (CAP-09 contributions)

- Exports (CAP-11) must include: features.json (detected features + parameters) and matches.json (candidate matches + citations).
- If annotations were created from matches, the annotations export must include citation pointers.
- Export summary must state: which trace(s) were analyzed, what algorithm, and what tolerance was used.

# 11\. Error handling and ambiguity

- If detection finds too many features, the UI should suggest increasing prominence threshold or minimum separation.
- If detection finds none, suggest lowering sensitivity or selecting a narrower range.
- If matching produces many candidates per feature, the UI should prompt the user to tighten Δx or filter references (e.g., element/ion, molecule).
- If X units are missing/unknown, block detection-to-match pipeline until fixed (CAP-02 metadata).

# 12\. Acceptance tests (definition of done)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP09-T01 | Run peak detection with default settings on a clean spectrum | Reasonable peaks found; markers plotted; feature table populated |
| CAP09-T02 | Run dip detection (absorption) on a spectrum | Dips found; markers plotted; feature table populated |
| CAP09-T03 | Adjust sensitivity and re-run | Peak count changes predictably; settings persist |
| CAP09-T04 | Convert selected features to annotations | CAP-04 point notes created; editable; persist |
| CAP09-T05 | Match detected features to an atomic line list (NIST ASD) | Candidates ranked; citations shown; Δx visible |
| CAP09-T06 | Match detected features to band/range references | Feature centers mapped to intervals; labels reflect the interval definition |
| CAP09-T07 | Tighten tolerance and re-run matching | Candidate count decreases; ranking updates; no crashes |
| CAP09-T08 | Export after feature detection + matching | features.json + matches.json present; manifest records settings |
| CAP09-T09 | Ambiguous/noisy spectrum | UI shows low-confidence/ambiguous messaging rather than overconfident labels |

# 13\. Questions to ask you (feature-level, no coding required)

- For 'Find peaks/dips', do you want the default behavior to be conservative (few features) or aggressive (many features) and you dial it back?
- For matching, do you want a single global tolerance setting, or per-reference tolerances (atomic vs molecular vs IR bands)?
- Do you want the match results to auto-create labels by default, or require explicit 'Apply labels' each time?
- When a match is uncertain, do you want the app to show the top 3 candidates or just say 'ambiguous' and stop?
- Do you want IR functional-group ranges to come from a built-in curated table, or only from reference datasets you import (safer, more citable)?
- How should the periodic table behave: click-to-load lines immediately, or click-to-select then 'Load' (fewer accidental downloads)?

# 14\. Notes for agents (project practices)

- Agents MUST consult the repository reference link suite before adding any built-in band tables or domain explanations. Do not paste uncited 'common knowledge' tables into the app.
- All feature detection and matching steps must write a provenance event (trace_id, algorithm, parameters, tolerance, reference used).
- Keep the UI minimal: one 'Feature Finder' panel, one 'Match' panel, and reuse CAP-04 for saving labels/notes.
- Do not ship 'auto-identify' claims; ship evidence-based candidate ranking + citations.

# Appendix A. Project reference links (MUST consult)

You stated the project contains a curated suite of reference links. Agents must treat that suite as the single source of truth for approved domain references, citations, and data-source policies. This CAP includes external documentation links for tooling, but domain mapping tables (functional groups, band assignments, etc.) must come from the curated suite or from imported reference datasets.

Recommended single source of truth path (update to match your repo): docs/references/REFERENCES_RAW.md

# Appendix B. External references used in this CAP (tooling)

- SciPy peak detection utility: scipy.signal.find_peaks (peaks + property filters).
- SciPy peak width utility: scipy.signal.peak_widths (width at relative heights).
- Specutils derivative line finder: specutils.fitting.find_lines_derivative (optional astronomy-style mode).
- NIST ASD line form output options (CSV/tab-delimited) for stable connector integration (ties to CAP-07).
- SciPy find_peaks: <https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.find_peaks.html>
- SciPy peak_widths: <https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.peak_widths.html>
- Specutils find_lines_derivative: <https://specutils.readthedocs.io/en/stable/api/specutils.fitting.find_lines_derivative.html>
- NIST ASD Lines Form (output options): <https://physics.nist.gov/PhysRefData/ASD/lines_form.html>