from __future__ import annotations

from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from app.main import app


def test_cap10_create_list_and_add_event(tmp_path, monkeypatch: MonkeyPatch):
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    client = TestClient(app)

    created = client.post("/sessions", json={"title": "Test session"})
    assert created.status_code == 200, created.text
    created_json = created.json()
    session_id = created_json["id"]

    listed = client.get("/sessions")
    assert listed.status_code == 200, listed.text
    assert any(s["id"] == session_id for s in listed.json())

    ev = client.post(
        f"/sessions/{session_id}/events",
        json={"type": "note", "message": "hello"},
    )
    assert ev.status_code == 200, ev.text
    ev_json = ev.json()
    assert ev_json["type"] == "note"
    assert ev_json["message"] == "hello"

    detail = client.get(f"/sessions/{session_id}")
    assert detail.status_code == 200, detail.text
    dj = detail.json()
    assert dj["id"] == session_id
    assert dj["event_count"] == 1
    assert len(dj["events"]) == 1
    assert dj["events"][0]["message"] == "hello"


def test_cap10_missing_session_returns_404(tmp_path, monkeypatch: MonkeyPatch):
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    client = TestClient(app)

    res = client.get("/sessions/does-not-exist")
    assert res.status_code == 404

    res = client.post("/sessions/does-not-exist/events", json={"type": "note", "message": "x"})
    assert res.status_code == 404
