from __future__ import annotations

import hashlib
import io
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel

from .datasets import datasets_root, get_dataset_detail
from .version import read_version


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _safe_name(value: str) -> str:
    cleaned = "".join(ch if (ch.isalnum() or ch in "-_ ") else "-" for ch in value).strip()
    cleaned = "-".join(part for part in cleaned.replace(" ", "-").split("-") if part)
    return cleaned or "export"


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _raw_files(ds_dir: Path) -> list[Path]:
    return sorted([p for p in ds_dir.iterdir() if p.is_file() and p.name.startswith("raw__")])


class WhatISeeTrace(BaseModel):
    trace_id: str
    label: str
    trace_kind: str
    dataset_id: str | None = None
    parent_dataset_id: str | None = None
    x: list[float]
    y: list[float]
    x_unit: str | None = None
    y_unit: str | None = None
    provenance: list[dict] = []


class WhatISeeExportRequest(BaseModel):
    export_name: str | None = None
    plot_state: dict = {}
    traces: list[WhatISeeTrace]
    # Optional CAP-09 artifacts.
    features: list[dict] | None = None
    matches: list[dict] | None = None


def build_what_i_see_export_zip(*, req: WhatISeeExportRequest) -> bytes:
    """Create a CAP-11 'what I see' export bundle as a ZIP.

    Minimal slice:
    - plotted traces data (CSV + JSON)
    - plot state snapshot (JSON)
    - citations/pointers (JSON) when available
    - annotations (for any referenced datasets) when present
    - optional features/matches (CAP-09) if provided
    - MANIFEST.json + SHA256SUMS.txt
    """

    exported_at = datetime.now(tz=UTC).isoformat()
    stamp = datetime.now(tz=UTC).strftime("%Y%m%d_%H%M%S")
    base_name = _safe_name(req.export_name or "what_i_see")
    root = f"exports/{stamp}__what_i_see__{base_name}/"

    files: dict[str, bytes] = {}

    # Plot state
    plot_state_bytes = json.dumps(
        req.plot_state or {}, indent=2, sort_keys=True, ensure_ascii=False
    ).encode("utf-8")
    files[f"{root}provenance/plot_state.json"] = plot_state_bytes

    # Plotted traces JSON
    traces_payload = {
        "exported_at": exported_at,
        "traces": [t.model_dump() for t in req.traces],
    }
    traces_json = json.dumps(traces_payload, indent=2, sort_keys=True, ensure_ascii=False).encode(
        "utf-8"
    )
    files[f"{root}data/plotted_traces.json"] = traces_json

    # Plotted traces CSV (long format)
    csv_lines: list[str] = ["trace_id,trace_label,x,y,x_unit,y_unit"]
    for t in req.traces:
        x_unit = (t.x_unit or "").replace('"', '""')
        y_unit = (t.y_unit or "").replace('"', '""')
        label = (t.label or "").replace('"', '""')
        for x, y in zip(t.x, t.y, strict=False):
            csv_lines.append(f'"{t.trace_id}","{label}",{x},{y},"{x_unit}","{y_unit}"')
    files[f"{root}data/plotted_traces.csv"] = ("\n".join(csv_lines) + "\n").encode("utf-8")

    # CAP-09 optional artifacts
    if req.features is not None:
        files[f"{root}matches/features.json"] = json.dumps(
            req.features, indent=2, sort_keys=True, ensure_ascii=False
        ).encode("utf-8")
    if req.matches is not None:
        files[f"{root}matches/matches.json"] = json.dumps(
            req.matches, indent=2, sort_keys=True, ensure_ascii=False
        ).encode("utf-8")

    # Dataset inventory, citations, and annotations
    dataset_ids: set[str] = set()
    for t in req.traces:
        if t.dataset_id:
            dataset_ids.add(t.dataset_id)
        if t.parent_dataset_id:
            dataset_ids.add(t.parent_dataset_id)

    datasets: list[dict] = []
    citations: list[dict] = []
    all_annotations: list[dict] = []

    for ds_id in sorted(dataset_ids):
        ds_dir = datasets_root() / ds_id
        meta_path = ds_dir / "dataset.json"
        if not meta_path.exists():
            continue

        meta = _read_json(meta_path)
        detail = get_dataset_detail(ds_id)
        datasets.append(
            {
                "id": ds_id,
                "name": detail.name,
                "created_at": detail.created_at,
                "source_file_name": detail.source_file_name,
                "sha256": detail.sha256,
                "x_unit": detail.x_unit,
                "y_unit": detail.y_unit,
                "reference": meta.get("reference"),
            }
        )

        ref = meta.get("reference") if isinstance(meta.get("reference"), dict) else None
        if isinstance(ref, dict):
            cite_text = ref.get("citation_text")
            src_url = ref.get("source_url")
            retrieved_at = ref.get("retrieved_at")
            if any(
                [
                    str(cite_text or "").strip(),
                    str(src_url or "").strip(),
                    str(retrieved_at or "").strip(),
                ]
            ):
                citations.append(
                    {
                        "dataset_id": ds_id,
                        "source_name": ref.get("source_name"),
                        "source_url": src_url,
                        "retrieved_at": retrieved_at,
                        "citation_text": cite_text,
                        "data_type": ref.get("data_type"),
                    }
                )

        ann_path = ds_dir / "annotations.json"
        if ann_path.exists():
            try:
                raw_anns = json.loads(ann_path.read_text(encoding="utf-8"))
                if isinstance(raw_anns, list):
                    for a in raw_anns:
                        if isinstance(a, dict):
                            all_annotations.append(a)
            except Exception:
                pass

    files[f"{root}citations/citations.json"] = json.dumps(
        citations, indent=2, sort_keys=True, ensure_ascii=False
    ).encode("utf-8")
    if all_annotations:
        files[f"{root}annotations/annotations.json"] = json.dumps(
            all_annotations, indent=2, sort_keys=True, ensure_ascii=False
        ).encode("utf-8")

    version = read_version()
    manifest = {
        "manifest_version": 1,
        "export_id": f"what_i_see:{stamp}",
        "exported_at": exported_at,
        "export_type": "what_i_see",
        "app": {"name": "Spectra App", "version": version.get("version")},
        "includes": {
            "plot_state": True,
            "plotted_traces_csv": True,
            "plotted_traces_json": True,
            "citations": True,
            "annotations": bool(all_annotations),
            "features": req.features is not None,
            "matches": req.matches is not None,
        },
        "datasets": datasets,
        "traces": [
            {
                "trace_id": t.trace_id,
                "label": t.label,
                "trace_kind": t.trace_kind,
                "dataset_id": t.dataset_id,
                "parent_dataset_id": t.parent_dataset_id,
                "x_unit": t.x_unit,
                "y_unit": t.y_unit,
                "provenance": t.provenance,
            }
            for t in req.traces
        ],
        "paths": {
            "plot_state": "provenance/plot_state.json",
            "plotted_traces_json": "data/plotted_traces.json",
            "plotted_traces_csv": "data/plotted_traces.csv",
            "citations": "citations/citations.json",
            "annotations": "annotations/annotations.json" if all_annotations else None,
        },
    }

    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False).encode(
        "utf-8"
    )
    files[f"{root}MANIFEST.json"] = manifest_bytes

    readme = (
        b"This is a minimal CAP-11 'what I see' export bundle.\n"
        b"- provenance/plot_state.json: plot snapshot (units, visible traces, toggles)\n"
        b"- data/plotted_traces.csv|json: the data currently plotted\n"
        b"- citations/citations.json: citation/pointer info when available\n"
        b"- annotations/annotations.json: annotations for referenced datasets (if present)\n"
        b"- matches/: optional CAP-09 features/matches (if provided)\n"
        b"- checksums/: SHA-256 sums for included files\n"
    )
    files[f"{root}README.txt"] = readme

    sums_lines: list[str] = []
    for rel_path in sorted(files.keys()):
        sums_lines.append(f"{_sha256_bytes(files[rel_path])}  {rel_path[len(root) :]}")
    sums = ("\n".join(sums_lines) + "\n").encode("utf-8")
    files[f"{root}checksums/SHA256SUMS.txt"] = sums

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for rel_path, data in files.items():
            zf.writestr(rel_path, data)

    return buf.getvalue()


def build_dataset_export_zip(*, dataset_id: str) -> bytes:
    """Create a CAP-11 dataset export bundle as a ZIP.

    This is a minimal CAP-11 slice:
    - dataset.json (parsed canonical representation)
    - raw payload(s) if permitted
    - annotations.json if present
    - transforms.json if present
    - MANIFEST.json + SHA256SUMS.txt
    """

    # Ensure dataset exists.
    detail = get_dataset_detail(dataset_id)

    ds_dir = datasets_root() / dataset_id
    meta_path = ds_dir / "dataset.json"
    meta = _read_json(meta_path)

    ref = meta.get("reference") if isinstance(meta.get("reference"), dict) else None
    sharing = (
        ref.get("sharing_policy")
        if isinstance(ref, dict) and isinstance(ref.get("sharing_policy"), dict)
        else None
    )

    # Default restrictive for reference datasets: omit raw unless explicitly allowed.
    is_reference = isinstance(ref, dict)
    export_raw_ok = False if is_reference else True
    if isinstance(sharing, dict) and isinstance(sharing.get("export_raw_ok"), bool):
        export_raw_ok = bool(sharing.get("export_raw_ok"))

    exported_at = datetime.now(tz=UTC).isoformat()
    stamp = datetime.now(tz=UTC).strftime("%Y%m%d_%H%M%S")
    base_name = _safe_name(str(detail.name))
    root = f"exports/{stamp}__dataset_{base_name}_{dataset_id}/"

    files: dict[str, bytes] = {}

    # Core payloads
    files[f"{root}data/dataset.json"] = meta_path.read_bytes()

    ann_path = ds_dir / "annotations.json"
    if ann_path.exists():
        files[f"{root}annotations/annotations.json"] = ann_path.read_bytes()

    transforms_path = ds_dir / "transforms.json"
    if transforms_path.exists():
        files[f"{root}provenance/transforms.json"] = transforms_path.read_bytes()

    raw_entries: list[dict] = []
    if export_raw_ok:
        for raw_path in _raw_files(ds_dir):
            out_name = raw_path.name.removeprefix("raw__")
            files[f"{root}raw/{out_name}"] = raw_path.read_bytes()
            raw_entries.append(
                {"included": True, "filename": out_name, "stored_as": f"raw/{out_name}"}
            )
    else:
        for raw_path in _raw_files(ds_dir):
            out_name = raw_path.name.removeprefix("raw__")
            raw_entries.append(
                {
                    "included": False,
                    "filename": out_name,
                    "reason": "sharing_policy.export_raw_ok=false",
                }
            )

    # Build manifest (minimal schema for this slice)
    version = read_version()
    manifest = {
        "manifest_version": 1,
        "export_id": dataset_id,
        "exported_at": exported_at,
        "export_type": "dataset_export",
        "app": {
            "name": "Spectra App",
            "version": version.get("version"),
        },
        "dataset": {
            "id": dataset_id,
            "name": detail.name,
            "created_at": detail.created_at,
            "source_file_name": detail.source_file_name,
            "sha256": detail.sha256,
            "x_unit": detail.x_unit,
            "y_unit": detail.y_unit,
            "reference": ref,
        },
        "raw": raw_entries,
        "includes": {
            "raw": export_raw_ok,
            "annotations": ann_path.exists(),
            "transforms": transforms_path.exists(),
        },
        "pointers": {
            "source_url": ref.get("source_url") if isinstance(ref, dict) else None,
            "retrieved_at": ref.get("retrieved_at") if isinstance(ref, dict) else None,
            "citation_text": ref.get("citation_text") if isinstance(ref, dict) else None,
        },
    }

    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False).encode(
        "utf-8"
    )
    files[f"{root}MANIFEST.json"] = manifest_bytes

    readme = (
        b"This is a minimal CAP-11 dataset export bundle.\n"
        b"- data/dataset.json: parsed canonical data+metadata\n"
        b"- raw/: original payload(s) if permitted by sharing policy\n"
        b"- annotations/: dataset annotations if present\n"
        b"- provenance/: transforms for derived datasets if present\n"
        b"- checksums/: SHA-256 sums for included files\n"
    )
    files[f"{root}README.txt"] = readme

    # Checksums (include all files except the checksum file itself, which we add last)
    sums_lines: list[str] = []
    for rel_path in sorted(files.keys()):
        sums_lines.append(f"{_sha256_bytes(files[rel_path])}  {rel_path[len(root) :]}")
    sums = ("\n".join(sums_lines) + "\n").encode("utf-8")
    files[f"{root}checksums/SHA256SUMS.txt"] = sums

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for rel_path, data in files.items():
            zf.writestr(rel_path, data)

    return buf.getvalue()
