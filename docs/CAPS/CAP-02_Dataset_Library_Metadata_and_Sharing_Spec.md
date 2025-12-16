**CAP-02 - Dataset Library, Metadata, and Sharing**

_Capability specification (Word spec) • Source of truth for implementation + acceptance • Date: December 15, 2025_

# 1\. Summary

CAP-02 defines the application's Dataset Library: persistent storage of datasets imported via CAP-01, rich metadata management, search/filter/tagging, collections (folders), and controlled sharing (user/group/public). The library is the user's long-term memory: it prevents re-upload, preserves provenance, enables collaboration, and provides a stable reference set for comparisons against reference databases and telescope archives.

# 2\. User outcomes (success criteria)

- I can save imported datasets so they are available later without re-uploading.
- Each dataset has a clear identity: who uploaded it, when, what it is, where it came from, and any notes/context.
- I can organize datasets by source (Lab / Reference / Telescope / Other), tags, and collections.
- I can quickly find datasets using search + filters (tags, instrument, date, target, file type).
- I can share datasets with specific people or groups (e.g., a class), or make them public, with explicit permissions.
- The system prevents accidental duplicates and provides clear choices (replace, rename, keep both) when conflicts occur.
- Trust features are visible: checksums, provenance summaries, and direct source links.

# 3\. In scope / Out of scope

## In scope

- Persistent dataset storage and indexing (local-first, with an optional remote backend later).
- Dataset metadata fields (structured + freeform) and editing rules.
- Search, filters, sorting, favorites, tags, and collections (folders).
- Duplicate detection (content-based via checksum) and filename conflict handling.
- Sharing and permissions: private, group/class, public; owner/editor/viewer roles.
- Audit trail for library actions (create/update/share/delete), aligned to the app's provenance-first ethos.

## Out of scope (for CAP-02)

- Parsing/ingestion logic (CAP-01), plotting/overlay (CAP-03).
- Notes/annotations on specific x/y points or x-ranges (CAP-04) - CAP-02 only defines where such notes will be stored later.
- Normalization, transforms, derived traces (CAP-05/CAP-06) - CAP-02 provides the persistence primitives used when a derived trace is explicitly saved.
- Remote retrieval from external databases/archives (CAP-07/CAP-08) - CAP-02 only defines how externally fetched datasets will be stored once acquired.

# 4\. Design principles (derived from your Brain Dump)

- Library must be clean and usable at scale (many datasets) without clutter.
- No silent distortion: the raw file is immutable; processed views are separate artifacts.
- Metadata is first-class: context and citations matter as much as the arrays.
- Sharing must be explicit and permissioned (no accidental exposure).
- Use proven tools and libraries; avoid reinventing storage/auth systems unless required.

# 5\. User workflows (short stories)

## Workflow A - Save after ingest

- User imports one or more files (CAP-01).
- User chooses 'Save to Library' (default on) and optionally assigns tags/source type.
- Dataset appears in Library immediately with a stable ID and searchable metadata.

## Workflow B - Duplicate handling

- User imports a file whose bytes match an existing dataset (same checksum).
- App shows a single conflict dialog with options: open existing, keep as new version, or keep both as distinct records with a reason.
- App records the decision in the audit trail and provenance.

## Workflow C - Class/group sharing

- User selects one or more datasets and clicks Share.
- User selects a group/class and sets permission level (view or edit).
- Group members see the dataset in their Library view according to permissions.

## Workflow D - Public dataset

- User marks a dataset as public.
- App requires a minimal metadata checklist before publication (title, description, source link/citation, license/usage note).
- Dataset becomes discoverable via public search; provenance is visible.

# 6\. UI requirements (Library view + dataset detail)

## Library entry points

- A dedicated Library area (tab or page) that is always accessible after login.
- A persistent search bar supporting: filename, dataset title, tags, target (planet/star), compound/element keywords, instrument.
- Filter panel: source type, tags, instrument, file type, date range, visibility (private/group/public), favorites.
- Sort options: name, date added, last viewed, wavelength/wavenumber range, file size, instrument, tags.

## Dataset card/list item content (minimum)

- Display name/title
- Source type (Lab / Reference / Telescope / Other)
- Key tags (first N, with '+ more')
- Owner/uploader + date added
- Quick actions: open, favorite, share, add to collection

## Dataset detail view (minimum)

- Summary: title, description, uploader, created date, last modified date.
- Raw file info: original filename, size, checksum(s).
- Source citation section: URL/DOI/archive ID(s), with a 'view source' link (CAP-07/08 will populate these automatically for fetched data).
- Acquisition context (if known): instrument, phase, conditions, resolution, range.
- Provenance summary: ingest parser decisions (from CAP-01) + audit events (from CAP-02).
- Controls: edit metadata (if permitted), manage tags/collections, manage sharing/visibility.

## State/persistence rules

- Login state must not reset during typical navigation.
- Library updates (save/edit/share) must not reset plotted overlays (CAP-03) unless user explicitly closes or reloads.
- Avoid multiple popups: for conflicts, use one modal with clear options; for metadata edits, use an in-panel editor.

# 7\. Data model (what is stored)

## Core entities

| **Entity** | **Purpose** | **Key fields (minimum)** |
| --- | --- | --- |
| User | Identity and ownership | user_id, display_name, email/handle, created_at |
| Group/Class | Shared workspace | group_id, name, description, created_by, created_at |
| Membership | Role within group | group_id, user_id, role (admin/member), joined_at |
| Dataset | Logical dataset record | dataset_id, owner_user_id, title, description, source_type, visibility, created_at, updated_at |
| DatasetFile | Raw file storage record | file_id, dataset_id, original_filename, content_hash (sha256), size_bytes, storage_uri, mime_type |
| DatasetVersion | Optional controlled versions | version_id, dataset_id, version_label, created_at, created_by, notes |
| Tag | Searchable labels | tag_id, tag_name, created_at |
| DatasetTag | Dataset↔Tag mapping | dataset_id, tag_id |
| Collection | Folder-like grouping | collection_id, owner_user_id (or group_id), name, description |
| CollectionItem | Collection membership | collection_id, dataset_id, order_index, added_at |
| ShareGrant | Explicit share permissions | grant_id, dataset_id, principal_type (user/group), principal_id, permission (view/edit), created_at |
| AuditEvent | Non-repudiation and debugging | event_id, actor_user_id, dataset_id, action, timestamp, details_json |

## Metadata fields (recommended vocabulary, but flexible)

| source_type | lab \| reference \| telescope \| other (user-selectable; default 'lab' for local imports) |
| --- | --- |
| target | planet/star/system name if relevant (free text + optional controlled vocab later) |
| instrument | free text initially; later: controlled list for telescope/instruments (CAP-08) |
| measurement_type | UV-Vis / IR / Raman / emission / reflectance / transmission (user-selectable) |
| conditions | phase, temperature, pressure, path length, solvent, etc. (free text + structured later) |
| citation | one or more: DOI, URL, archive ID; required for public datasets |
| license | usage statement; required for public datasets |

# 8\. Storage architecture (where bytes live and why)

## Local-first baseline

- Store dataset metadata in a local database (SQLite is acceptable for single-user local mode).
- Store raw files in a local object store directory managed by the app (not scattered user paths).
- Use content hashes as stable identifiers for raw file blobs (content-addressable storage) to enable deduplication and integrity checks.

## Optional remote backend (future-ready, without forcing it now)

- Abstract storage behind an interface: LocalStore vs RemoteStore.
- Remote mode uses a transactional DB for metadata (e.g., Postgres) and object storage for raw bytes (S3-compatible).
- S3-compatible storage can be provided by managed S3 or self-hosted options; keep this pluggable to avoid lock-in.

## Content-addressable raw file store (recommended)

- Raw files are stored as immutable blobs keyed by SHA-256 hash; identical bytes map to one blob.
- Dataset records reference blobs; multiple datasets can point to the same blob with different metadata context.
- Integrity validation: on load, recompute hash (optional) and confirm it matches recorded hash before trusting bytes.

## SQLite considerations (local mode)

- Enable WAL mode for better concurrency (multiple readers while writing) and robustness.
- Applications must handle occasional SQLITE_BUSY cases gracefully and retry where appropriate.

# 9\. Authorization and sharing rules (MUST / MUST NOT)

## Permission model

- Visibility states: private (owner only), group (members with grants), public (anyone).
- Permissions: view (read metadata + plot), edit (modify metadata/tags/collections; cannot alter raw bytes).
- Owner always retains full permissions; public does not imply edit.

## Non-negotiables

- MUST enforce authorization server-side for any shared/remote mode (UI checks are not sufficient).
- MUST default to private on creation unless user explicitly shares/publicizes.
- MUST keep raw files immutable; edits create new versions or new derived artifacts rather than altering the original blob.
- MUST record every share/unshare/permission change in AuditEvent.
- MUST provide a clear display of 'Who can see this?' and 'Who can edit this?' on the dataset detail view.

# 10\. Duplicate detection and conflict resolution

## Two types of conflicts

| **Conflict type** | **Detection** | **Required user choices** |
| --- | --- | --- |
| Content duplicate | Same content_hash (SHA-256) already exists | Open existing / Keep as new dataset context / Create new version / Cancel |
| Filename collision | Same original filename in same user namespace | Rename new / Rename old / Replace old / Keep both with suffix |

## Rules

- Content-based duplicates should be detected regardless of filename.
- Filename auto-rename (file (2)) is allowed only if user does not respond to the conflict dialog in a reasonable timeout; otherwise ask.
- Never silently overwrite a dataset; replace requires explicit confirmation and creates an audit event.

# 11\. Public dataset publishing checklist (minimum)

- Title + short description
- At least one citation link/DOI/archive ID
- Source type and measurement type
- License/usage note (even if 'for educational use')
- Checksum visible
- Optional: thumbnail/preview plot (CAP-03)

# 12\. Acceptance tests (concrete checks)

| **Test ID** | **Scenario** | **Expected result** |
| --- | --- | --- |
| CAP02-T01 | Save dataset after CAP-01 import | Dataset appears in Library after restart; metadata preserved; raw file accessible |
| CAP02-T02 | Edit metadata (title/description/tags) | Changes persist; audit event recorded; permissions enforced |
| CAP02-T03 | Add/remove tags and collections | Search and filters reflect changes immediately |
| CAP02-T04 | Duplicate content import | Conflict dialog appears; chosen action applied; audit recorded |
| CAP02-T05 | Filename collision import | Rename/replace workflow works; no silent overwrite |
| CAP02-T06 | Share dataset to group (view) | Group members can view but cannot edit; owner can revoke |
| CAP02-T07 | Share dataset to group (edit) | Editors can modify metadata; raw file remains immutable |
| CAP02-T08 | Make dataset public | Publishing checklist enforced; dataset appears in public search; provenance visible |
| CAP02-T09 | Unauthorized access attempt | Access denied (server-side where applicable); no metadata leakage |

# 13\. Implementation guidance (where to put what)

## Suggested module boundaries (language/framework-agnostic)

- storage/: raw blob store (local directory or S3 adapter), checksum utilities
- db/: schema + migrations + repository layer (CRUD for entities)
- services/library_service: high-level operations (save, edit, tag, share, publish, search)
- services/authz_service: authorization checks (owner/group grants/public)
- ui/library/: library list, filters, dataset detail, share modal, conflict modal
- audit/: append-only audit writer + viewer in dataset detail

## Key interfaces (to keep future options open)

- BlobStore.put(bytes)->blob_uri, BlobStore.get(blob_uri)->bytes, BlobStore.exists(hash)->bool
- LibraryRepository CRUD for Dataset/DatasetFile/Tag/Collection/ShareGrant/AuditEvent
- Authorization.check(user, dataset, action)->allowed/denied
- SearchIndex.query(text, filters)->dataset_ids (can be DB-driven initially; external index later if needed)

# 14\. Open questions (tracked, not blocking CAP-02 spec)

- Do we support offline multi-user accounts locally, or treat local mode as single-user and add accounts only in remote mode?
- Do we require a license field for private datasets, or only for public datasets?
- Do we allow dataset deletion, or only archival/soft-delete to preserve reproducibility?
- What is the initial controlled vocabulary for measurement_type and source_type?
- Do we support dataset versioning immediately, or add it when derived traces can be saved (CAP-06/CAP-11)?

# Appendix A. Definitions

- Library: the persistent catalog of datasets available to a user/group.
- Blob/raw file: immutable stored bytes addressed by hash (recommended).
- Dataset context: a dataset record + metadata that references one or more blobs.
- Share grant: an explicit permission assignment for a user or group.
- Audit event: append-only record of an action relevant to trust and debugging.

# Appendix B. Project reference links (MUST consult)

The repository includes a user-maintained reference link suite. Agents must consult it before implementing storage, authentication, authorization, or external integrations.  
<br/>Recommended location (single source of truth): docs/references/REFERENCES_RAW.md (or the path used in your project).

# Appendix C. External references used in this CAP

- OWASP Authorization Cheat Sheet (authorization design guidance).
- SQLite Write-Ahead Logging (WAL) documentation (local DB concurrency).
- Content-addressable storage (CAS) concept references for deduplication/integrity.
- MinIO (example S3-compatible object storage option for future remote mode).
- OWASP Authorization Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>
- SQLite WAL: <https://sqlite.org/wal.html>
- CAS overview: <https://grokipedia.com/page/Content-addressable_storage>
- MinIO: <https://www.min.io/>
- MinIO GitHub: <https://github.com/minio/minio>