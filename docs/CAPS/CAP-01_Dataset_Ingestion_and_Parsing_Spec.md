**CAP-01 - Dataset Ingestion and Parsing**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-01 defines how the application accepts (ingests) raw spectroscopy files and converts them into trustworthy, plot-ready datasets without distorting the signal. This includes: file upload/import; format detection; robust parsing for CSV/TXT/FITS/JCAMP-DX; handling common messiness (headers, delimiters, column ambiguity, missing units); and a user resolution flow (preview + questions) when automatic parsing is uncertain. Parsed outputs must preserve raw X/Y values, record provenance, and enforce basic sanity checks (e.g., monotonic X, no negative wavelengths unless the unit supports it).

# 2\. User outcomes (success criteria)

- I can import a local spectroscopy file (CSV/TXT/FITS/JCAMP-DX) and immediately see it as an identifiable dataset in the app.
- If the file is messy, the app either fixes it safely or asks me a small number of clear questions (with a preview).
- The app does not normalize or otherwise distort the data during ingest; any normalization happens only later via explicit UI selection.
- I can trust the imported dataset because the app warns me about suspicious ranges, non-monotonic X, missing units, or ambiguous columns.
- The app records enough provenance (source, checksum, timestamps, parser decisions) to reproduce and audit the ingestion later.

# 3\. In scope / Out of scope

## In scope

- Supported local file types: CSV, TXT (ASCII tab/space-delimited), FITS (common 1D spectral products), JCAMP-DX.
- Format detection and parser selection (extension + lightweight sniffing).
- Header/metadata extraction where available (units, column names, instrument hints, comments).
- Messy file handling: extra header lines, wrong column order, weird delimiters, multiple columns, data gaps, axis direction reversals.
- User resolution flow: preview file + choose X/Y columns + confirm units if ambiguous.
- Sanity checks: monotonic X, non-empty data, numeric conversion, basic range plausibility and warnings.

## Out of scope (for CAP-01)

- Long-term dataset storage, permissions, sharing, and collaboration (CAP-02 / CAP-10).
- Core plotting/overlay UI behavior (CAP-03), notes/highlights (CAP-04), normalization modes (CAP-05).
- Differential tools (CAP-06) and resampling/smoothing policies.
- Remote fetching from reference databases or archives (CAP-07 / CAP-08). CAP-01 only defines parsing utilities that those capabilities will reuse.

# 4\. User workflows (short stories)

## Workflow A - Clean CSV import (happy path)

- User selects a CSV file from disk.
- App detects delimiter/columns, reads numeric X/Y, and creates a dataset record.
- App shows dataset name + basic metadata and makes it available for plotting/overlay.

## Workflow B - Messy CSV/TXT import (needs help)

- User selects a TXT file with extra comment lines and multiple numeric columns.
- App shows an ingest preview panel (first ~50-200 lines) and proposes candidate X and Y columns.
- User confirms X column, Y column, and units (only if missing/ambiguous).
- App parses and stores the dataset plus a record of the user's choices and the final resolved schema.

## Workflow C - FITS import (astronomy spectrum)

- User selects a FITS file (e.g., a 1D spectrum product).
- App reads headers and data arrays, selecting the most likely spectral axis and flux/intensity axis.
- If multiple HDUs or ambiguous structures exist, app prompts user to choose an HDU and axis mapping.
- App imports the dataset with header-derived metadata captured for provenance.

## Workflow D - Unsupported or unreadable file

- User selects a file that cannot be parsed by any supported parser.
- App refuses safely and returns a clear message: what went wrong, what file types are supported, and suggested next steps (conversion tools or exporting from the source instrument).
- Optionally, app allows attaching the raw file to a dataset record as 'unparsed' (for notes/sharing later), without claiming it is plot-ready.

# 5\. UI requirements (controls, labels, what persists, what can reset)

## Required UI elements for CAP-01

- Import button/control that accepts multiple files at once.
- Ingest preview panel for ambiguous text-based files (CSV/TXT): shows a line preview + detected delimiter + candidate columns.
- Column mapping selector when needed: choose X column, Y column (and optionally additional Y columns as separate datasets).
- Unit selector only when missing/ambiguous (X unit and Y unit if relevant).
- Validation banner area: warnings (yellow) vs errors (red) with clear next steps.
- A single 'Confirm import' action for the preview flow (avoid multiple popups).

## Persistence rules

- Imported datasets must persist for the session immediately; later persistence to a library is CAP-02.
- User choices made during ingest (selected columns, units, delimiter override) must be stored with the dataset's provenance so it can be re-ingested reproducibly.
- Ingest UI should not reset other app state (login, currently plotted datasets) when importing new files.

# 6\. Data expectations

## Canonical internal representation (minimum fields)

| dataset_id | Stable internal ID (UUID). |
| --- | --- |
| display_name | Human-readable name; default from filename; editable later (CAP-09). |
| source_type | lab \| reference \| archive \| user-upload (initially user-upload for CAP-01). |
| raw_file | Pointer to the original bytes (path/blob) + filename + size + mime/type. |
| x_values | 1D numeric array; no normalization/resampling at ingest. |
| y_values | 1D numeric array (or multiple series parsed separately). |
| x_unit | String (e.g., nm, um, cm^-1) or 'unknown' with a warning. |
| y_unit | String (e.g., absorbance, transmittance, intensity) or 'unknown'. |
| metadata | Key-value map: instrument hints, acquisition info, headers, comments. |
| provenance | Checksum, timestamps, parser name/version, user choices, warnings. |

## Supported formats and recommended parsers

| **Format** | **How to detect** | **Preferred parser/tools** | **Notes / constraints** |
| --- | --- | --- | --- |
| CSV / TXT | Extension + delimiter sniffing | pandas.read_csv with sep=None (python engine) + csv.Sniffer when needed | Support comment/header lines, delimiter overrides, and manual column mapping. |
| FITS | Extension + FITS signature | astropy.io.fits (and/or specutils loaders for known spectral products) | Support tables and image-like HDUs; prompt for HDU/axis selection when ambiguous. |
| JCAMP-DX | Extension .jdx/.dx + leading '##' metadata lines | Prefer parsers that preserve native X units; evaluate 'jcamp' and nmrglue.jcampdx | Avoid libraries that silently normalize/convert X unless fully controlled and recorded. |

## Common messy-file patterns (from your Brain Dump) and required handling

| **Messiness pattern** | **Auto-handling goal** | **If uncertain, ask user** |
| --- | --- | --- |
| Extra header lines / notes at the top | Skip comment blocks; detect first numeric row | Confirm which row starts data |
| Missing units / unclear units | Infer from headers if present | Select X unit (nm/um/cm^-1/etc.) |
| Wrong column order / many columns | Propose best X candidate (monotonic) and Y candidate(s) | Pick X and Y columns |
| Weird delimiters (tabs, semicolons, spaces) | Sniff delimiter; fallback to manual | Choose delimiter override |
| Duplicate filenames / repeated scans | Allow ingest but flag potential duplicate via checksum | Confirm keep/replace later (CAP-02) |
| Data gaps / missing regions | Preserve gaps; no interpolation at ingest | None (warn only) |
| Axis backwards sometimes | Detect descending X and offer 'flip X' toggle | Confirm flip |
| Multiple datasets in one file | Offer 'import multiple Y columns' as separate datasets | Confirm which columns to import |
| Files require special resources (not readable) | Detect unsupported signature and refuse safely | Provide conversion guidance |

# 7\. Behavior rules (MUST / MUST NOT)

## Non-negotiables aligned to your Brain Dump

- MUST NOT normalize any data during ingest (normalization is UI-selected later).
- MUST NOT normalize or rescale the X axis; X represents wavelength/wavenumber and must remain physically meaningful.
- MUST NOT invent signal: no interpolation, smoothing, resampling, or gap filling during ingest.
- MUST preserve raw order and values, except for one allowed correction: sorting X into monotonic order (if enabled) with an explicit warning and a logged action.
- MUST warn about non-monotonic X and offer a clear resolution path (sort, choose different column, or import as-is with warnings).
- MUST compute a checksum (e.g., SHA-256) of raw bytes and store it in provenance for dedupe and audit.
- MUST capture every parser decision (delimiter, skipped rows, selected columns, unit assumptions) as structured provenance.

## Validation rules (trust)

- Warn if X contains negative values for wavelength-like units (nm/um/Angstrom).
- Warn if X is non-monotonic or has large back-and-forth jumps.
- Warn if fewer than a minimum number of points (configurable; default 20) after parsing.
- Warn if too many NaNs/blank lines are removed (e.g., >10%).
- Error (block import) if X or Y cannot be converted to numeric arrays at all.

# 8\. Failure modes (user-facing messages + next steps)

- Unreadable file: 'This file type is not currently supported for parsing. Supported: CSV, TXT, FITS, JCAMP-DX. If this came from an instrument export, try exporting as CSV or JCAMP-DX.'
- Ambiguous columns: 'Multiple numeric columns found. Please choose the X column and Y column(s).'
- Missing units: 'No units detected. Select the X unit so the plot is physically meaningful.'
- Non-monotonic X: 'X values are not ordered. Choose: import as-is (warn), sort X (recommended), or choose a different X column.'
- FITS ambiguity: 'Multiple HDUs or axes detected. Select which HDU and which columns represent spectral axis and flux.'

# 9\. Provenance + notes (what is captured and displayed)

## Provenance fields (minimum)

- Ingest timestamp; user identity (if logged in) or 'anonymous/local'.
- Raw file: original filename, size, checksum, and storage location reference.
- Parser name and version; detection method (extension/sniff).
- User choices: selected delimiter, skipped header lines, chosen X/Y columns, chosen units.
- Warnings/errors generated during ingest and how they were resolved.
- Extracted metadata: header key/value pairs, instrument hints, comments.

## Display expectations

- Dataset detail view must show: filename, checksum, selected columns, units, and ingest warnings in human-readable form.
- If any automatic correction was applied (e.g., X sorted), that action must be visible and reversible (where feasible).

# 10\. Export requirements (CAP-01 contributions)

- When an export bundle is generated later (CAP-11), it must include: the raw original file(s) AND an ingestion manifest describing how each file was parsed.
- The ingestion manifest must include checksum, parser info, selected columns, units, skipped rows, and warnings.
- No CAP-01 export UI is required now; only the metadata contract for later export.

# 11\. Acceptance tests (concrete checks)

## Test matrix (minimum)

| **Test ID** | **Input** | **Expected result** | **Notes** |
| --- | --- | --- | --- |
| CAP01-T01 | Simple 2-column CSV (X,Y) with headers | Imports without prompts; X/Y arrays correct; units captured if present | Baseline happy path |
| CAP01-T02 | TXT with comment lines + tab delimiter | Skips comments; detects delimiter; imports correctly | Header skipping |
| CAP01-T03 | CSV with 5 numeric columns | Preview appears; user selects X and Y; imports with recorded choices | Column mapping |
| CAP01-T04 | CSV missing units | Unit selector appears; import proceeds; warning cleared | Unit resolution |
| CAP01-T05 | CSV with descending X | Offers flip/sort; chosen action logged; plot-ready X monotonic if applied | Axis direction |
| CAP01-T06 | CSV with non-monotonic X (back-and-forth) | Warns; offers sort/import as-is; decision logged | Trust rule |
| CAP01-T07 | FITS 1D spectrum (table or image-like) | Imports spectrum; captures headers; prompts only if ambiguous | Astro spectrum |
| CAP01-T08 | JCAMP-DX file | Parses x/y; preserves X meaning; records any unit conversion explicitly | No silent normalization |
| CAP01-T09 | Unsupported/binary file | Safe refusal with next-step guidance; no crash | Error handling |

## Regression checklist hooks

- Ingest does not break existing plotted datasets or session state.
- User-facing errors are actionable; logs include root-cause details.
- No silent data distortion is introduced.

# 12\. Open questions (tracked, not blocking CAP-01 spec)

- Should the app allow importing multiple Y columns as separate datasets by default, or require explicit opt-in every time?
- When X is non-monotonic, is sorting allowed by default, or should it always require confirmation?
- What is the minimum required unit vocabulary for X and Y (nm, um, cm^-1, Angstrom; absorbance/transmittance/intensity)?
- For JCAMP-DX: which parser will be adopted as authoritative, given some libraries may auto-convert X?
- For FITS: which FITS spectral conventions must be supported first (JWST/HST products vs generic tables)?

# Appendix A. Definitions (shared vocabulary)

- Raw file: the original bytes as provided by the user (never modified in place).
- Dataset: a parsed, plot-ready representation derived from a raw file, with X/Y arrays, units, and metadata.
- Provenance: the structured record of how the dataset was produced, including user choices and parser decisions.
- Ingest preview: a UI panel that shows a sample of the raw file and lets the user resolve ambiguities (delimiter, columns, units).
- Parser: a format-specific reader that converts raw bytes to structured arrays plus extracted metadata.

# Appendix B. Reference links to keep in the repository

Maintain a project-managed link index (e.g., docs/references/REFERENCES_RAW.md) and keep it current. Agents must consult this list before implementing new retrieval/parsing behaviors.

- Project reference link index: REFERENCES_RAW.md (user-maintained list of links).
- Astropy FITS docs: <https://docs.astropy.org/en/stable/io/fits/index.html>
- Specutils docs: <https://specutils.readthedocs.io/>
- pandas.read_csv docs: <https://pandas.pydata.org/docs/reference/api/pandas.read_csv.html>
- JCAMP-DX standard background (IUPAC): <https://github.com/IUPAC/JCAMP-DX>

# Appendix C. References consulted for CAP-01

These references were used to ground format-handling and parsing recommendations in CAP-01. Agents implementing CAP-01 should consult these directly before selecting or writing parsers.

- Project link index (user-supplied): REFERENCES_RAW.md (includes MAST/JWST/NIST/ExoMol/HITRAN and other archives/databases).
- Astropy FITS file handling documentation: <https://docs.astropy.org/en/stable/io/fits/index.html>
- Specutils documentation (Astropy affiliated package): <https://specutils.readthedocs.io/>
- Specutils note on Spectrum1D deprecation (use Spectrum): <https://specutils.readthedocs.io/en/stable/api/specutils.Spectrum1D.html>
- pandas.read_csv documentation (delimiter detection via python engine/csv.Sniffer when sep=None): <https://pandas.pydata.org/docs/reference/api/pandas.read_csv.html>
- JCAMP-DX as an IUPAC standard (format background): <https://github.com/IUPAC/JCAMP-DX>
- JCAMP-DX tooling option (PyPI 'jcamp'): <https://pypi.org/project/jcamp/>
- JCAMP-DX tooling option (nmrglue.jcampdx): <https://nmrglue.readthedocs.io/en/latest/reference/jcampdx.html>
- JCAMP-DX background overview (FairSpectra): <https://fairspectra.net/resources/jcamp-dx/>