from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field


class DuplicateDatasetError(Exception):
    def __init__(self, *, sha256: str, existing_dataset_id: str):
        super().__init__("Duplicate dataset detected")
        self.sha256 = sha256
        self.existing_dataset_id = existing_dataset_id


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def data_root() -> Path:
    # Local-first, repo-first default. Tests can override with env var.
    override = os.environ.get("SPECTRA_DATA_DIR")
    if override:
        return Path(override)
    return _repo_root() / "data"


def datasets_root() -> Path:
    return data_root() / "datasets"


def _safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip("-_")
    return slug or "file"


class ReferenceSummary(BaseModel):
    data_type: str | None = None
    source_name: str | None = None
    source_url: str | None = None
    retrieved_at: str | None = None
    trust_tier: str | None = None
    citation_present: bool | None = None
    license_redistribution_allowed: str | None = None
    sharing_visibility: str | None = None


class DatasetSummary(BaseModel):
    id: str
    name: str
    created_at: str
    source_file_name: str
    sha256: str
    # --- CAP-02 metadata (local-first) ---
    description: str | None = None
    source_type: str | None = None
    tags: list[str] = Field(default_factory=list)
    collections: list[str] = Field(default_factory=list)
    favorite: bool = False
    # Optional CAP-07 metadata for citation-first visibility without extra calls.
    reference: ReferenceSummary | None = None


class DatasetDetail(DatasetSummary):
    x_unit: str | None
    y_unit: str | None
    x_count: int
    warnings: list[str]


class IngestCommitResponse(BaseModel):
    dataset: DatasetDetail


class DatasetMetadataPatch(BaseModel):
    name: str | None = None
    x_unit: str | None = None
    y_unit: str | None = None
    # CAP-02 fields
    description: str | None = None
    source_type: str | None = None
    tags: list[str] | None = None
    collections: list[str] | None = None
    favorite: bool | None = None


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


class AuditEvent(BaseModel):
    event_id: str
    timestamp: str
    action: str
    details: dict = Field(default_factory=dict)


def _audit_path(dataset_id: str) -> Path:
    return datasets_root() / dataset_id / "audit.jsonl"


def append_audit_event(dataset_id: str, action: str, details: dict | None = None) -> AuditEvent:
    evt = AuditEvent(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(tz=UTC).isoformat(),
        action=action,
        details=details or {},
    )
    path = _audit_path(dataset_id)
    # Append-only, JSONL.
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(evt.model_dump(), ensure_ascii=False) + "\n")
    return evt


def list_audit_events(dataset_id: str, limit: int = 500) -> list[AuditEvent]:
    path = _audit_path(dataset_id)
    if not path.exists():
        return []
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    # Keep newest-last order (append-only); limit from the end.
    lines = lines[-limit:]
    out: list[AuditEvent] = []
    for ln in lines:
        try:
            out.append(AuditEvent(**json.loads(ln)))
        except Exception:
            continue
    return out


def _normalize_string_list(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    for raw in values:
        v = str(raw).strip()
        if not v:
            continue
        cleaned.append(v)
    # Preserve order but drop duplicates.
    seen: set[str] = set()
    out: list[str] = []
    for v in cleaned:
        key = v.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(v)
    return out


def find_dataset_ids_by_sha256(sha256: str) -> list[str]:
    """Return dataset IDs whose persisted metadata sha256 matches."""

    root = datasets_root()
    if not root.exists():
        return []

    out: list[str] = []
    for ds_dir in root.iterdir():
        if not ds_dir.is_dir():
            continue
        meta_path = ds_dir / "dataset.json"
        if not meta_path.exists():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if str(meta.get("sha256", "")) == sha256:
            out.append(ds_dir.name)
    return out


def list_all_tags() -> list[str]:
    tags: set[str] = set()
    for ds in list_datasets():
        for t in ds.tags:
            tags.add(t)
    return sorted(tags, key=lambda s: s.lower())


def list_all_collections() -> list[str]:
    cols: set[str] = set()
    for ds in list_datasets():
        for c in ds.collections:
            cols.add(c)
    return sorted(cols, key=lambda s: s.lower())


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def _reference_summary(meta: dict) -> ReferenceSummary | None:
    ref = meta.get("reference")
    if not isinstance(ref, dict):
        return None

    lic = ref.get("license")
    if not isinstance(lic, dict):
        lic = {}

    sharing = ref.get("sharing_policy")
    if not isinstance(sharing, dict):
        sharing = {}

    citation_text = ref.get("citation_text")
    citation_present: bool | None
    if citation_text is None:
        citation_present = None
    else:
        citation_present = bool(str(citation_text).strip())

    return ReferenceSummary(
        data_type=ref.get("data_type"),
        source_name=ref.get("source_name"),
        source_url=ref.get("source_url"),
        retrieved_at=ref.get("retrieved_at"),
        trust_tier=ref.get("trust_tier"),
        citation_present=citation_present,
        license_redistribution_allowed=lic.get("redistribution_allowed"),
        sharing_visibility=sharing.get("visibility"),
    )


def save_dataset(
    *,
    name: str,
    source_file_name: str,
    raw: bytes,
    parsed: dict,
) -> DatasetDetail:
    datasets_root().mkdir(parents=True, exist_ok=True)

    dataset_id = str(uuid.uuid4())
    created_at = str(parsed.get("created_at") or "").strip() or datetime.now(tz=UTC).isoformat()
    sha = sha256_bytes(raw)

    # Ensure persisted metadata matches the stored raw bytes.
    parsed["created_at"] = created_at
    parsed["name"] = name
    parsed["source_file_name"] = source_file_name
    parsed["sha256"] = sha

    # CAP-02 defaults (do not break older datasets that omit these keys).
    parsed.setdefault("description", None)
    parsed.setdefault("source_type", None)
    parsed.setdefault("tags", [])
    parsed.setdefault("collections", [])
    parsed.setdefault("favorite", False)

    ds_dir = datasets_root() / dataset_id
    ds_dir.mkdir(parents=True, exist_ok=False)

    raw_name = _safe_slug(source_file_name)
    (ds_dir / f"raw__{raw_name}").write_bytes(raw)

    _write_json(ds_dir / "dataset.json", parsed)

    append_audit_event(
        dataset_id,
        "dataset.create",
        {
            "source_file_name": source_file_name,
            "sha256": sha,
            "parser": parsed.get("parser"),
        },
    )

    return DatasetDetail(
        id=dataset_id,
        name=name,
        created_at=created_at,
        source_file_name=source_file_name,
        sha256=sha,
        description=parsed.get("description"),
        source_type=parsed.get("source_type"),
        tags=list(parsed.get("tags", []) or []),
        collections=list(parsed.get("collections", []) or []),
        favorite=bool(parsed.get("favorite", False)),
        reference=_reference_summary(parsed),
        x_unit=parsed.get("x_unit"),
        y_unit=parsed.get("y_unit"),
        x_count=int(parsed.get("x_count", 0)),
        warnings=list(parsed.get("warnings", [])),
    )


def list_datasets() -> list[DatasetSummary]:
    root = datasets_root()
    if not root.exists():
        return []

    out: list[DatasetSummary] = []
    for ds_dir in sorted(root.iterdir()):
        if not ds_dir.is_dir():
            continue

        meta_path = ds_dir / "dataset.json"
        if not meta_path.exists():
            continue

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        out.append(
            DatasetSummary(
                id=ds_dir.name,
                name=str(meta.get("name", ds_dir.name)),
                created_at=str(meta.get("created_at", "")),
                source_file_name=str(meta.get("source_file_name", "")),
                sha256=str(meta.get("sha256", "")),
                description=meta.get("description"),
                source_type=meta.get("source_type"),
                tags=list(meta.get("tags", []) or []),
                collections=list(meta.get("collections", []) or []),
                favorite=bool(meta.get("favorite", False)),
                reference=_reference_summary(meta),
            )
        )

    # Newest-first for usability. ISO timestamps sort lexicographically.
    out.sort(key=lambda d: (d.created_at or ""), reverse=True)
    return out


def get_dataset_detail(dataset_id: str) -> DatasetDetail:
    ds_dir = datasets_root() / dataset_id
    meta_path = ds_dir / "dataset.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    return DatasetDetail(
        id=dataset_id,
        name=str(meta.get("name", dataset_id)),
        created_at=str(meta.get("created_at", "")),
        source_file_name=str(meta.get("source_file_name", "")),
        sha256=str(meta.get("sha256", "")),
        description=meta.get("description"),
        source_type=meta.get("source_type"),
        tags=list(meta.get("tags", []) or []),
        collections=list(meta.get("collections", []) or []),
        favorite=bool(meta.get("favorite", False)),
        reference=_reference_summary(meta),
        x_unit=meta.get("x_unit"),
        y_unit=meta.get("y_unit"),
        x_count=int(meta.get("x_count", 0)),
        warnings=list(meta.get("warnings", [])),
    )


def get_dataset_xy(dataset_id: str) -> dict:
    ds_dir = datasets_root() / dataset_id
    meta_path = ds_dir / "dataset.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    return {
        "id": dataset_id,
        "x": meta.get("x", []),
        "y": meta.get("y", []),
        "x_unit": meta.get("x_unit"),
        "y_unit": meta.get("y_unit"),
        # Optional CAP-07 metadata used by UI for trust-first display.
        "reference": meta.get("reference"),
        # Optional messy-header/instrument metadata captured at ingest.
        "parser": meta.get("parser"),
        "parser_decisions": meta.get("parser_decisions"),
        "source_metadata": meta.get("source_metadata"),
        "source_preamble": meta.get("source_preamble"),
    }


def patch_dataset_metadata(dataset_id: str, patch: DatasetMetadataPatch) -> DatasetDetail:
    ds_dir = datasets_root() / dataset_id
    meta_path = ds_dir / "dataset.json"
    if not meta_path.exists():
        raise FileNotFoundError(dataset_id)

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    changed = False
    audit_details: dict = {}

    if patch.name is not None:
        next_name = patch.name.strip()
        if not next_name:
            raise ValueError("Dataset name cannot be empty.")
        if meta.get("name") != next_name:
            audit_details["name"] = {"from": meta.get("name"), "to": next_name}
            meta["name"] = next_name
            changed = True

    if patch.x_unit is not None:
        next_x_unit = patch.x_unit.strip() or None
        if meta.get("x_unit") != next_x_unit:
            audit_details["x_unit"] = {"from": meta.get("x_unit"), "to": next_x_unit}
            meta["x_unit"] = next_x_unit
            changed = True

    if patch.y_unit is not None:
        next_y_unit = patch.y_unit.strip() or None
        if meta.get("y_unit") != next_y_unit:
            audit_details["y_unit"] = {"from": meta.get("y_unit"), "to": next_y_unit}
            meta["y_unit"] = next_y_unit
            changed = True

    if patch.description is not None:
        next_desc = patch.description.strip() or None
        if meta.get("description") != next_desc:
            audit_details["description"] = {"from": meta.get("description"), "to": next_desc}
            meta["description"] = next_desc
            changed = True

    if patch.source_type is not None:
        next_source_type = patch.source_type.strip() or None
        if meta.get("source_type") != next_source_type:
            audit_details["source_type"] = {
                "from": meta.get("source_type"),
                "to": next_source_type,
            }
            meta["source_type"] = next_source_type
            changed = True

    if patch.tags is not None:
        next_tags = _normalize_string_list(list(patch.tags))
        if list(meta.get("tags", []) or []) != next_tags:
            audit_details["tags"] = {"from": list(meta.get("tags", []) or []), "to": next_tags}
            meta["tags"] = next_tags
            changed = True

    if patch.collections is not None:
        next_cols = _normalize_string_list(list(patch.collections))
        if list(meta.get("collections", []) or []) != next_cols:
            audit_details["collections"] = {
                "from": list(meta.get("collections", []) or []),
                "to": next_cols,
            }
            meta["collections"] = next_cols
            changed = True

    if patch.favorite is not None:
        next_fav = bool(patch.favorite)
        if bool(meta.get("favorite", False)) != next_fav:
            audit_details["favorite"] = {"from": bool(meta.get("favorite", False)), "to": next_fav}
            meta["favorite"] = next_fav
            changed = True

    if changed:
        _write_json(meta_path, meta)

        append_audit_event(dataset_id, "dataset.metadata_patch", audit_details)

    return get_dataset_detail(dataset_id)
