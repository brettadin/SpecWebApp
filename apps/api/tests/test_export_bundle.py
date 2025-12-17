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


def test_dataset_export_zip_includes_raw_for_local_ingest(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

    client = TestClient(app)
    csv_bytes = b"x,y\n1,10\n2,20\n3,30\n"

    res = client.post(
        "/ingest/commit",
        files={"file": ("ok.csv", csv_bytes, "text/csv")},
        data={"x_index": "0", "y_index": "1", "x_unit": "nm", "y_unit": "flux"},
    )
    assert res.status_code == 200
    dataset_id = res.json()["dataset"]["id"]

    # Add an annotation to ensure it gets picked up.
    res2 = client.post(
        f"/datasets/{dataset_id}/annotations/point",
        json={"text": "note", "x": 2.0, "y": None},
    )
    assert res2.status_code == 200

    exp = client.get(f"/datasets/{dataset_id}/export/dataset.zip")
    assert exp.status_code == 200
    assert exp.headers.get("content-type", "").startswith("application/zip")

    names = _zip_names(exp.content)
    assert any(n.endswith("MANIFEST.json") for n in names)
    assert any(n.endswith("checksums/SHA256SUMS.txt") for n in names)
    assert any(n.endswith("data/dataset.json") for n in names)
    assert any(n.endswith("annotations/annotations.json") for n in names)
    # Local ingest has no restrictive sharing policy, so raw should be included.
    assert any("/raw/" in n for n in names)


def test_dataset_export_zip_omits_raw_when_sharing_policy_blocks(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

    # Create a reference-like dataset with export_raw_ok=false.
    parsed = {
        "name": "Restricted Ref",
        "created_at": "2025-12-16T00:00:00Z",
        "source_file_name": "ref.csv",
        "sha256": "",
        "parser": "test",
        "parser_decisions": {},
        "x_unit": "nm",
        "y_unit": None,
        "x": [1.0, 2.0, 3.0],
        "y": [1.0, 1.0, 1.0],
        "x_count": 3,
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

    detail = save_dataset(
        name="Restricted Ref", source_file_name="ref.csv", raw=b"x,y\n1,1\n", parsed=parsed
    )

    client = TestClient(app)
    exp = client.get(f"/datasets/{detail.id}/export/dataset.zip")
    assert exp.status_code == 200

    names = _zip_names(exp.content)
    assert any(n.endswith("MANIFEST.json") for n in names)

    # Raw should be omitted.
    assert not any("/raw/" in n for n in names)

    manifest_name = [n for n in names if n.endswith("MANIFEST.json")][0]
    manifest = _zip_read_json(exp.content, manifest_name)
    assert manifest["includes"]["raw"] is False
    assert manifest["pointers"]["source_url"] == "https://example.test/ref"
