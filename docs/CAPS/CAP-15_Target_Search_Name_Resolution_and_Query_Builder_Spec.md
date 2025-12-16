**CAP-15 - Target Search, Name Resolution, and Query Builder**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-15 adds the missing 'front door' for discovery: a single, consistent way to search for planets, stars, exoplanets, molecules/elements, instruments/telescopes, and then immediately use those targets to (a) filter your local library and (b) launch reference/telescope archive queries (CAP-07/08). The system must handle messy naming, aliases, ambiguous results, and coordinate resolution in a way that feels clean and trustworthy (no mystery behavior).

# 2\. User outcomes (success criteria)

- I can type 'Jupiter', 'WASP-39b', 'Sirius', 'CO2', or 'HST COS' and get a sensible, categorized result list.
- The app resolves messy names to canonical targets (with aliases shown) and doesn't quietly pick the wrong thing.
- If a name is ambiguous, the app asks me to pick from 2-10 candidates (not 200).
- Once I select a target, I can: (1) see my local datasets tagged with it, (2) search reference sources, and (3) search telescope archives.
- I can build searches using simple filters (instrument, wavelength range, date range, product type) without learning archive jargon.
- Everything retrieved is provenance-rich (retrieval time, query parameters, citations/links) and is share-gated (CAP-02/07/08).

# 3\. In scope / Out of scope

## In scope

- Global search bar + structured results (type-ahead).
- Name resolution pipeline (coordinates + canonical IDs + alias handling).
- Target cards ('entity pages') with key metadata and links.
- Query builder UI for archive searches (CAP-08) and reference lookups (CAP-07).
- Saved searches / query presets (per user and per group).
- Target tagging and back-linking to your Dataset Library (CAP-02/03).

## Out of scope (for CAP-15)

- Deep scientific interpretation (feature matching is CAP-09; CAP-15 is discovery + routing).
- Full scholarly bibliographic search (ADS/semantic search can be linked, not built).
- Timeseries workflows (explicitly out of scope per your Brain Dump).

# 4\. Definitions (plain language)

| **Term** | **Definition (what the app means)** |
| --- | --- |
| Target | A thing you might search for: planet, star, exoplanet, molecule/compound, element, instrument, mission, dataset, user. |
| Entity | A canonical target record in the app with a stable ID and aliases (e.g., 'Jupiter' with synonyms and metadata). |
| Name resolution | Converting a user's text input into a canonical entity and/or sky coordinates, with ambiguity handled explicitly. |
| Alias | Alternative names for the same target (nicknames, catalog identifiers, common spellings). |
| Query preset | A saved search definition (filters + connector settings) you can re-run later. |
| Pointers-only | Export/share mode that includes links + parameters but not restricted raw files (CAP-11 + CAP-02/07/08). |

# 5\. UX: What the user sees

## 5.1 Global Search Bar (one entry point)

- A single search bar available from the Library panel and/or top navigation.
- Results are grouped by type: Datasets, Targets (planets/stars/exoplanets), Molecules/Elements, Instruments/Missions, Saved Searches.
- Type-ahead suggests canonical names and shows small type badges (Planet, Star, Molecule, Instrument).
- Every result shows: display name, short descriptor, source icon (local vs external), and a 'go' action.

## 5.2 Target Card (entity page)

- A Target Card is a compact, readable 'profile' for the selected target.
- Must include: canonical name, aliases, target type, key identifiers (where available), coordinates (if relevant), and links to authoritative sources.
- Must include: 'Related in my library' (datasets tagged to this target) and 'Run searches' (launch query builder presets).
- Optional: show an image thumbnail (planet photo / mission logo / molecule sketch) if allowed by licensing.

## 5.3 Query Builder (simple-first, advanced optional)

- Simple mode: target + instrument + wavelength range + date range + product type + 'Search'.
- Advanced mode: connector-specific filters (proposal ID, program, pipeline level, calibration state, etc.) hidden by default.
- Query builder shows a preview table: number of hits, top results, and which fields will be saved as metadata.
- User can 'Save as preset' (for reuse) and 'Pin' preset to the sidebar.

## 5.4 Guardrails for messy naming

- If input looks like coordinates, treat it as coordinates first and show that explicitly ('Using coordinates: RA/Dec …').
- If input could be multiple things (e.g., 'Titan'), show a small disambiguation chooser (Moon vs asteroid vs other).
- Never silently change user text without showing the resolved entity (canonical name + alias mapping).

# 6\. Name Resolution Engine (behavior contract)

## 6.1 Resolution routing logic (high-level)

Resolution should be deterministic and explainable. Recommended routing order:

- Detect explicit coordinate patterns (RA/Dec, degrees, HMS/DMS). If present, resolve to coordinates directly.
- Detect obvious chemistry tokens (formula like CO2, H2O) or periodic-table symbols (Na, Fe). Route to chemical/element resolver.
- Detect Solar System body candidates (Jupiter, Titan, Saturn) and route to Solar System resolver.
- Else treat as astronomical object name and route to astronomical name resolver.
- If still unresolved, treat as free text and offer search suggestions (library, references, docs).

## 6.2 Ambiguity handling

- If multiple plausible matches exist, show a ranked list of candidates and ask the user to pick.
- Ranking heuristics should favor: exact match > case-insensitive exact > known alias > prefix > fuzzy.
- For each candidate, show: type, short descriptor, and source (e.g., SIMBAD/Sesame/Horizons/Exoplanet Archive).
- User choice is remembered as an alias preference (per user/workspace) to reduce repeated prompts.

## 6.3 Caching rules

- Resolved entities are cached locally with retrieval timestamps and source attribution.
- Cache must be safe to clear; clearing cache must not delete user datasets (only resolver lookups).
- Cache should respect offline mode: show cached results when offline and mark them as cached.

# 7\. Recommended connectors and tools (use what exists)

CAP-15 must not invent new resolvers unless necessary. Prefer established libraries and services, then wrap them with a small, consistent app interface.

| **Need** | **Preferred tools/services** | **Why it fits** |
| --- | --- | --- |
| Astronomical object name → coordinates | Astropy SkyCoord.from_name (Sesame under the hood) | Simple name→coord flow; widely used |
| Astronomical object metadata/aliases | astroquery.simbad (SIMBAD) | Good for object types, identifiers, basic metadata |
| Solar System object resolution | astroquery.jplhorizons (JPL Horizons) | Handles Solar System names/IDs; consistent results |
| Exoplanet canonical records | NASA Exoplanet Archive API/TAP | Stable host for official exoplanet parameters and names |
| Archive search standards | pyvo (TAP/SSA/SIA), plus astroquery per-service modules | Use VO protocols where appropriate; use service-specific modules when better |
| MAST/JWST/HST discovery | astroquery.mast Observations/Missions or MAST API | Direct fit for CAP-08 retrieval and filters |

# 8\. Data model (what gets stored)

## 8.1 Entity record (minimum fields)

- entity_id: UUID
- entity_type: planet | exoplanet | star | moon | molecule | element | instrument | mission | dataset | user | group
- canonical_name: display name used everywhere in UI
- aliases: list of known alternative names
- identifiers: dict (e.g., simbad_id, horizons_id, exoplanet_archive_name, etc.)
- coordinates: optional (RA/Dec + frame) where relevant
- source_attribution: where this record came from + retrieved_at
- links: authoritative URLs for 'View source'
- tags: user/group tags (optional)

## 8.2 Query preset record

- preset_id: UUID
- name: user-friendly name (e.g., 'JWST NIRSpec for WASP-39b').
- connector: which backend (MAST, Exoplanet Archive, etc.).
- parameters: the exact filters used (machine-readable).
- created_by / created_at / workspace scope (personal vs group).

## 8.3 Relationship model (important)

- dataset_id ↔ entity_id: datasets are tagged to targets/entities.
- session_id ↔ entity_id: sessions can be tagged to targets.
- preset_id ↔ entity_id: presets can be linked to a target (so Target Card can show 'Saved searches').

# 9\. Integration with the rest of the app

- CAP-02: tagging, metadata, sharing scope for entities and presets.
- CAP-03: trace list grouping/filtering by entity tags.
- CAP-07: reference source queries launched from Query Builder.
- CAP-08: telescope/archive queries launched from Query Builder; results become datasets tagged to the target.
- CAP-10: notebook entries link to targets; target card shows related notes.
- CAP-11: export bundles include resolved entity metadata and the exact query parameters used.
- CAP-12: add smoke tests for name resolution and query builder; no dead controls.
- CAP-14: docs pages for 'How to search targets' and 'How name resolution works'.

# 10\. 'Don't lie to me' trust rules (CAP-15 specific)

- Always display the resolved target and source before running an external query.
- Always store and show retrieved_at + source for resolved data (especially coordinates).
- If a resolver fails or times out, show a clear message and offer: try again / use cached / enter coordinates manually.
- Never silently swap target types (e.g., treat 'Titan' as a star). If uncertain, disambiguate.

# 11\. Acceptance tests (definition of done)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP15-T01 | Search: 'Sirius' | Shows Star result; target card includes aliases + coordinates + source link |
| CAP15-T02 | Search: 'Jupiter' | Routes to Solar System resolver; target card identifies it correctly |
| CAP15-T03 | Search: ambiguous name ('Titan') | Shows disambiguation chooser; user selection is remembered |
| CAP15-T04 | Search: chemistry token ('CO2') | Shows Molecule result; links to reference sources and line/band resources (CAP-07) |
| CAP15-T05 | Query Builder: simple search | User selects target + instrument + wavelength range; results preview renders; can import |
| CAP15-T06 | Save search preset | Preset appears in sidebar and on target card; re-run returns consistent results |
| CAP15-T07 | Offline mode | Cached entities/presets visible; new external resolution calls are blocked with a clear message |
| CAP15-T08 | Provenance persistence | Imported datasets carry target tags + query parameters + retrieved_at metadata (CAP-02/08) |

# 12\. Open questions to ask you (non-technical)

- Do you want the global search to prioritize local library hits first, or targets first (planets/stars/molecules)?
- Should the target card show a small image by default, or only when you expand it (to keep the UI minimal)?
- When a name is ambiguous, do you want the app to remember your last choice globally or per workspace/class?
- Do you want a 'search by telescope/instrument first' mode (instrument control panel), or keep it within query builder?
- Do you want molecule searches to treat synonyms like 'carbon dioxide' ↔ 'CO2' automatically?

# Appendix A. Project reference links (MUST consult)

You stated the repo contains a curated suite of reference links and policies. Agents must consult it before finalizing resolver priority rules, defining instrument lists, adding imagery sources, or hardcoding any scientific tables. This CAP names common astronomy tooling, but your curated link suite is the single source of truth for approved sources.

Recommended single source of truth path (update to match your repo): docs/references/REFERENCE_LINKS.md

# Appendix B. External reference links (official docs)

- Astroquery overview: <https://astroquery.readthedocs.io/>
- astroquery.simbad: <https://astroquery.readthedocs.io/en/latest/simbad/simbad.html>
- astroquery.jplhorizons: <https://astroquery.readthedocs.io/en/latest/jplhorizons/jplhorizons.html>
- astroquery.mast: <https://astroquery.readthedocs.io/en/latest/mast/mast.html>
- MAST API documentation: <https://mast.stsci.edu/api/v0/>
- Astropy coordinates (SkyCoord.from_name / Sesame): <https://docs.astropy.org/en/stable/coordinates/index.html>
- Sesame name resolver: <https://vizier.u-strasbg.fr/viz-bin/Sesame/NSVA>
- NASA Exoplanet Archive API: <https://exoplanetarchive.ipac.caltech.edu/docs/program_interfaces.html>
- NASA Exoplanet Archive TAP: <https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html>
- PyVO (VO protocols like TAP/SSA/SIA): <https://pyvo.readthedocs.io/>
- IVOA TAP Recommendation: <https://www.ivoa.net/documents/TAP/>