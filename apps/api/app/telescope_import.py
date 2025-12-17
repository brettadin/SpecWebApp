from __future__ import annotations

import os
import urllib.request
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, HttpUrl

from .datasets import DatasetDetail, save_dataset, sha256_bytes
from .fits_parser import extract_xy, list_table_candidates, suggest_xy_columns
from .ingest_preview import ParsedDataset
from .mast_client import mast_cache_info, mast_download_file_with_cache_info

TelescopeMission = Literal["JWST", "HST", "HLSP", "Other"]


def _guess_filename_from_url(url: str) -> str:
    try:
        path = urllib.request.urlparse(url).path
        name = os.path.basename(path)
        return name or "telescope.fits"
    except Exception:
        return "telescope.fits"


def _default_restrictive_sharing_policy() -> dict:
    return {
        "private_ok": True,
        "group_share_ok": False,
        "public_share_ok": False,
        "export_raw_ok": False,
        "reason": "CAP-08 default private (archive imports)",
    }


class TelescopeFITSPreviewCandidate(BaseModel):
    hdu_index: int
    hdu_name: str
    columns: list[str]
    suggested_x_index: int | None
    suggested_y_index: int | None


class TelescopeFITSPreviewResponse(BaseModel):
    file_name: str
    file_size_bytes: int
    sha256: str
    fits_hdu_candidates: list[TelescopeFITSPreviewCandidate]
    warnings: list[str]
    cache: dict | None = None


class TelescopeFITSPreviewRequest(BaseModel):
    source_url: HttpUrl
    mission: TelescopeMission = "Other"
    source_name: str = "MAST"
    citation_text: str
    trust_tier: str = "Primary/Authoritative"
    retrieved_at: str | None = None
    query: dict = {}


class TelescopeFITSImportRequest(TelescopeFITSPreviewRequest):
    title: str
    hdu_index: int
    x_index: int
    y_index: int
    x_unit: str | None = None
    y_unit: str | None = None


class TelescopeFITSPreviewByDataURIRequest(BaseModel):
    data_uri: str
    product_filename: str | None = None
    mission: TelescopeMission = "Other"
    refresh: bool = False
    source_name: str = "MAST"
    citation_text: str
    trust_tier: str = "Primary/Authoritative"
    retrieved_at: str | None = None
    query: dict = {}


class TelescopeFITSImportByDataURIRequest(TelescopeFITSPreviewByDataURIRequest):
    title: str
    hdu_index: int
    x_index: int
    y_index: int
    x_unit: str | None = None
    y_unit: str | None = None


def _preview_fits_payload(
    *, raw: bytes, file_name: str, citation_text: str
) -> TelescopeFITSPreviewResponse:
    if not raw:
        raise ValueError("Empty FITS payload")

    sha = sha256_bytes(raw)
    warnings: list[str] = []
    if not citation_text.strip():
        warnings.append("Missing citation_text; CAP-08 requires citation-first imports.")

    candidates = list_table_candidates(raw)
    preview_candidates: list[TelescopeFITSPreviewCandidate] = []
    for c in candidates:
        sx, sy = suggest_xy_columns(raw, c.hdu_index)
        preview_candidates.append(
            TelescopeFITSPreviewCandidate(
                hdu_index=c.hdu_index,
                hdu_name=c.hdu_name,
                columns=c.columns,
                suggested_x_index=sx,
                suggested_y_index=sy,
            )
        )

    if not preview_candidates:
        warnings.append("No FITS table HDUs found; cannot extract a 1D spectrum from tables.")

    return TelescopeFITSPreviewResponse(
        file_name=file_name,
        file_size_bytes=len(raw),
        sha256=sha,
        fits_hdu_candidates=preview_candidates,
        warnings=warnings,
    )


def _reference_block(
    *,
    sha256: str,
    mission: TelescopeMission,
    source_name: str,
    source_locator: str,
    retrieved_at: str,
    trust_tier: str,
    citation_text: str,
    query: dict,
) -> dict:
    return {
        "source_type": "archive",
        "data_type": "Spectrum",
        "trust_tier": trust_tier,
        "source_name": source_name.strip() or "MAST",
        "source_url": source_locator,
        "retrieved_at": retrieved_at,
        "citation_text": citation_text.strip(),
        "query": query,
        "license": {"redistribution_allowed": "unknown"},
        "sharing_policy": _default_restrictive_sharing_policy(),
        "raw_sha256": sha256,
        "mission": mission,
    }


def _import_fits_payload(
    *,
    raw: bytes,
    file_name: str,
    title: str,
    mission: TelescopeMission,
    source_name: str,
    source_locator: str,
    retrieved_at: str,
    trust_tier: str,
    citation_text: str,
    query: dict,
    hdu_index: int,
    x_index: int,
    y_index: int,
    x_unit: str | None,
    y_unit: str | None,
) -> DatasetDetail:
    if not raw:
        raise ValueError("Empty FITS payload")

    sha = sha256_bytes(raw)

    x, y, decisions = extract_xy(raw, hdu_index, x_index, y_index)

    warnings: list[str] = []
    if not citation_text.strip():
        warnings.append("Missing citation_text; CAP-08 requires citation-first imports.")

    def monotonic_direction(values: list[float]) -> str | None:
        if len(values) < 3:
            return None
        inc = all(values[i] < values[i + 1] for i in range(len(values) - 1))
        dec = all(values[i] > values[i + 1] for i in range(len(values) - 1))
        if inc:
            return "increasing"
        if dec:
            return "decreasing"
        return "non-monotonic"

    direction = monotonic_direction(x)
    if direction == "decreasing":
        x.reverse()
        y.reverse()
        warnings.append("X axis was strictly decreasing; reversed order for canonical plotting.")
    elif direction == "non-monotonic":
        warnings.append("X axis is non-monotonic; downstream tools may require monotonic X.")

    final_x_unit = (x_unit or "").strip() or None
    final_y_unit = (y_unit or "").strip() or None
    if not final_x_unit:
        warnings.append("X unit is missing; please confirm units for trustworthy comparisons.")
    if not final_y_unit:
        warnings.append("Y unit is missing; please confirm units for trustworthy comparisons.")

    parsed = ParsedDataset(
        name=title.strip(),
        created_at=retrieved_at,
        source_file_name=file_name,
        sha256=sha,
        parser="telescope-fits",
        parser_decisions={
            **decisions,
            "mission": mission,
            "source_name": source_name.strip(),
            "source_locator": source_locator,
            "retrieved_at": retrieved_at,
        },
        x_unit=final_x_unit,
        y_unit=final_y_unit,
        x=x,
        y=y,
        x_count=len(x),
        warnings=warnings,
    ).model_dump()

    parsed["reference"] = _reference_block(
        sha256=sha,
        mission=mission,
        source_name=source_name,
        source_locator=source_locator,
        retrieved_at=retrieved_at,
        trust_tier=trust_tier,
        citation_text=citation_text,
        query=query,
    )

    return save_dataset(
        name=title.strip(),
        source_file_name=file_name,
        raw=raw,
        parsed=parsed,
    )


def preview_telescope_fits_by_url(req: TelescopeFITSPreviewRequest) -> TelescopeFITSPreviewResponse:
    with urllib.request.urlopen(str(req.source_url), timeout=30) as resp:
        raw = resp.read(200 * 1024 * 1024)

    if not raw:
        raise ValueError("Empty payload fetched from source_url")

    return _preview_fits_payload(
        raw=raw,
        file_name=_guess_filename_from_url(str(req.source_url)),
        citation_text=req.citation_text,
    )


def import_telescope_fits_by_url(req: TelescopeFITSImportRequest) -> DatasetDetail:
    retrieved_at = req.retrieved_at or datetime.now(tz=UTC).isoformat()

    with urllib.request.urlopen(str(req.source_url), timeout=30) as resp:
        raw = resp.read(200 * 1024 * 1024)

    if not raw:
        raise ValueError("Empty payload fetched from source_url")

    return _import_fits_payload(
        raw=raw,
        file_name=_guess_filename_from_url(str(req.source_url)),
        title=req.title,
        mission=req.mission,
        source_name=req.source_name,
        source_locator=str(req.source_url),
        retrieved_at=retrieved_at,
        trust_tier=req.trust_tier,
        citation_text=req.citation_text,
        query=req.query,
        hdu_index=req.hdu_index,
        x_index=req.x_index,
        y_index=req.y_index,
        x_unit=req.x_unit,
        y_unit=req.y_unit,
    )


def preview_telescope_fits_by_mast_data_uri(
    req: TelescopeFITSPreviewByDataURIRequest,
) -> TelescopeFITSPreviewResponse:
    dl = mast_download_file_with_cache_info(req.data_uri, timeout_s=60, refresh=req.refresh)
    file_name = (req.product_filename or "").strip() or "mast-product.fits"
    payload = _preview_fits_payload(
        raw=dl.raw, file_name=file_name, citation_text=req.citation_text
    )
    payload.cache = {
        **(mast_cache_info(req.data_uri) or {}),
        "cache_hit": dl.cache_hit,
        "refresh": req.refresh,
    }
    return payload


def import_telescope_fits_by_mast_data_uri(
    req: TelescopeFITSImportByDataURIRequest,
) -> DatasetDetail:
    dl = mast_download_file_with_cache_info(req.data_uri, timeout_s=60, refresh=req.refresh)
    retrieved_at = req.retrieved_at or dl.downloaded_at
    raw = dl.raw
    file_name = (req.product_filename or "").strip() or "mast-product.fits"
    return _import_fits_payload(
        raw=raw,
        file_name=file_name,
        title=req.title,
        mission=req.mission,
        source_name=req.source_name,
        source_locator=req.data_uri,
        retrieved_at=retrieved_at,
        trust_tier=req.trust_tier,
        citation_text=req.citation_text,
        query=req.query,
        hdu_index=req.hdu_index,
        x_index=req.x_index,
        y_index=req.y_index,
        x_unit=req.x_unit,
        y_unit=req.y_unit,
    )
