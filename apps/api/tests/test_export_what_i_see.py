from __future__ import annotations

import io
import json
import os
import zipfile

from fastapi.testclient import TestClient

from app.annotations import AnnotationCreatePoint, create_point_note
from app.datasets import save_dataset
from app.main import app


def _zip_names(blob: bytes) -> list[str]:
    with zipfile.ZipFile(io.BytesIO(blob), mode="r") as zf:
        return sorted(zf.namelist())


def _zip_read_json(blob: bytes, name: str) -> dict:
    with zipfile.ZipFile(io.BytesIO(blob), mode="r") as zf:
        raw = zf.read(name)
    return json.loads(raw.decode("utf-8"))


def _zip_read_text(blob: bytes, name: str) -> str:
    with zipfile.ZipFile(io.BytesIO(blob), mode="r") as zf:
        raw = zf.read(name)
    return raw.decode("utf-8")


def test_export_what_i_see_includes_plot_state_and_traces(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

    # Create a local dataset (no reference metadata).
    parsed = {
        "name": "Local",
        "created_at": "2025-12-16T00:00:00Z",
        "source_file_name": "local.csv",
        "sha256": "",
        "parser": "test",
        "parser_decisions": {},
        "x_unit": "nm",
        "y_unit": "arb",
        "x": [1.0, 2.0, 3.0],
        "y": [10.0, 20.0, 30.0],
        "x_count": 3,
        "warnings": [],
    }
    detail = save_dataset(
        name="Local", source_file_name="local.csv", raw=b"x,y\n1,10\n", parsed=parsed
    )

    client = TestClient(app)

    payload = {
        "export_name": "plot",
        "plot_state": {
            "display_x_unit": "nm",
            "visible_trace_ids": [f"o:{detail.id}"],
            "plotly_layout": {"xaxis": {"range": [0, 10]}},
        },
        "traces": [
            {
                "trace_id": f"o:{detail.id}",
                "label": "Local",
                "trace_kind": "original",
                "dataset_id": detail.id,
                "x": [1.0, 2.0, 3.0],
                "y": [10.0, 20.0, 30.0],
                "x_unit": "nm",
                "y_unit": "arb",
                "line_color": "#123",
                "provenance": [],
            }
        ],
    }

    res = client.post("/exports/what-i-see.zip", json=payload)
    assert res.status_code == 200
    assert res.headers.get("content-type", "").startswith("application/zip")
    assert "attachment;" in (res.headers.get("content-disposition") or "").lower()
    assert "plot.zip" in (res.headers.get("content-disposition") or "").lower()

    names = _zip_names(res.content)
    assert any(n.endswith("MANIFEST.json") for n in names)
    assert any(n.endswith("provenance/plot_state.json") for n in names)
    assert any(n.endswith("provenance/transforms.json") for n in names)
    assert any(n.endswith("reports/what_i_did.md") for n in names)
    assert any(n.endswith("reports/reopen_instructions.md") for n in names)
    assert any(n.endswith("reports/citations.md") for n in names)
    assert any(n.endswith("reports/annotations.md") for n in names)
    assert any(n.endswith("annotations/annotations.json") for n in names)
    assert any(n.endswith("data/plotted_traces.json") for n in names)
    assert any(n.endswith("data/plotted_traces.csv") for n in names)
    assert any(n.endswith("checksums/SHA256SUMS.txt") for n in names)

    plot_state_name = [n for n in names if n.endswith("provenance/plot_state.json")][0]
    plot_state = _zip_read_json(res.content, plot_state_name)
    assert plot_state.get("plotly_layout") == {"xaxis": {"range": [0, 10]}}

    transforms_name = [n for n in names if n.endswith("provenance/transforms.json")][0]
    transforms = _zip_read_json(res.content, transforms_name)
    assert isinstance(transforms.get("traces"), list)
    assert transforms["traces"][0].get("trace_id") == f"o:{detail.id}"
    assert transforms["traces"][0].get("provenance") == []

    traces_name = [n for n in names if n.endswith("data/plotted_traces.json")][0]
    traces_json = _zip_read_json(res.content, traces_name)
    assert isinstance(traces_json.get("traces"), list)
    assert traces_json["traces"][0].get("line_color") == "#123"

    report_name = [n for n in names if n.endswith("reports/what_i_did.md")][0]
    report = _zip_read_text(res.content, report_name)
    assert "What I did" in report
    assert f"`o:{detail.id}`" in report

    reopen_name = [n for n in names if n.endswith("reports/reopen_instructions.md")][0]
    reopen = _zip_read_text(res.content, reopen_name)
    assert "Re-open instructions" in reopen
    assert "does not ingest ZIPs" in reopen

    annotations_md_name = [n for n in names if n.endswith("reports/annotations.md")][0]
    annotations_md = _zip_read_text(res.content, annotations_md_name)
    assert "# Annotations" in annotations_md
    assert "No annotations" in annotations_md

    ann_name = [n for n in names if n.endswith("annotations/annotations.json")][0]
    anns = _zip_read_json(res.content, ann_name)
    assert anns == []

    manifest_name = [n for n in names if n.endswith("MANIFEST.json")][0]
    manifest = _zip_read_json(res.content, manifest_name)
    assert manifest.get("includes", {}).get("annotations") is True
    assert manifest.get("includes", {}).get("annotations_hidden_in_render") is False
    assert manifest.get("paths", {}).get("annotations") == "annotations/annotations.json"
    assert manifest.get("includes", {}).get("transforms_manifest") is True
    assert manifest.get("paths", {}).get("transforms_manifest") == "provenance/transforms.json"


def test_export_what_i_see_includes_citations_when_present(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

    parsed = {
        "name": "Ref",
        "created_at": "2025-12-16T00:00:00Z",
        "source_file_name": "ref.csv",
        "sha256": "",
        "parser": "test",
        "parser_decisions": {},
        "x_unit": "nm",
        "y_unit": None,
        "x": [1.0, 2.0],
        "y": [1.0, 1.0],
        "x_count": 2,
        "warnings": [],
        "reference": {
            "data_type": "LineList",
            "source_name": "Test",
            "source_url": "https://example.test/ref",
            "retrieved_at": "2025-12-16T00:00:00Z",
            "citation_text": "cite",
            "sharing_policy": {"export_raw_ok": False},
        },
    }
    detail = save_dataset(name="Ref", source_file_name="ref.csv", raw=b"x\n1\n", parsed=parsed)

    client = TestClient(app)
    payload = {
        "export_name": "plot",
        "plot_state": {"display_x_unit": "nm"},
        "traces": [
            {
                "trace_id": f"o:{detail.id}",
                "label": "Ref",
                "trace_kind": "original",
                "dataset_id": detail.id,
                "x": [1.0, 2.0],
                "y": [1.0, 1.0],
                "x_unit": "nm",
                "y_unit": None,
                "provenance": [],
            }
        ],
    }

    res = client.post("/exports/what-i-see.zip", json=payload)
    assert res.status_code == 200
    assert "plot.zip" in (res.headers.get("content-disposition") or "").lower()

    names = _zip_names(res.content)
    citations_name = [n for n in names if n.endswith("citations/citations.json")][0]
    citations = _zip_read_json(res.content, citations_name)
    assert isinstance(citations, list)
    assert any(c.get("source_url") == "https://example.test/ref" for c in citations)

    citations_md_name = [n for n in names if n.endswith("reports/citations.md")][0]
    citations_md = _zip_read_text(res.content, citations_md_name)
    assert "https://example.test/ref" in citations_md

    assert any(n.endswith("reports/annotations.md") for n in names)


def test_export_what_i_see_flags_annotations_hidden_in_render_when_toggle_off(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

    parsed = {
        "name": "Local",
        "created_at": "2025-12-16T00:00:00Z",
        "source_file_name": "local.csv",
        "sha256": "",
        "parser": "test",
        "parser_decisions": {},
        "x_unit": "nm",
        "y_unit": "arb",
        "x": [1.0, 2.0, 3.0],
        "y": [10.0, 20.0, 30.0],
        "x_count": 3,
        "warnings": [],
    }
    detail = save_dataset(
        name="Local", source_file_name="local.csv", raw=b"x,y\n1,10\n", parsed=parsed
    )

    # Create a dataset annotation so the export has non-empty annotations.
    _ = create_point_note(detail.id, AnnotationCreatePoint(text="note", x=2.0, y=20.0))

    client = TestClient(app)
    payload = {
        "export_name": "plot",
        "plot_state": {
            "display_x_unit": "nm",
            "show_annotations": False,
        },
        "traces": [
            {
                "trace_id": f"o:{detail.id}",
                "label": "Local",
                "trace_kind": "original",
                "dataset_id": detail.id,
                "x": [1.0, 2.0, 3.0],
                "y": [10.0, 20.0, 30.0],
                "x_unit": "nm",
                "y_unit": "arb",
                "provenance": [],
            }
        ],
    }

    res = client.post("/exports/what-i-see.zip", json=payload)
    assert res.status_code == 200

    names = _zip_names(res.content)
    ann_name = [n for n in names if n.endswith("annotations/annotations.json")][0]
    anns = _zip_read_json(res.content, ann_name)
    assert isinstance(anns, list)
    assert len(anns) >= 1

    manifest_name = [n for n in names if n.endswith("MANIFEST.json")][0]
    manifest = _zip_read_json(res.content, manifest_name)
    assert manifest.get("includes", {}).get("annotations") is True
    assert manifest.get("includes", {}).get("annotations_hidden_in_render") is True
