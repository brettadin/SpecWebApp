from __future__ import annotations

import json
import os

from fastapi.testclient import TestClient

from app.main import app


def test_cap02_duplicate_sha_prompt_and_resolution(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

    client = TestClient(app)
    csv_bytes = b"x,y\n1,10\n2,20\n3,30\n"

    res1 = client.post(
        "/ingest/commit",
        files={"file": ("ok.csv", csv_bytes, "text/csv")},
        data={"x_index": "0", "y_index": "1", "x_unit": "nm", "y_unit": "flux"},
    )
    assert res1.status_code == 200
    existing_id = res1.json()["dataset"]["id"]

    # Second import of identical bytes should prompt by default.
    res2 = client.post(
        "/ingest/commit",
        files={"file": ("ok.csv", csv_bytes, "text/csv")},
        data={"x_index": "0", "y_index": "1", "x_unit": "nm", "y_unit": "flux"},
    )
    assert res2.status_code == 409
    detail = res2.json().get("detail")
    assert detail and detail.get("code") == "duplicate_sha256"
    assert detail.get("existing_dataset", {}).get("id") == existing_id

    # Resolving to open existing returns a normal 200 response with that dataset.
    res3 = client.post(
        "/ingest/commit",
        files={"file": ("ok.csv", csv_bytes, "text/csv")},
        data={
            "x_index": "0",
            "y_index": "1",
            "x_unit": "nm",
            "y_unit": "flux",
            "on_duplicate": "open_existing",
        },
    )
    assert res3.status_code == 200
    assert res3.json()["dataset"]["id"] == existing_id

    # Keeping both creates a new dataset and records an audit event.
    res4 = client.post(
        "/ingest/commit",
        files={"file": ("ok.csv", csv_bytes, "text/csv")},
        data={
            "x_index": "0",
            "y_index": "1",
            "x_unit": "nm",
            "y_unit": "flux",
            "on_duplicate": "keep_both",
        },
    )
    assert res4.status_code == 200
    new_id = res4.json()["dataset"]["id"]
    assert new_id != existing_id

    audit_res = client.get(f"/datasets/{new_id}/audit")
    assert audit_res.status_code == 200
    actions = [e["action"] for e in audit_res.json()]
    assert "dataset.create" in actions
    assert "dataset.duplicate_kept" in actions


def test_cap02_tags_description_favorite_persist_and_list(tmp_path) -> None:
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

    res_patch = client.patch(
        f"/datasets/{dataset_id}",
        json={
            "description": "Test dataset",
            "tags": ["lab", "CO2", "lab"],
            "favorite": True,
        },
    )
    assert res_patch.status_code == 200
    body = res_patch.json()
    assert body["description"] == "Test dataset"
    assert body["favorite"] is True
    assert body["tags"] == ["lab", "CO2"]

    # Persisted metadata updated
    meta_path = tmp_path / "datasets" / dataset_id / "dataset.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["description"] == "Test dataset"
    assert meta["favorite"] is True
    assert meta["tags"] == ["lab", "CO2"]

    # Tags endpoint aggregates
    tags_res = client.get("/tags")
    assert tags_res.status_code == 200
    tags = tags_res.json()
    assert "lab" in tags
    assert "CO2" in tags

    # Audit includes metadata patch
    audit_res = client.get(f"/datasets/{dataset_id}/audit")
    assert audit_res.status_code == 200
    assert any(e.get("action") == "dataset.metadata_patch" for e in audit_res.json())
