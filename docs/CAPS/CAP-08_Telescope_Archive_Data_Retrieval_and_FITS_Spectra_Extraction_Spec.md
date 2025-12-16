**CAP-08 - Telescope/Archive Data Retrieval (MAST/JWST/HST) and FITS Spectra Extraction**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-08 defines how the Spectra App searches, downloads, parses, and stores telescope/archive data-specifically mission products accessible through MAST (e.g., JWST and HST). The goal is to let users retrieve credible, citable spectra and spectral products (1D spectra, 2D rectified spectra, 3D spectral cubes) and treat them as first-class datasets in the Library (CAP-02), plottable and comparable in the workbench (CAP-03). This capability is citation-first, cache-aware, and permission-aware (e.g., exclusive access products).

# 2\. User outcomes (success criteria)

- I can search for a target (planet/star/system) and find relevant archived observations quickly.
- I can filter results by mission/instrument, product type (1D spectrum vs cube), wavelength/ν~ range, and processing level (raw vs calibrated).
- I can preview key metadata before download (instrument, grating/filter, exposure time, pipeline stage/product suffix).
- I can download the correct file(s) and the app extracts a plottable spectrum (or cube slice) reliably.
- Everything is provenance-rich: proposal/program IDs, observation IDs, product IDs, pipeline stage/product type, retrieval timestamp, and source link are stored.
- The app caches downloaded files and does not repeatedly download the same product unless I explicitly refresh.
- Protected/exclusive-access products are handled correctly (token-based access when required, with clear messaging).

# 3\. In scope / Out of scope

## In scope

- Search + retrieval via MAST (Portal-equivalent query capabilities) for JWST/HST and relevant HLSPs.
- Authentication/token handling for protected downloads where required.
- Download selection UX: choose which data products to download (e.g., x1d, s3d, i2d).
- FITS ingestion for spectral products: identify which HDU contains wavelength/wavenumber and flux/throughput arrays, and produce standardized trace(s).
- Caching of raw payloads and storing a parsed/normalized representation for plotting (raw bytes preserved).
- Library integration: downloaded products become datasets with citations, metadata, and share policies.

## Out of scope (for CAP-08)

- General reference databases like NIST/HITRAN/ExoMol (CAP-07).
- Time-series analysis workflows (explicitly out of v1 scope per Brain Dump). CAP-08 may still download time-series files, but plotting/analysis is deferred.
- Full JWST pipeline reprocessing inside the app. CAP-08 consumes archival products; it does not recalibrate them.
- Astrophysical retrieval/model fitting (later CAP).

# 4\. Design principles (trust + usability)

- Cite the archive, not guess: every import includes a stable source link and retrieval timestamp.
- Raw preserved: store the exact FITS bytes as downloaded, plus extracted traces/cubes for plotting.
- Don't pretend formats are uniform: mission/instrument products differ; extraction logic must be product-aware and transparent.
- Offline-friendly: if you already downloaded it once, you should be able to work without the network.
- Permission-aware: EAP/proprietary content requires authentication; failure modes must be explicit and actionable.
- No silent transforms: extracting a 1D spectrum is not a 'transform', but any smoothing/resampling is (CAP-05).

# 5\. Data products: what we support (v1 baseline)

## JWST (via MAST)

JWST archives multiple pipeline stages and product types; CAP-08 targets calibrated/usable spectral products first (Stage 2/3), with Stage 1 raw products available for advanced users.

- Stage 2/3 spectral products where applicable: x1d (1D extracted spectra), s2d (2D rectified spectra), s3d (3D spectral cubes), i2d (imaging products as context).
- Respect JWST pipeline product type suffixes and stages as defined by official JWST documentation.

## HST (via MAST)

- Support 1D spectra products commonly used in HST spectroscopy ecosystems (e.g., x1d).
- Support high-level science products (HLSPs) where they provide coadds/combined spectra that are easier for students to use.
- Treat mission-specific nuances as explicit metadata (e.g., instrument/grating configuration).

## High Level Science Products (HLSPs) and curated sets

- HLSPs may provide 'best effort' combined/curated products; the app should allow filtering for HLSPs and clearly label them as such.
- Examples include HST spectral aggregates/coadds provided through MAST programs (e.g., advanced spectral products).

# 6\. Search and retrieval UX

## Unified 'Add Telescope Data' panel

- Search inputs: target name, coordinates, or MAST identifier; optional radius/cone search parameters.
- Filters: mission (JWST/HST), instrument (dropdown), data type (spectrum/cube), spectral range, observation date range, program/proposal ID.
- Processing level filter: raw vs calibrated vs high-level products; default should prefer calibrated/HLSP for v1 usability.
- Results list: show observation summary rows; selecting an observation reveals its data products list.
- Data products list: show product filename, product type suffix, size, calibration level, and a 'recommended' flag (e.g., x1d preferred over intermediate files).
- Preview: show quick metadata + a short citation block for the selected product prior to download.

## Download selection rules

- User chooses specific products to download (checkboxes).
- Default selection should be conservative and spectrum-focused: prefer x1d / s3d / coadds over raw/internals, unless user toggles 'advanced'.
- If multiple near-duplicate products exist, show a short explanation of what they are (e.g., Stage 2 vs Stage 3).

# 7\. Authentication and access control

Some MAST data products may be protected by exclusive access periods or other authorization rules. The app must support token-based access where required, and must not embed secrets in code or logs.

- Support MAST API Token entry and storage in a secure local credential store (OS keychain where possible).
- If unauthorized, show: what product is protected, what credential is required, and how to proceed.
- Ensure 'private mode' so credentialed downloads never become publicly shareable by default (CAP-02 sharing gate).

# 8\. Caching and persistence (ties into CAP-02)

## Raw payload storage

- Store downloaded FITS as immutable blobs with SHA-256 checksum (content-addressable storage recommended).
- Cache key should include: mission + obsid/productid + filename + calibration level + retrieved_at.
- Allow refresh: re-download and store as a new version for reproducibility (do not overwrite).

## Parsed/normalized representation

- Extract plottable traces (x\[\], y\[\]) and standard metadata for CAP-03 plotting.
- Store extraction metadata: which HDU/columns were used, unit conversions performed (if any), and any quality flags encountered.
- If extraction fails, keep the raw payload and produce a 'parsing report' bundle (raw + logs + attempted mapping).

# 9\. FITS spectra extraction rules (v1 baseline)

## General approach

- Use Astropy FITS readers to enumerate HDUs and detect spectral tables/cubes.
- Prefer standardized spectral containers where possible (e.g., 1D flux vs wavelength arrays).
- Be explicit about what you used: record HDU index/name, column names, and units.

## Supported product classes (minimum)

| **Class** | **Typical structure** | **App output** |
| --- | --- | --- |
| 1D extracted spectrum | Table with wavelength/ν~ and flux/throughput arrays | Single trace (x\[\], y\[\]) with units + quality flags |
| 2D rectified spectrum | Image-like spectral format (dispersion vs cross-dispersion) | Default: preview image; optional: extract summed/central row as 1D (must be labeled as extraction) |
| 3D spectral cube | Cube with (x, y, λ) or (spatial, λ) | Default: choose a spatial pixel/region and extract 1D spectrum; store region parameters |

## Safety rules

- No implicit resampling: if the product's native grid is irregular, plot it as-is (CAP-03). Alignment/interpolation is CAP-05/06 and must be explicit.
- If wavelength axis is decreasing (common in some conventions), keep the original ordering but provide a view option to reverse for readability (view-only).
- Always propagate archive-provided quality flags when available and allow user to toggle 'mask flagged points' (view-only by default).

# 10\. Provenance and citation model

## Minimum fields for telescope imports

| source_type | telescope |
| --- | --- |
| archive | MAST |
| mission | JWST \| HST \| HLSP |
| program_id / proposal_id | As provided by archive |
| obsid / observation_id | Archive observation identifier(s) |
| product_id / dataURI | Product identifier as used by MAST |
| filename | Original archive filename |
| pipeline_stage | e.g., Stage 1/2/3 (JWST) when applicable |
| product_type_suffix | e.g., x1d, s3d, rate, cal, etc. |
| retrieved_at | Timestamp |
| source_url | Permanent/primary link to archive product/observation |
| citation_text | Human-readable citation string + mission acknowledgment if required |
| checksum_sha256 | Raw payload integrity |

## Provenance integration

- Write a provenance event for: search query, selected result, download, parse/extraction mapping, and save-to-library.
- If user saves derived traces from a cube extraction, record extraction region and method as part of lineage.

# 11\. Sharing and licensing policy (CAP-02 gate)

- Default: telescope imports are private unless user explicitly shares.
- If a dataset was obtained via authenticated access (EAP/proprietary), public sharing must be blocked by default.
- Public sharing must include citation text and a link back to the archive observation/product page.
- For restricted products, offer 'share pointers only' (obsid/product link + query parameters) rather than raw files.

# 12\. Error handling

- Network issues: show source down/rate-limited messages and allow retry.
- Auth issues: clearly indicate token required and whether user is authorized for that program.
- Format issues: if FITS schema is unexpected, preserve raw payload and produce an actionable parse report bundle.
- Huge data: warn before downloading very large products (size shown in UI); allow 'metadata only' preview.

# 13\. Acceptance tests (definition of done)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP08-T01 | Search JWST by target name and list observations | Results returned; filters apply; citations visible |
| CAP08-T02 | Select an observation and list its products | Products list includes file names, types, sizes, and recommended flag |
| CAP08-T03 | Download a Stage 3 spectrum product (x1d) and plot | Dataset saved to Library; plot renders; metadata/provenance stored |
| CAP08-T04 | Download a Stage 3 cube (s3d) and extract 1D spectrum from region | Extraction parameters recorded; derived trace labeled; original payload preserved |
| CAP08-T05 | Cache behavior: re-open without re-download | Dataset available offline; checksum matches; no network call required |
| CAP08-T06 | Refresh from source | New version created with new retrieved_at; prior version preserved |
| CAP08-T07 | Attempt to download protected product without token | Action blocked with clear guidance; no partial state corruption |
| CAP08-T08 | Attempt to publicly share protected import | Public share blocked; pointer-only option offered |
| CAP08-T09 | FITS parse failure | Raw preserved; parse report bundle generated; user can still keep raw in Library |

# 14\. Implementation guidance (what to use - options, not mandates)

## Recommended retrieval approach

- Use a proven client for MAST queries and downloads (preferred: Astroquery MAST) or use the official MAST API directly.
- Implement a connector layer mirroring CAP-07 patterns: search -> products -> download -> parse -> save-to-library.

## Suggested library stack (Python ecosystem examples)

- MAST access: astroquery.mast.Observations for observation queries and product downloads; or direct calls to MAST API endpoints.
- FITS: astropy.io.fits for reading HDUs; astropy.table for tables.
- Optional spectra helpers: specutils for standard spectrum containers (only if it reduces complexity).

## Module boundaries (suggested)

- connectors/mast/: query + product listing + download; token support; caching hooks
- parsers/fits/: product-aware mapping from HDUs/columns to traces/cubes
- services/telescope_import/: orchestration (search session state, download jobs, parse reports)
- ui/telescope/: search panel, results table, product picker, preview + citation box

# 15\. Questions to ask you (feature-level, no coding required)

- For JWST: do you want the app to default to Stage 3 products (x1d/s3d) even if Stage 2 exists, to keep it simpler?
- For cubes: do you want region selection to be (a) click one pixel, (b) draw a box, or (c) choose from presets (center, brightest, average)?
- Do you want a 'mission-first' UI (JWST tab, HST tab) or a single unified search with mission filters?
- When you share telescope data with a class/group, do you want to share cached files or only pointers back to MAST?
- Which missions are highest priority after JWST/HST (e.g., TESS spectra/lightcurves, Kepler, etc.), or should we keep CAP-08 strictly JWST/HST for v1?

# Appendix A. Project reference links (MUST consult)

Your repository includes a user-maintained reference link suite (you mentioned it is uploaded to the project). Agents must consult it before implementing MAST queries, JWST/HST product parsing, FITS extraction rules, or any sharing/licensing decisions. This document assumes the suite is the single source of truth for project-approved links and practices.

Recommended single source of truth path (update to match your repo): docs/references/REFERENCES_RAW.md

# Appendix B. External references used in this CAP

- Astroquery MAST queries and Observations class documentation.
- MAST API documentation and tutorials.
- JWST documentation on stages and product types/suffixes.
- JWST docs on MAST API access tokens for protected products.
- MAST pages for HST spectral HLSPs (advanced spectral products).
- Astroquery MAST: <https://astroquery.readthedocs.io/en/latest/mast/mast.html>
- Astroquery MAST ObservationsClass: <https://astroquery.readthedocs.io/en/latest/api/astroquery.mast.ObservationsClass.html>
- MAST API docs: <https://mast.stsci.edu/api/v0/>
- MAST API tutorial: <https://mast.stsci.edu/api/v0/MastApiTutorial.html>
- JWST data product types (pipeline): <https://jwst-pipeline.readthedocs.io/en/latest/jwst/data_products/product_types.html>
- JWST science data overview (stages/products in MAST): <https://jwst-docs.stsci.edu/accessing-jwst-data/jwst-science-data-overview>
- JWST MAST API access (token/EAP): <https://jwst-docs.stsci.edu/accessing-jwst-data/mast-api-access>
- HST Advanced Spectral Products (HASP): <https://archive.stsci.edu/missions-and-data/hst/hasp>
- HST Spectroscopic Legacy Archive (HSLA): <https://archive.stsci.edu/missions-and-data/hst/hsla>