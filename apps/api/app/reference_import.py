from __future__ import annotations

import csv
import io
import os
import urllib.request
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, HttpUrl

from .datasets import DatasetDetail, save_dataset, sha256_bytes
from .ingest_preview import ParsedDataset
from .jcamp_dx import parse_jcamp_dx

ReferenceSourceType = Literal[
    "Lab",
    "UserUpload",
    "ReferenceDatabase",
    "LineListDB",
    "Modeled/ComputedLibrary",
    "Other",
]

ReferenceDataType = Literal[
    "Spectrum",
    "LineList",
    "BandRanges",
    "CrossSection",
    "KTable",
    "MetaOnly",
]

TrustTier = Literal["Primary/Authoritative", "PeerReviewed/Curated", "Community/Derived", "Unknown"]

RedistributionAllowed = Literal["yes", "no", "unknown"]


class ReferenceLicense(BaseModel):
    license_id: str | None = None
    license_text: str | None = None
    redistribution_allowed: RedistributionAllowed = "unknown"


class ReferenceImportJCAMPRequest(BaseModel):
    title: str
    source_name: str
    source_url: HttpUrl
    citation_text: str
    retrieved_at: str | None = None
    source_type: ReferenceSourceType = "ReferenceDatabase"
    data_type: ReferenceDataType = "Spectrum"
    trust_tier: TrustTier = "Unknown"
    query: dict = {}
    license: ReferenceLicense = ReferenceLicense()

    # Optional overrides (used if source lacks unit metadata)
    x_unit: str | None = None
    y_unit: str | None = None


class ReferenceImportLineListCSVRequest(BaseModel):
    title: str
    source_name: str
    source_url: HttpUrl
    citation_text: str
    retrieved_at: str | None = None
    source_type: ReferenceSourceType = "LineListDB"
    data_type: ReferenceDataType = "LineList"
    trust_tier: TrustTier = "Unknown"
    query: dict = {}
    license: ReferenceLicense = ReferenceLicense()

    x_unit: str | None = None
    y_unit: str | None = None

    delimiter: str = ","
    has_header: bool = True
    x_index: int = 0
    strength_index: int | None = 1


def _guess_filename_from_url(url: str) -> str:
    try:
        path = urllib.request.urlparse(url).path
        name = os.path.basename(path)
        return name or "reference.jdx"
    except Exception:
        return "reference.jdx"


def _sharing_policy(redistribution_allowed: RedistributionAllowed) -> dict:
    if redistribution_allowed == "yes":
        return {
            "private_ok": True,
            "group_share_ok": True,
            "public_share_ok": True,
            "export_raw_ok": True,
            "reason": "redistribution_allowed=yes",
        }
    if redistribution_allowed == "no":
        return {
            "private_ok": True,
            "group_share_ok": False,
            "public_share_ok": False,
            "export_raw_ok": False,
            "reason": "redistribution_allowed=no",
        }
    return {
        "private_ok": True,
        "group_share_ok": False,
        "public_share_ok": False,
        "export_raw_ok": False,
        "reason": "redistribution_allowed=unknown (default restrictive)",
    }


def _decode_text_best_effort(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def import_reference_jcamp_dx(req: ReferenceImportJCAMPRequest) -> DatasetDetail:
    retrieved_at = req.retrieved_at or datetime.now(tz=UTC).isoformat()

    with urllib.request.urlopen(str(req.source_url), timeout=20) as resp:
        raw = resp.read(50 * 1024 * 1024)

    if not raw:
        raise ValueError("Empty payload fetched from source_url")

    sha = sha256_bytes(raw)
    text = _decode_text_best_effort(raw)
    parsed_jc = parse_jcamp_dx(text)

    warnings = list(parsed_jc.warnings)
    if not req.citation_text.strip():
        warnings.append("Missing citation_text; CAP-07 requires citation-first imports.")

    # Units: prefer parsed, allow explicit override.
    x_unit = (req.x_unit or parsed_jc.x_unit or "").strip() or None
    y_unit = (req.y_unit or parsed_jc.y_unit or "").strip() or None
    if not x_unit:
        warnings.append("X unit is missing; please confirm units for trustworthy comparisons.")
    if not y_unit:
        warnings.append("Y unit is missing; please confirm units for trustworthy comparisons.")

    parsed = ParsedDataset(
        name=req.title.strip(),
        created_at=retrieved_at,
        source_file_name=_guess_filename_from_url(str(req.source_url)),
        sha256=sha,
        parser="reference-jcamp-dx",
        parser_decisions={"header": parsed_jc.header},
        x_unit=x_unit,
        y_unit=y_unit,
        x=list(parsed_jc.x),
        y=list(parsed_jc.y),
        x_count=len(parsed_jc.x),
        warnings=warnings,
    ).model_dump()

    parsed["reference"] = {
        "source_type": req.source_type,
        "data_type": req.data_type,
        "trust_tier": req.trust_tier,
        "source_name": req.source_name.strip(),
        "source_url": str(req.source_url),
        "retrieved_at": retrieved_at,
        "citation_text": req.citation_text.strip(),
        "query": req.query,
        "license": req.license.model_dump(),
        "sharing_policy": _sharing_policy(req.license.redistribution_allowed),
        "raw_sha256": sha,
    }

    return save_dataset(
        name=req.title.strip(),
        source_file_name=_guess_filename_from_url(str(req.source_url)),
        raw=raw,
        parsed=parsed,
    )


def _parse_line_list_csv(
    *,
    text: str,
    delimiter: str,
    has_header: bool,
    x_index: int,
    strength_index: int | None,
) -> tuple[list[float], list[float]]:
    if delimiter == "\\t":
        delimiter = "\t"

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = list(reader)
    if has_header and rows:
        rows = rows[1:]

    xs: list[float] = []
    ys: list[float] = []

    for row in rows:
        if not row:
            continue
        if x_index >= len(row):
            continue
        try:
            xv = float(str(row[x_index]).strip())
        except ValueError:
            continue

        if strength_index is None or strength_index >= len(row):
            yv = 1.0
        else:
            try:
                yv = float(str(row[strength_index]).strip())
            except ValueError:
                yv = 1.0

        xs.append(xv)
        ys.append(yv)

    # Sort by X for canonical plotting.
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    xs_sorted = [xs[i] for i in order]
    ys_sorted = [ys[i] for i in order]
    return xs_sorted, ys_sorted


def import_reference_line_list_csv(req: ReferenceImportLineListCSVRequest) -> DatasetDetail:
    retrieved_at = req.retrieved_at or datetime.now(tz=UTC).isoformat()

    with urllib.request.urlopen(str(req.source_url), timeout=20) as resp:
        raw = resp.read(20 * 1024 * 1024)

    if not raw:
        raise ValueError("Empty payload fetched from source_url")

    sha = sha256_bytes(raw)
    text = _decode_text_best_effort(raw)

    x, y = _parse_line_list_csv(
        text=text,
        delimiter=req.delimiter,
        has_header=req.has_header,
        x_index=req.x_index,
        strength_index=req.strength_index,
    )

    if not x:
        raise ValueError("No numeric rows parsed from line list CSV.")

    warnings: list[str] = []
    if not req.citation_text.strip():
        warnings.append("Missing citation_text; CAP-07 requires citation-first imports.")

    x_unit = (req.x_unit or "").strip() or None
    y_unit = (req.y_unit or "").strip() or None
    if not x_unit:
        warnings.append("X unit is missing; please confirm units for trustworthy comparisons.")

    parsed = ParsedDataset(
        name=req.title.strip(),
        created_at=retrieved_at,
        source_file_name=_guess_filename_from_url(str(req.source_url)),
        sha256=sha,
        parser="reference-line-list-csv",
        parser_decisions={
            "delimiter": req.delimiter,
            "has_header": req.has_header,
            "x_index": req.x_index,
            "strength_index": req.strength_index,
        },
        x_unit=x_unit,
        y_unit=y_unit,
        x=x,
        y=y,
        x_count=len(x),
        warnings=warnings,
    ).model_dump()

    parsed["reference"] = {
        "source_type": req.source_type,
        "data_type": req.data_type,
        "trust_tier": req.trust_tier,
        "source_name": req.source_name.strip(),
        "source_url": str(req.source_url),
        "retrieved_at": retrieved_at,
        "citation_text": req.citation_text.strip(),
        "query": req.query,
        "license": req.license.model_dump(),
        "sharing_policy": _sharing_policy(req.license.redistribution_allowed),
        "raw_sha256": sha,
    }

    return save_dataset(
        name=req.title.strip(),
        source_file_name=_guess_filename_from_url(str(req.source_url)),
        raw=raw,
        parsed=parsed,
    )
