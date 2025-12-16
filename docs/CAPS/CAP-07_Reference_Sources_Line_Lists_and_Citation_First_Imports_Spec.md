CAP-07 - Reference Sources, Line Lists, and Citation-First Imports (Spec)

Document status: Draft (v0.1) - Generated 2025-12-15

Owner: Spectra App project

Purpose: Define how the app searches, imports, caches, and displays credible reference spectra and spectral line lists with strict provenance, licensing awareness, and zero "mystery data".

1\. Scope and non-goals

This cap covers everything required to bring external reference data into the app in a trustworthy, reproducible way-without forcing users to manually download files first.

It defines: data sources, connectors, caching, citations, licensing gates, import normalization rules, and the minimum metadata required for the data to be usable in overlays/differentials.

Non-goals (for CAP-07):

- Telescope/archive ingestion (JWST/HST/MAST/etc.) - handled in CAP-08.
- Full radiative-transfer simulation pipelines (e.g., generating synthetic spectra under arbitrary T/P/pathlength).
- Machine-learning compound identification. (This may be a later cap; CAP-07 focuses on trustworthy reference acquisition.)

2\. Core principles (what must always be true)

- Citation-first: every imported reference dataset must include a source URL (or DOI), retrieval date/time, and a human-readable citation string.
- No silent data fabrication: the app must never invent lines/bands, fill gaps, or 'smooth' reference data unless the user explicitly turns on a labeled transform (CAP-05).
- License-aware sharing: if a source restricts redistribution, the app must block public sharing/export of the raw reference data by default (CAP-02 integration).
- Raw preserved: store the original file payload (e.g., JCAMP-DX, CSV) exactly as downloaded, plus a parsed/normalized representation used for plotting.
- Reproducible queries: store the exact query parameters used to obtain the data (search terms, filters, ranges, etc.).

3\. Reference source taxonomy (how we classify sources)

Every connector must declare its SourceType and DataType. This drives UI grouping, default styling, and sharing rules.

- SourceType: {Lab, UserUpload, ReferenceDatabase, LineListDB, Modeled/ComputedLibrary, Other}
- DataType: {Spectrum, LineList, BandRanges, CrossSection, KTable, MetaOnly}
- TrustTier (for UI badges): {Primary/Authoritative, PeerReviewed/Curated, Community/Derived, Unknown}

4\. Minimum metadata required for a reference import

If a connector cannot provide these fields automatically, the UI must prompt the user to fill the missing ones (but must still keep the original raw payload).

- title (human-readable dataset name)
- source_name (e.g., NIST Chemistry WebBook, NIST ASD, HITRAN, ExoMol)
- source_url (permanent link when possible)
- retrieved_at (timestamp)
- citation_text (human-readable)
- license_id / license_text / redistribution_allowed (tri-state: Yes/No/Unknown)
- x_unit + y_unit (as provided by source)
- domain tags: {compound, element, ion_stage, isotopologue, phase, instrument, conditions} when available

5\. Connector architecture (how agents should implement sources)

Implement sources as pluggable connectors so new sources can be added without touching core ingestion/plot logic.

Recommended structure (names are suggestions; adjust to match the repo layout):

- app/connectors/base.py - shared connector interface + common helpers (HTTP, caching, retries, rate limiting).
- app/connectors/registry.py - discover/enable connectors; expose a single 'search + import' API to UI.
- app/connectors/nist_webbook.py - Chemistry WebBook IR spectra connector (JCAMP-DX download).
- app/connectors/nist_asd.py - Atomic Spectra Database line-list connector (CSV/tab/ASCII output).
- app/connectors/hitran_hapi.py - HITRAN line-list/cross-section connector using HAPI credentials.
- app/connectors/exomol.py - ExoMol line lists / ExoMolOP cross-sections (license CC BY-SA 4.0).
- app/connectors/jpl_catalog.py (optional) - JPL molecular spectroscopy catalog.
- app/connectors/cdms.py (optional) - CDMS catalog.
- docs/references/REFERENCE_LINKS.md - the project's curated link suite; agents must add links they used.

Connector interface (minimum):

- search(query: str, filters: dict) -> List\[SearchResult\]
- fetch(result_id: str, fetch_opts: dict) -> RawPayload (bytes + metadata)
- parse(raw_payload) -> ParsedDataset (x\[\], y\[\] OR lines\[\]; plus metadata)
- license_policy(metadata) -> LicenseDecision {allowed_sharing: bool, reason: str}

6\. Caching, storage, and provenance

CAP-07 relies on CAP-02's dataset library. The connector layer must cache downloads for offline use and to avoid repeated network calls.

Requirements:

- Cache key includes: source_name + stable identifier (e.g., NIST species ID, HITRAN molecule/isotopologue + range + filters, etc.).
- Store the raw payload (exact bytes) and a SHA-256 checksum.
- Store parsed dataset in an internal normalized representation used for plotting (CAP-03).
- Store query provenance (original query string + filters).
- Support cache invalidation: 'Refresh from source' button that re-downloads and records a new retrieved_at timestamp (keep prior versions for reproducibility).

7\. Source-specific requirements (v1 targets)

7.1 NIST Chemistry WebBook - IR spectra (JCAMP-DX)

- Import: download 'spectrum in JCAMP-DX format' from the IR spectrum page.
- Metadata capture: state/phase, instrument, resolution, path length, date, origin/collection info when present.
- License/Sharing: treat as SRD-copyrighted unless explicitly confirmed otherwise; default to NO public redistribution.
- UX: show the source panel with 'Open source page' and 'View metadata' buttons.

7.2 NIST Quantitative Infrared Database - absorption coefficient spectra (JCAMP-DX)

- Import: download JCAMP-DX; record resolution/apodization if available.
- UI must label as 'measured absorption coefficient spectra' and preserve units/conditions.
- License/Sharing: treat as SRD unless confirmed otherwise; default to NO public redistribution.

7.3 NIST Atomic Spectra Database (ASD) - line lists

- Import: use ASD Lines query output formats (CSV/tab-delimited/ASCII) when possible; avoid brittle HTML scraping.
- Required filters: element + ion stage, wavelength/wavenumber range, and optional intensity/transition-probability filters.
- UI: provide a periodic-table selector and an ion-stage selector (I, II, III...).
- Plot: render as 'stick lines' overlay with tooltips (λ/ν~, transition probability where available).
- Sharing: line lists can be shared as derived datasets, but default to NO redistribution if SRD-copyrighted; allow 'share as pointers only' (link + query parameters).

7.4 HITRAN - molecular line lists via HAPI

- Access: require user credentials for HITRANonline where applicable; do not hardcode secrets.
- Import: line-by-line transitions; support filtering by wavenumber range, molecule, isotopologue, and line strength threshold.
- Plot: default display as stick spectrum; cross-section generation is optional and must be labeled as computed.
- Citations: store HITRAN database edition reference + encourage original-source citations.
- Sharing: default to NO public redistribution until HITRAN data-use terms are explicitly verified and recorded in the connector's license policy.

7.5 ExoMol - line lists and ExoMolOP cross-sections

- Import: support selecting molecule + dataset/version; store the ExoMol dataset identifier.
- License: ExoMol data is released under CC BY-SA 4.0; store license text and enforce attribution + share-alike on exports.
- ExoMolOP: allow importing precomputed opacities/cross-sections; label as 'computed opacity products'.
- Plot: for cross-sections, treat as Spectrum DataType with units clearly displayed.

8\. Licensing and sharing gate (must integrate with CAP-02)

Each imported dataset must receive a SharingPolicy computed at import time:

- PrivateOK: always true (local cache).
- GroupShareOK: depends on license; default false if Unknown.
- PublicShareOK: depends on license; default false if Unknown or explicitly restricted.
- ExportRawOK: depends on license; if false, exports must omit raw payload and include only citations + query parameters unless user asserts permission.

Important: NIST Standard Reference Data (SRD) may be copyrighted and may restrict reproduction/redistribution; the app must treat SRD-derived payloads as non-shareable unless permission is explicitly recorded.

9\. UI requirements (what users should see)

- A unified 'Add Reference Data' panel with tabs: Spectra, Line Lists, (optional) Band Ranges.
- A 'Source selector' dropdown (NIST WebBook, NIST ASD, HITRAN, ExoMol, etc.) with short descriptions.
- A results list showing: title, source, key metadata (phase, range), and a trust badge.
- An always-visible 'Cite / Source' box for the selected item (link + citation text + retrieved_at).
- On import, the dataset lands in the library under SourceType=ReferenceDatabase or LineListDB and is auto-tagged (compound/element/etc.).
- A 'License status' pill: Allowed / Not allowed / Unknown (Unknown defaults to restrictive sharing).

10\. Error handling (no silent failures)

- Network failures must surface as actionable messages (source down, auth required, rate-limited, etc.).
- Parsing failures must preserve the raw payload and provide a 'Report parsing issue' bundle (raw + logs).
- If a source changes format: connector must fail gracefully and suggest 'manual import' as fallback (CAP-01).

11\. Acceptance tests (definition of done)

- Import an IR spectrum from NIST WebBook (JCAMP-DX) and overlay it with a local lab spectrum; metadata and citation are visible.
- Import an atomic line list from NIST ASD as CSV/tab-delimited and overlay as stick lines; tooltips display element/ion + wavelength.
- Import a HITRAN line list via HAPI (credentials provided) for a molecule over a user-specified wavenumber range.
- Import an ExoMol dataset and confirm license CC BY-SA is recorded and export includes attribution notes.
- Attempt public sharing of an SRD-derived dataset triggers a block with an explanation and a 'share pointers only' option.
- Cache works offline for previously imported datasets; 'Refresh from source' creates a new version while preserving old.

12\. Questions to ask you (feature-level, no coding knowledge required)

- Which reference sources matter most for your next 30 days: NIST WebBook IR, NIST ASD lines, HITRAN, ExoMol, or something else?
- When you 'share' a reference dataset, do you want to share the raw data file, or just a source link + query so others can re-fetch it themselves?
- Do you want the app to prefer 'measured only' reference spectra by default, and put computed/line-list-derived products behind an explicit toggle?
- For line lists: do you want vertical sticks only, or should the app optionally generate a quick 'pseudo-spectrum' preview (clearly labeled as computed)?
- Do you want a 'Periodic table picker' as the main entry point for element lines, or a search bar first?

13\. Notes for agents (what to update as you implement)

- Every new connector must add its docs/links to docs/references/REFERENCE_LINKS.md (the curated link suite).
- Every connector must declare license/sharing defaults; if unknown, default to restrictive and document what must be verified.
- Do not scrape HTML tables if the source provides CSV/tab/ASCII output options-use the stable output formats instead.
- All imports must write a provenance entry: source_url, retrieved_at, query params, checksum, app version.

Appendix A - Authoritative external references (starting set)

- NIST Chemistry WebBook IR spectra provide downloadable JCAMP-DX payloads on species pages.
- NIST Quantitative Infrared Database states its spectra are provided in JCAMP-DX format.
- NIST Atomic Spectra Database Lines query offers ASCII/CSV/tab-delimited output formats.
- HITRAN provides a Python API (HAPI) for downloading/filtering line-by-line transition data.
- ExoMol provides molecular line lists and publishes a CC BY-SA 4.0 license for all data; ExoMolOP provides opacity products.