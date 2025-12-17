from __future__ import annotations

import io
import json
import os
import zipfile

from fastapi.testclient import TestClient

from app.datasets import save_dataset
from app.main import app


def _zip_names(blob: bytes) -> list[str]:
    with zipfile.ZipFile(io.BytesIO(blob), mode="r") as zf:
        return sorted(zf.namelist())


def _zip_read_json(blob: bytes, name: str) -> dict:
    with zipfile.ZipFile(io.BytesIO(blob), mode="r") as zf:
        raw = zf.read(name)
    return json.loads(raw.decode("utf-8"))


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
        "plot_state": {"display_x_unit": "nm", "visible_trace_ids": [f"o:{detail.id}"]},
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
    assert res.headers.get("content-type", "").startswith("application/zip")

    names = _zip_names(res.content)
    assert any(n.endswith("MANIFEST.json") for n in names)
    assert any(n.endswith("provenance/plot_state.json") for n in names)
    assert any(n.endswith("data/plotted_traces.json") for n in names)
    assert any(n.endswith("data/plotted_traces.csv") for n in names)
    assert any(n.endswith("checksums/SHA256SUMS.txt") for n in names)


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

    names = _zip_names(res.content)
    citations_name = [n for n in names if n.endswith("citations/citations.json")][0]
    citations = _zip_read_json(res.content, citations_name)
    assert isinstance(citations, list)
    assert any(c.get("source_url") == "https://example.test/ref" for c in citations)
