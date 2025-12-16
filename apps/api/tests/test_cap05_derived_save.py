from __future__ import annotations

import json
import os

from fastapi.testclient import TestClient

from app.main import app


def test_cap05_save_derived_creates_new_dataset(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

    client = TestClient(app)

    # Create a parent dataset via ingest.
    csv_bytes = b"x,y\n1,10\n2,20\n3,30\n"
    res = client.post(
        "/ingest/commit",
        files={"file": ("ok.csv", csv_bytes, "text/csv")},
        data={"x_index": "0", "y_index": "1", "x_unit": "nm", "y_unit": "flux"},
    )
    assert res.status_code == 200
    parent_id = res.json()["dataset"]["id"]

    # Save a derived trace.
    derived_y = [0.5, 1.0, 1.5]
    res2 = client.post(
        f"/datasets/{parent_id}/derived",
        json={
            "name": "NORM(max): parent",
            "y": derived_y,
            "y_unit": "flux",
            "transforms": [{"transform_type": "normalize", "parameters": {"mode": "max"}}],
        },
    )
    assert res2.status_code == 200
    derived_id = res2.json()["id"]

    meta_path = tmp_path / "datasets" / derived_id / "dataset.json"
    assert meta_path.exists()
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    assert meta["parent_dataset_id"] == parent_id
    assert meta["x"] == [1.0, 2.0, 3.0]
    assert meta["y"] == derived_y

    manifest_path = tmp_path / "datasets" / derived_id / "transforms.json"
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["parent_dataset_id"] == parent_id
    assert isinstance(manifest["transforms"], list)
