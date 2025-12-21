from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field

from .datasets import datasets_root, get_dataset_detail


class AnnotationBase(BaseModel):
    type: str
    text: str
    tags: list[str] = Field(default_factory=list)
    link: str | None = None
    style: str | None = None
    author_user_id: str = "local/anonymous"
    created_at: str
    updated_at: str

    x_unit: str | None = None
    y_unit: str | None = None

    # Coordinates are stored in dataset-native units.
    x0: float | None = None
    x1: float | None = None
    y0: float | None = None
    y1: float | None = None


class Annotation(AnnotationBase):
    annotation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dataset_id: str


class AnnotationCreatePoint(BaseModel):
    text: str
    tags: list[str] = Field(default_factory=list)
    link: str | None = None
    style: str | None = None
    x: float
    y: float | None = None


class AnnotationCreateRangeX(BaseModel):
    text: str
    tags: list[str] = Field(default_factory=list)
    link: str | None = None
    style: str | None = None
    x0: float
    x1: float


class AnnotationCreateRangeY(BaseModel):
    text: str
    tags: list[str] = Field(default_factory=list)
    link: str | None = None
    style: str | None = None
    y0: float
    y1: float


class AnnotationUpdate(BaseModel):
    text: str | None = None
    tags: list[str] | None = None
    link: str | None = None
    style: str | None = None
    x0: float | None = None
    x1: float | None = None
    y0: float | None = None
    y1: float | None = None


def _normalize_tags(tags: list[str] | None) -> list[str]:
    if not tags:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for t in tags:
        s = str(t).strip()
        if not s:
            continue
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def _normalize_link(link: str | None) -> str | None:
    if link is None:
        return None
    s = str(link).strip()
    return s or None


def _normalize_style(style: str | None) -> str | None:
    if style is None:
        return None
    s = str(style).strip()
    return s or None


def _annotations_path(dataset_id: str) -> Path:
    return datasets_root() / dataset_id / "annotations.json"


def _load_annotations(dataset_id: str) -> list[Annotation]:
    path = _annotations_path(dataset_id)
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        return []
    out: list[Annotation] = []
    for item in raw:
        try:
            out.append(Annotation.model_validate(item))
        except Exception:
            continue
    return out


def _write_annotations(dataset_id: str, annotations: list[Annotation]) -> None:
    path = _annotations_path(dataset_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = [a.model_dump() for a in annotations]
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def list_annotations(dataset_id: str) -> list[Annotation]:
    # Ensure dataset exists.
    _ = get_dataset_detail(dataset_id)
    return _load_annotations(dataset_id)


def create_point_note(dataset_id: str, req: AnnotationCreatePoint) -> Annotation:
    detail = get_dataset_detail(dataset_id)

    now = datetime.now(tz=UTC).isoformat()
    ann = Annotation(
        dataset_id=dataset_id,
        type="point",
        text=req.text,
        tags=_normalize_tags(req.tags),
        link=_normalize_link(req.link),
        style=_normalize_style(req.style),
        created_at=now,
        updated_at=now,
        x_unit=detail.x_unit,
        y_unit=detail.y_unit,
        x0=float(req.x),
        y0=float(req.y) if req.y is not None else None,
    )

    annotations = _load_annotations(dataset_id)
    annotations.append(ann)
    _write_annotations(dataset_id, annotations)
    return ann


def create_range_x(dataset_id: str, req: AnnotationCreateRangeX) -> Annotation:
    detail = get_dataset_detail(dataset_id)

    x0 = float(req.x0)
    x1 = float(req.x1)
    if x1 < x0:
        x0, x1 = x1, x0

    now = datetime.now(tz=UTC).isoformat()
    ann = Annotation(
        dataset_id=dataset_id,
        type="range_x",
        text=req.text,
        tags=_normalize_tags(req.tags),
        link=_normalize_link(req.link),
        style=_normalize_style(req.style),
        created_at=now,
        updated_at=now,
        x_unit=detail.x_unit,
        y_unit=detail.y_unit,
        x0=x0,
        x1=x1,
    )

    annotations = _load_annotations(dataset_id)
    annotations.append(ann)
    _write_annotations(dataset_id, annotations)
    return ann


def create_range_y(dataset_id: str, req: AnnotationCreateRangeY) -> Annotation:
    detail = get_dataset_detail(dataset_id)

    y0 = float(req.y0)
    y1 = float(req.y1)
    if y1 < y0:
        y0, y1 = y1, y0

    now = datetime.now(tz=UTC).isoformat()
    ann = Annotation(
        dataset_id=dataset_id,
        type="range_y",
        text=req.text,
        tags=_normalize_tags(req.tags),
        link=_normalize_link(req.link),
        style=_normalize_style(req.style),
        created_at=now,
        updated_at=now,
        x_unit=detail.x_unit,
        y_unit=detail.y_unit,
        y0=y0,
        y1=y1,
    )

    annotations = _load_annotations(dataset_id)
    annotations.append(ann)
    _write_annotations(dataset_id, annotations)
    return ann


def update_annotation(dataset_id: str, annotation_id: str, req: AnnotationUpdate) -> Annotation:
    annotations = _load_annotations(dataset_id)
    for idx, ann in enumerate(annotations):
        if ann.annotation_id != annotation_id:
            continue

        changed = ann.model_copy(deep=True)
        if req.text is not None:
            changed.text = req.text
        if req.tags is not None:
            changed.tags = _normalize_tags(req.tags)
        if req.link is not None:
            changed.link = _normalize_link(req.link)
        if req.style is not None:
            changed.style = _normalize_style(req.style)
        if req.x0 is not None:
            changed.x0 = float(req.x0)
        if req.x1 is not None:
            changed.x1 = float(req.x1)
        if req.y0 is not None:
            changed.y0 = float(req.y0)
        if req.y1 is not None:
            changed.y1 = float(req.y1)

        # Keep range ordering invariant.
        if changed.type == "range_x" and changed.x0 is not None and changed.x1 is not None:
            if changed.x1 < changed.x0:
                changed.x0, changed.x1 = changed.x1, changed.x0

        if changed.type == "range_y" and changed.y0 is not None and changed.y1 is not None:
            if changed.y1 < changed.y0:
                changed.y0, changed.y1 = changed.y1, changed.y0

        changed.updated_at = datetime.now(tz=UTC).isoformat()

        annotations[idx] = changed
        _write_annotations(dataset_id, annotations)
        return changed

    raise FileNotFoundError("Annotation not found")


def delete_annotation(dataset_id: str, annotation_id: str) -> None:
    annotations = _load_annotations(dataset_id)
    kept = [a for a in annotations if a.annotation_id != annotation_id]
    _write_annotations(dataset_id, kept)
