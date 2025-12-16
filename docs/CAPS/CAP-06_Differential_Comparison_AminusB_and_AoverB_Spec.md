**CAP-06 - Differential Comparison: A−B Subtraction and A/B Ratio**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-06 defines differential comparison operations between two selected traces: subtraction (A−B) and ratio (A/B). The capability must make A and B selection unambiguous, support one-click swap, and handle mismatched X-grids and denominator instability (B≈0) without 'lying' or silently injecting data. Outputs are derived traces with complete lineage to their inputs and are grouped/managed alongside other derived traces (CAP-03/05).

# 2\. User outcomes (success criteria)

- I can select Trace A and Trace B clearly, see which is which, and swap them with one button.
- A−B and A/B produce derived traces with clear names and provenance (what inputs, what method, what alignment).
- If A and B don't overlap or don't share a compatible X grid, the app explains the issue and offers safe options (overlap-only, or explicit resampling).
- If A/B produces spikes due to B≈0, the app does not crash or silently 'fix' it; it warns and offers explicit handling choices.
- The UI does not reset my selections unexpectedly; A and B selectors remain stable while I experiment.

# 3\. In scope / Out of scope

## In scope

- Operations: subtraction (A−B) and ratio (A/B).
- A/B safety handling (masking near-zero denominator; optional epsilon stabilization as advanced).
- Overlap management: compute only over the shared X range by default.
- Alignment options for mismatched X-grids (explicit; default OFF).
- UI: A/B selectors, lock toggles, swap button, compute button, output trace list and controls.
- Derived trace lineage + manifest fields (CAP-05 provenance model).

## Out of scope (for CAP-06)

- Normalization and smoothing (CAP-05) - CAP-06 may consume already-normalized traces but does not define normalization.
- Automatic feature identification (lines/compounds) - later CAPs.
- Batch statistical comparisons (e.g., PCA, clustering) - later CAPs.
- Time-series differential analysis - explicitly out of scope per Brain Dump.

# 4\. Key definitions

| Trace A / Trace B | Two explicit inputs selected by the user. Each is a specific trace instance (original or derived). |
| --- | --- |
| Operation | Either A−B (difference) or A/B (ratio). |
| Aligned grid | A common X array used to compute the operation; may be an existing grid or an explicitly resampled grid. |
| Overlap range | The shared X interval where both traces have data and can be compared without extrapolation. |
| Unsafe denominator | A region where \|B\| is near zero, making A/B numerically unstable and potentially misleading. |

# 5\. UI requirements

## Differential tool panel (minimum)

- Trace A selector (dropdown) with independent state key (must not reset when Trace B changes).
- Trace B selector (dropdown) with independent state key.
- Lock A and Lock B toggles (prevents accidental changes while browsing lists).
- Swap A ↔ B button (must swap without losing lock state; must update all labels).
- Operation selector: A−B or A/B.
- Compute button (single action) that creates a derived trace and logs provenance.
- Output controls: 'clear last derived', 'clear all derived', 'save derived to Library' (ties into CAP-02).

## Clarity requirements

- The UI must display the chosen A and B names prominently near the compute button.
- After computing, the derived trace label must include the operation and a short A/B alias.
- If alignment/resampling is enabled, the UI must show a trust badge (e.g., 'Interpolated') on the output trace.

# 6\. Core behavior rules (MUST / MUST NOT)

## Non-negotiables (trust-first)

- MUST NOT modify the underlying stored datasets or parent traces; outputs are derived traces only.
- MUST compute over overlap range only by default; no extrapolation unless explicitly requested (default: disabled).
- MUST NOT resample/interpolate unless the user explicitly enables alignment/resampling.
- MUST label and record any interpolation/resampling method in provenance and UI.
- MUST show safe errors/warnings rather than producing nonsense silently (e.g., empty overlap, incompatible units).

## Unit consistency rules

- A and B must share the same physical X dimension (e.g., both wavelength or both wavenumber). If not, block and instruct user to convert display units (CAP-05) or fix metadata (CAP-02).
- A and B Y units can differ; CAP-06 does not attempt unit harmonization. If Y units differ, warn and proceed only if user acknowledges (optional v1) or proceed with a visible warning badge.

# 7\. Computation semantics

## Subtraction (A−B)

- Definition: y_out(x) = y_A(x) − y_B(x) evaluated on the aligned grid.
- If A and B are identical and alignment is exact, output should be a near-zero line (within floating tolerance).

## Ratio (A/B)

- Definition: y_out(x) = y_A(x) / y_B(x) evaluated on the aligned grid.
- Expected behavior: if A and B are identical, ratio should be ~1 (except where B≈0).
- Ratio must be numerically guarded to avoid divide-by-zero crashes; handling choice must be explicit (see §8).

# 8\. Denominator stability handling (A/B)

## Default handling (recommended) - mask unsafe denominator

- Define a denominator threshold τ (default derived from data scale or a user-set absolute threshold).
- Where |B| < τ, set output to NaN/masked so the plot shows a gap rather than a misleading spike.
- Show a warning: 'Ratio masked where |B| < τ' and record τ and masked fraction in provenance.

## Advanced options (off by default)

| **Option** | **Definition** | **Trust implications** |
| --- | --- | --- |
| Epsilon-stabilized ratio | y_out = A / (B + ε) with user-provided ε | Reduces spikes but changes math; must be labeled clearly. |
| Clamp ratio | Cap output magnitude to ±R_max | Visually stabilizes but hides magnitude; not recommended for scientific reporting. |
| Import as-is | Allow inf/NaN and display them (or omit) | Most transparent but may be visually noisy; still must not crash. |

## Implementation note (numerical safety)

Implementation should use vectorized safe division with explicit error-state handling and/or masking. If using NumPy, prefer numpy.divide with an explicit 'out' array and a boolean 'where' mask, and use a local error-state context to avoid global side effects.

# 9\. X-grid alignment and overlap policy

## Default policy (no interpolation)

- If A.x and B.x match exactly (or within a tolerance), compute directly.
- If X grids differ, default behavior is to compute only on shared points if an exact join is possible; otherwise refuse with a clear message and offer alignment options.

## Explicit alignment (resampling) - opt-in

| **Method** | **How to define target grid** | **Notes** |
| --- | --- | --- |
| Nearest | Use A grid or B grid; map the other via nearest neighbor | Least smooth; minimal synthesis; can alias. |
| Linear | Use A grid or B grid; interpolate the other linearly | Synthesizes intermediate values; must be labeled. |
| PCHIP (monotone cubic) | Use A grid or B grid; interpolate with PCHIP | Avoids overshoot and preserves monotonicity; still synthesized. |

## Overlap only (no extrapolation)

- Regardless of method, operate only on X values within the overlap range unless extrapolation is explicitly enabled.
- If overlap is empty, refuse: 'No overlap between A and B. Choose different traces or adjust ranges.'

## Provenance requirements for alignment

- Record: chosen target grid (A-grid or B-grid), interpolation method, bounds policy (no extrapolation), overlap range, and point counts.
- Label output trace with an 'Interpolated' badge when method is not 'None'.

# 10\. Derived trace management (ties into CAP-03/CAP-05/CAP-02)

- Derived differential traces are temporary by default (session-only) unless user explicitly saves to Library.
- Provide: clear last derived, clear all derived; do not delete any Library datasets.
- Derived trace must maintain full lineage: input trace IDs + parent dataset IDs + file checksums (CAP-01/02).
- Derived traces are grouped under 'Derived' and should not pollute the original trace selection lists without grouping.

# 11\. Failure modes and user-facing messages

- Units mismatch (X): 'Trace A and Trace B use different X units/dimensions. Convert display units or fix dataset metadata.'
- Empty overlap: 'No overlapping X range between A and B. Differential comparison requires overlap.'
- Mismatched grids with resampling OFF: 'X grids differ. Enable alignment (interpolation) or select compatible traces.'
- Unsafe denominator: 'Ratio is unstable where B is near zero. Output masked in those regions (|B| < τ).'
- Non-monotonic X warnings propagate: if either trace has non-monotonic X, show trust warning and recommend sorting/fixing upstream (CAP-01).

# 12\. Acceptance tests (concrete checks)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP06-T01 | Select A and B; compute A−B | Derived trace created; labeled; lineage stored |
| CAP06-T02 | Swap A↔B then compute A−B | Output sign flips; UI labels update correctly; no selection reset |
| CAP06-T03 | Compute A/B with clean denominator | Derived trace created; labeled; no warnings |
| CAP06-T04 | A==B case for subtraction | Output ~0 (within tolerance); optionally warn 'trivial result' |
| CAP06-T05 | A==B case for ratio | Output ~1 (within tolerance) except masked regions |
| CAP06-T06 | Ratio with B containing near-zero values | No crash; masked gaps or inf/NaN per selected handling; provenance records τ |
| CAP06-T07 | Mismatched X grids with resampling OFF | Refuse or compute only on exact shared points; clear message |
| CAP06-T08 | Mismatched X grids with linear resampling ON | Computes within overlap; output flagged as interpolated; method recorded |
| CAP06-T09 | Mismatched X grids with PCHIP ON | Computes within overlap; output does not overshoot monotone segments; method recorded |
| CAP06-T10 | Empty overlap | Refuse with message; no derived trace created |
| CAP06-T11 | Clear last derived / clear all derived | Derived traces removed from plot; originals unaffected |
| CAP06-T12 | Save derived to Library | Derived trace becomes a saved dataset artifact with full lineage and manifest fields |

# 13\. Implementation guidance (what to use - options, not mandates)

## Numerics

- Vectorized operations over aligned arrays; avoid per-point Python loops.
- Safe division should be implemented with masking and local error-state controls to avoid global configuration changes.

## Suggested building blocks (Python ecosystem examples)

- Safe division: numpy.divide + numpy.errstate (local context).
- Interpolation: scipy.interpolate.interp1d for linear/nearest; scipy.interpolate.PchipInterpolator for monotone cubic interpolation.

## Where to put what (module boundaries)

- ops/differential/: pure functions for subtract/ratio + alignment policies (no UI)
- ops/alignment/: shared interpolation/resampling utilities (may be shared with CAP-05)
- provenance/: derived-trace manifest writer/validator
- ui/differential/: A/B selectors, swap/lock controls, compute button, warnings panel

# 14\. Open questions (tracked, not blocking CAP-06 spec)

- What is the default denominator threshold τ policy (absolute vs relative to data scale)?
- Should ratio default to masking (recommended) or to 'as-is' with inf/NaN visible (max transparency)?
- Should CAP-06 operate on the currently displayed trace values (which may be normalized) or always on raw parent data by default?
- Do we enforce Y-unit matching (block) or just warn (default warn)?

# Appendix A. Definitions

- Differential trace: a derived trace produced by A−B or A/B operations.
- Masking: replacing values in numerically unsafe regions with NaN/hidden values to avoid misleading spikes.
- Interpolation: synthesizing values between measured points; must be explicit and labeled.

# Appendix B. Project reference links (MUST consult)

Agents must consult the user-maintained reference link suite in the repository before implementing differential math, especially anything involving interpolation/resampling or interpretation of results.  
<br/>Single source of truth: docs/references/REFERENCES_RAW.md (or the path used in your project).

# Appendix C. External references used in this CAP

- NumPy divide (elementwise division; references seterr): <https://numpy.org/doc/stable/reference/generated/numpy.divide.html>
- NumPy errstate (local floating-point error handling context manager): <https://numpy.org/doc/stable/reference/generated/numpy.errstate.html>
- NumPy seterr (IEEE-754 error modes; divide-by-zero semantics): <https://numpy.org/doc/stable/reference/generated/numpy.seterr.html>
- SciPy interp1d (1D interpolation; bounds_error/fill_value): <https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.interp1d.html>
- SciPy PchipInterpolator (monotonicity-preserving interpolation; avoids overshoot): <https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html>