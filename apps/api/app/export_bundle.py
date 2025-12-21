from __future__ import annotations

import hashlib
import io
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field

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


def _fmt_int(n: int) -> str:
    return f"{n:,}"


def _first_nonempty(values: list[str | None]) -> str | None:
    for v in values:
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return None


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
    # Optional plotting style hints for reproducibility.
    line_color: str | None = None
    line_dash: str | None = None
    line_width: float | None = None

    provenance: list[dict] = Field(default_factory=list)


class WhatISeeExportRequest(BaseModel):
    export_name: str | None = None
    plot_state: dict = Field(default_factory=dict)
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

    # CAP-05: transforms/provenance snapshot (derived traces, normalization, baseline, etc.)
    transforms_payload = {
        "exported_at": exported_at,
        "traces": [
            {
                "trace_id": t.trace_id,
                "label": t.label,
                "trace_kind": t.trace_kind,
                "dataset_id": t.dataset_id,
                "parent_dataset_id": t.parent_dataset_id,
                "provenance": t.provenance or [],
            }
            for t in req.traces
        ],
    }
    transforms_bytes = json.dumps(
        transforms_payload, indent=2, sort_keys=True, ensure_ascii=False
    ).encode("utf-8")
    files[f"{root}provenance/transforms.json"] = transforms_bytes

    # Human-readable report
    ps = req.plot_state or {}
    x_unit = _first_nonempty([ps.get("x_unit_label"), ps.get("display_x_unit")])
    y_unit = _first_nonempty([ps.get("y_unit_label")])
    show_anns = ps.get("show_annotations")
    report_lines: list[str] = [
        "# What I did (CAP-11 — what I see)",
        "",
        f"Exported at: `{exported_at}`",
        f"Export name: `{base_name}`",
        "",
        "## Plot snapshot",
        f"- X unit: `{x_unit or 'unknown'}`",
        f"- Y unit: `{y_unit or 'unknown'}`",
        f"- Annotations shown: `{show_anns}`"
        if show_anns is not None
        else "- Annotations shown: (unknown)",
    ]

    visible_ds = ps.get("visible_dataset_ids")
    if isinstance(visible_ds, list):
        report_lines.append(f"- Visible datasets: `{_fmt_int(len(visible_ds))}`")
    visible_derived = ps.get("visible_derived_trace_ids")
    if isinstance(visible_derived, list):
        report_lines.append(f"- Visible derived traces: `{_fmt_int(len(visible_derived))}`")

    report_lines.extend(["", "## Traces", ""])
    for t in req.traces:
        n_points = min(len(t.x), len(t.y))
        prov_len = len(t.provenance or [])
        report_lines.append(
            f"- `{t.trace_id}` — {t.label} ({t.trace_kind}), "
            f"points={_fmt_int(n_points)}, provenance={_fmt_int(prov_len)}"
        )
        style_bits: list[str] = []
        if t.line_color:
            style_bits.append(f"color={t.line_color}")
        if t.line_dash:
            style_bits.append(f"dash={t.line_dash}")
        if t.line_width is not None:
            style_bits.append(f"width={t.line_width}")
        if style_bits:
            report_lines.append(f"  - style: {', '.join(style_bits)}")

    report_lines.extend(["", "## CAP-09 artifacts", ""])
    report_lines.append(
        f"- Features included: `{_fmt_int(len(req.features))}`"
        if isinstance(req.features, list)
        else "- Features included: `0`"
    )
    report_lines.append(
        f"- Matches included: `{_fmt_int(len(req.matches))}`"
        if isinstance(req.matches, list)
        else "- Matches included: `0`"
    )

    report_lines.extend(["", "## Files in this bundle", ""])
    report_lines.extend(
        [
            "- `provenance/plot_state.json` — plot snapshot (Plotly layout/relayout if provided)",
            "- `provenance/transforms.json` — transform/provenance records for plotted traces",
            "- `data/plotted_traces.json` — traces + arrays as currently plotted",
            "- `data/plotted_traces.csv` — traces in long-form CSV",
            "- `citations/citations.json` — source pointers/citations when available",
            "- `reports/citations.md` — human-readable citations summary",
            "- `reports/annotations.md` — human-readable annotations summary",
            "- `annotations/annotations.json` — annotations for referenced datasets (if present)",
            "- `matches/` — optional CAP-09 features/matches (if provided)",
            "- `MANIFEST.json` — machine-readable manifest",
            "- `checksums/SHA256SUMS.txt` — SHA-256 checksums",
        ]
    )

    files[f"{root}reports/what_i_did.md"] = ("\n".join(report_lines) + "\n").encode("utf-8")

    reopen = [
        "# Re-open instructions (CAP-11 — what I see)",
        "",
        "This bundle is a *snapshot of what was plotted*, not a raw re-import of the",
        "original source",
        "files.",
        "",
        "## Quick start",
        "1. Open `data/plotted_traces.csv` in a spreadsheet / Python / R to inspect the exported",
        "   curves.",
        "2. Open `provenance/plot_state.json` to see display units, visible trace IDs,",
        "   and any Plotly",
        "   layout/relayout state.",
        "3. Open `reports/what_i_did.md` for a human-readable summary.",
        "",
        "## What you can reproduce",
        "- The plotted X/Y arrays (exactly as displayed at export time)",
        "- Basic trace styling hints if provided (`line_dash`, `line_color`, `line_width`)",
        "- Plotly view/layout hints if present (`plotly_layout`, `plotly_relayout`)",
        "- Citation pointers for referenced datasets (when available)",
        "- Annotations for referenced datasets (if present)",
        "",
        "## What this does not include",
        "- Original raw payloads from referenced sources",
        "  (use dataset export for that when allowed)",
        "- A one-click import endpoint (this API currently exports ZIPs; it does not ingest ZIPs)",
        "",
        "## Files of interest",
        "- `data/plotted_traces.json`: includes per-trace metadata and arrays",
        "- `citations/citations.json`: source_url / retrieved_at / citation_text",
        "- `checksums/SHA256SUMS.txt`: verify integrity",
        "",
    ]
    files[f"{root}reports/reopen_instructions.md"] = ("\n".join(reopen) + "\n").encode("utf-8")

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
    annotations_count_by_dataset_id: dict[str, int] = {}

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
                    annotations_count_by_dataset_id[ds_id] = len(raw_anns)
                    for a in raw_anns:
                        if isinstance(a, dict):
                            all_annotations.append(a)
            except Exception:
                pass

    files[f"{root}citations/citations.json"] = json.dumps(
        citations, indent=2, sort_keys=True, ensure_ascii=False
    ).encode("utf-8")

    citations_md: list[str] = ["# Citations", ""]
    if citations:
        citations_md.append(
            "This file summarizes `citations/citations.json` into a human-readable list."
        )
        citations_md.append("")
        for c in citations:
            ds_id = str(c.get("dataset_id") or "").strip() or "(unknown dataset)"
            title = str(c.get("source_name") or "").strip() or "(unknown source)"
            url = str(c.get("source_url") or "").strip() or None
            retrieved = str(c.get("retrieved_at") or "").strip() or None
            cite_text = str(c.get("citation_text") or "").strip() or None
            data_type = str(c.get("data_type") or "").strip() or None

            heading = f"- **{title}**"
            if data_type:
                heading = f"{heading} ({data_type})"
            citations_md.append(heading)
            citations_md.append(f"  - dataset_id: `{ds_id}`")
            if url:
                citations_md.append(f"  - url: {url}")
            if retrieved:
                citations_md.append(f"  - retrieved_at: `{retrieved}`")
            if cite_text:
                citations_md.append(f"  - citation: {cite_text}")
            citations_md.append("")
    else:
        citations_md.append("No citation metadata was available for the exported traces.")
        citations_md.append("")

    files[f"{root}reports/citations.md"] = ("\n".join(citations_md)).encode("utf-8")

    annotations_md: list[str] = ["# Annotations", ""]
    if all_annotations:
        annotations_md.append(
            "This file summarizes `annotations/annotations.json` into a human-readable overview."
        )
        annotations_md.append("")
        annotations_md.append(f"Total annotations: `{_fmt_int(len(all_annotations))}`")
        annotations_md.append("")
        annotations_md.append("## By dataset")
        annotations_md.append("")
        ds_name_by_id = {d.get("id"): d.get("name") for d in datasets if isinstance(d, dict)}
        for ds_id in sorted(annotations_count_by_dataset_id.keys()):
            n = annotations_count_by_dataset_id.get(ds_id) or 0
            name = str(ds_name_by_id.get(ds_id) or "").strip() or None
            label = f"- `{ds_id}`"
            if name:
                label = f"{label} — {name}"
            annotations_md.append(f"{label}: `{_fmt_int(n)}`")
        annotations_md.append("")
        annotations_md.append("See `annotations/annotations.json` for full details.")
        annotations_md.append("")
    else:
        annotations_md.append("No annotations were available for the exported traces.")
        annotations_md.append("")

    files[f"{root}reports/annotations.md"] = ("\n".join(annotations_md)).encode("utf-8")
    # CAP-04: always include annotations.json for machine-readable re-use.
    # If there are no annotations for the exported traces, write an empty list.
    files[f"{root}annotations/annotations.json"] = json.dumps(
        all_annotations, indent=2, sort_keys=True, ensure_ascii=False
    ).encode("utf-8")

    version = read_version()
    annotations_hidden_in_render = bool((req.plot_state or {}).get("show_annotations") is False)
    manifest = {
        "manifest_version": 1,
        "export_id": f"what_i_see:{stamp}",
        "exported_at": exported_at,
        "export_type": "what_i_see",
        "app": {"name": "Spectra App", "version": version.get("version")},
        "includes": {
            "plot_state": True,
            "transforms_manifest": True,
            "plotted_traces_csv": True,
            "plotted_traces_json": True,
            "citations": True,
            "citations_report": True,
            "annotations": True,
            "annotations_report": True,
            "annotations_hidden_in_render": annotations_hidden_in_render,
            "features": req.features is not None,
            "matches": req.matches is not None,
            "what_i_did_report": True,
            "reopen_instructions": True,
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
            "transforms_manifest": "provenance/transforms.json",
            "what_i_did_report": "reports/what_i_did.md",
            "reopen_instructions": "reports/reopen_instructions.md",
            "plotted_traces_json": "data/plotted_traces.json",
            "plotted_traces_csv": "data/plotted_traces.csv",
            "citations": "citations/citations.json",
            "citations_report": "reports/citations.md",
            "annotations_report": "reports/annotations.md",
            "annotations": "annotations/annotations.json",
        },
    }

    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False).encode(
        "utf-8"
    )
    files[f"{root}MANIFEST.json"] = manifest_bytes

    readme = (
        b"This is a minimal CAP-11 'what I see' export bundle.\n"
        b"- provenance/plot_state.json: plot snapshot (units, visible traces, toggles)\n"
        b"- provenance/transforms.json: transform/provenance records for plotted traces\n"
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
