from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel


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


class DatasetSummary(BaseModel):
    id: str
    name: str
    created_at: str
    source_file_name: str
    sha256: str


class DatasetDetail(DatasetSummary):
    x_unit: str | None
    y_unit: str | None
    x_count: int
    warnings: list[str]


class IngestCommitResponse(BaseModel):
    dataset: DatasetDetail


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def save_dataset(
    *,
    name: str,
    source_file_name: str,
    raw: bytes,
    parsed: dict,
) -> DatasetDetail:
    datasets_root().mkdir(parents=True, exist_ok=True)

    dataset_id = str(uuid.uuid4())
    created_at = datetime.now(tz=UTC).isoformat()
    sha = sha256_bytes(raw)

    ds_dir = datasets_root() / dataset_id
    ds_dir.mkdir(parents=True, exist_ok=False)

    raw_name = _safe_slug(source_file_name)
    (ds_dir / f"raw__{raw_name}").write_bytes(raw)

    _write_json(ds_dir / "dataset.json", parsed)

    return DatasetDetail(
        id=dataset_id,
        name=name,
        created_at=created_at,
        source_file_name=source_file_name,
        sha256=sha,
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
            )
        )

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
    }
