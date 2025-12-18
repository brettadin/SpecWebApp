from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from .datasets import data_root


def sessions_root() -> Path:
    return data_root() / "sessions"


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def _session_dir(session_id: str) -> Path:
    return sessions_root() / session_id


class SessionEvent(BaseModel):
    id: str
    created_at: str
    type: str
    message: str | None = None
    payload: dict[str, Any] | None = None


class SessionSummary(BaseModel):
    id: str
    title: str
    created_at: str
    event_count: int
    last_event_at: str | None = None


class SessionDetail(SessionSummary):
    events: list[SessionEvent]


class SessionCreateRequest(BaseModel):
    title: str | None = None


class SessionAddEventRequest(BaseModel):
    type: str = "note"
    message: str | None = None
    payload: dict[str, Any] | None = None


def create_session(req: SessionCreateRequest) -> SessionDetail:
    sessions_root().mkdir(parents=True, exist_ok=True)

    session_id = str(uuid.uuid4())
    created_at = datetime.now(tz=UTC).isoformat()

    title = (req.title or "").strip() or f"Session {created_at[:10]}"

    detail = SessionDetail(
        id=session_id,
        title=title,
        created_at=created_at,
        event_count=0,
        last_event_at=None,
        events=[],
    )

    ds_dir = _session_dir(session_id)
    ds_dir.mkdir(parents=True, exist_ok=False)
    _write_json(ds_dir / "session.json", detail.model_dump())

    return detail


def list_sessions() -> list[SessionSummary]:
    root = sessions_root()
    if not root.exists():
        return []

    out: list[SessionSummary] = []
    for d in sorted(root.iterdir()):
        if not d.is_dir():
            continue
        meta_path = d / "session.json"
        if not meta_path.exists():
            continue
        meta = _read_json(meta_path)
        out.append(
            SessionSummary(
                id=d.name,
                title=str(meta.get("title") or d.name),
                created_at=str(meta.get("created_at") or ""),
                event_count=int(meta.get("event_count") or 0),
                last_event_at=(
                    str(meta.get("last_event_at")) if meta.get("last_event_at") else None
                ),
            )
        )

    # Most recent first.
    return sorted(out, key=lambda s: s.last_event_at or s.created_at, reverse=True)


def get_session(session_id: str) -> SessionDetail:
    ds_dir = _session_dir(session_id)
    meta_path = ds_dir / "session.json"
    meta = _read_json(meta_path)

    events_raw = meta.get("events")
    if not isinstance(events_raw, list):
        events_raw = []

    events: list[SessionEvent] = []
    for e in events_raw:
        if not isinstance(e, dict):
            continue
        events.append(SessionEvent(**e))

    return SessionDetail(
        id=session_id,
        title=str(meta.get("title") or session_id),
        created_at=str(meta.get("created_at") or ""),
        event_count=int(meta.get("event_count") or len(events)),
        last_event_at=(str(meta.get("last_event_at")) if meta.get("last_event_at") else None),
        events=events,
    )


def add_session_event(session_id: str, req: SessionAddEventRequest) -> SessionEvent:
    ds_dir = _session_dir(session_id)
    meta_path = ds_dir / "session.json"

    meta = _read_json(meta_path)

    events = meta.get("events")
    if not isinstance(events, list):
        events = []
        meta["events"] = events

    now = datetime.now(tz=UTC).isoformat()
    event = SessionEvent(
        id=str(uuid.uuid4()),
        created_at=now,
        type=(req.type or "note").strip() or "note",
        message=(req.message.strip() if isinstance(req.message, str) else req.message),
        payload=req.payload,
    )

    events.append(event.model_dump())
    meta["event_count"] = int(meta.get("event_count") or 0) + 1
    meta["last_event_at"] = now

    _write_json(meta_path, meta)

    return event
