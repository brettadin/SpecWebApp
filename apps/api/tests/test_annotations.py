from __future__ import annotations

import os

from fastapi.testclient import TestClient

from app.main import app


def test_annotations_crud_roundtrip(tmp_path) -> None:
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

    # Create point note
    res2 = client.post(
        f"/datasets/{dataset_id}/annotations/point",
        json={"text": "peak", "x": 2.0, "y": 20.0},
    )
    assert res2.status_code == 200
    point = res2.json()
    assert point["type"] == "point"
    assert point["x0"] == 2.0
    assert point["y0"] == 20.0
    assert point["x_unit"] == "nm"

    # Create range (order should normalize)
    res3 = client.post(
        f"/datasets/{dataset_id}/annotations/range-x",
        json={"text": "band", "x0": 3.0, "x1": 1.0},
    )
    assert res3.status_code == 200
    band = res3.json()
    assert band["type"] == "range_x"
    assert band["x0"] == 1.0
    assert band["x1"] == 3.0

    # List
    res4 = client.get(f"/datasets/{dataset_id}/annotations")
    assert res4.status_code == 200
    items = res4.json()
    assert len(items) == 2

    # Update
    res5 = client.put(
        f"/datasets/{dataset_id}/annotations/{point['annotation_id']}",
        json={"text": "updated"},
    )
    assert res5.status_code == 200
    assert res5.json()["text"] == "updated"

    # Delete
    res6 = client.delete(f"/datasets/{dataset_id}/annotations/{band['annotation_id']}")
    assert res6.status_code == 200

    res7 = client.get(f"/datasets/{dataset_id}/annotations")
    assert res7.status_code == 200
    items2 = res7.json()
    assert len(items2) == 1
