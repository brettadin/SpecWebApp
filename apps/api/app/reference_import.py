from __future__ import annotations

import csv
import io
import os
import re
import urllib.parse
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


class ReferenceImportNistASDLineListRequest(BaseModel):
    species: str
    wavelength_min_nm: float
    wavelength_max_nm: float

    # Optional UX sugar; we auto-fill citation/source metadata.
    title: str | None = None

    # Optional overrides (rarely needed, but kept for consistency with other importers)
    x_unit: str | None = "nm"
    y_unit: str | None = None

    # Optional provenance overrides
    retrieved_at: str | None = None
    license: ReferenceLicense = ReferenceLicense()


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
    float_token = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")

    def coerce_float(cell: object) -> float | None:
        raw = str(cell).strip()
        if not raw:
            return None
        if (raw.startswith('"') and raw.endswith('"')) or (
            raw.startswith("'") and raw.endswith("'")
        ):
            raw = raw[1:-1].strip()
        m = float_token.search(raw)
        if not m:
            return None
        try:
            return float(m.group(0))
        except ValueError:
            return None

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
        xv = coerce_float(row[x_index])
        if xv is None:
            continue

        if strength_index is None or strength_index >= len(row):
            yv = 1.0
        else:
            yv = coerce_float(row[strength_index])
            if yv is None:
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


def _parse_nist_asd_tab_delimited(text: str) -> tuple[list[float], list[float]]:
    # NIST ASD tab-delimited output typically includes header names like:
    #   obs_wl_vac(nm), intens
    # but can include many optional columns depending on query.
    rows = list(csv.reader(io.StringIO(text), delimiter="\t"))
    if not rows:
        return [], []

    header = rows[0]
    header_norm = [str(h).strip().lower() for h in header]

    def find_index(pred) -> int | None:
        for i, h in enumerate(header_norm):
            if pred(h):
                return i
        return None

    x_index = find_index(lambda h: "obs_wl" in h and "nm" in h)
    if x_index is None:
        x_index = find_index(lambda h: "obs" in h and "wl" in h)
    if x_index is None:
        x_index = 0

    strength_index = find_index(lambda h: "intens" in h)
    # If intensity is not present, fall back to unit sticks (y=1.0).

    return _parse_line_list_csv(
        text=text,
        delimiter="\t",
        has_header=True,
        x_index=x_index,
        strength_index=strength_index,
    )


def import_reference_nist_asd_line_list(
    req: ReferenceImportNistASDLineListRequest,
) -> DatasetDetail:
    species = req.species.strip()
    if not species:
        raise ValueError("species is required (e.g., 'Fe II')")
    if not (req.wavelength_min_nm < req.wavelength_max_nm):
        raise ValueError("wavelength_min_nm must be < wavelength_max_nm")

    retrieved_at = req.retrieved_at or datetime.now(tz=UTC).isoformat()

    # Build the NIST ASD Lines query URL (no user-provided URL).
    # Source for parameter names: https://physics.nist.gov/PhysRefData/ASD/lines_form.html
    base_url = os.environ.get(
        "NIST_ASD_LINES_URL", "https://physics.nist.gov/cgi-bin/ASD/lines1.pl"
    )

    params = {
        "spectra": species,
        "output_type": "0",  # Wavelength
        "low_w": f"{req.wavelength_min_nm}",
        "upp_w": f"{req.wavelength_max_nm}",
        "unit": "1",  # nm
        "format": "3",  # Tab-delimited
        "output": "0",  # Entirety
        "page_size": "5000",
        "show_av": "3",  # Vacuum (all wavelengths)
        "show_obs_wl": "1",
        "intens_out": "1",
        # NIST requires selecting at least one transition type
        "allowed_out": "1",
        "forbid_out": "1",
    }

    url = f"{base_url}?{urllib.parse.urlencode(params, quote_via=urllib.parse.quote_plus)}"

    with urllib.request.urlopen(url, timeout=20) as resp:
        raw = resp.read(20 * 1024 * 1024)

    if not raw:
        raise ValueError("Empty payload fetched from NIST ASD")

    sha = sha256_bytes(raw)
    text = _decode_text_best_effort(raw)

    # NIST returns HTML with an embedded error message if params are invalid.
    if "Error Message" in text or "<html" in text.lower():
        raise ValueError("NIST ASD returned an error page; please verify the species and range.")

    x, y = _parse_nist_asd_tab_delimited(text)
    if not x:
        raise ValueError("No numeric lines parsed from NIST ASD output.")

    title = (req.title or f"NIST ASD Lines: {species}").strip()
    citation_text = (
        f"NIST Atomic Spectra Database (ASD), Lines query for {species} "
        f"({req.wavelength_min_nm}–{req.wavelength_max_nm} nm), retrieved {retrieved_at}."
    )

    warnings: list[str] = []

    x_unit = (req.x_unit or "nm").strip() or None
    y_unit = (req.y_unit or "").strip() or None
    if not x_unit:
        warnings.append("X unit is missing; please confirm units for trustworthy comparisons.")

    parsed = ParsedDataset(
        name=title,
        created_at=retrieved_at,
        source_file_name="nist-asd:lines1.pl",
        sha256=sha,
        parser="reference-nist-asd-line-list",
        parser_decisions={
            "species": species,
            "wavelength_min_nm": req.wavelength_min_nm,
            "wavelength_max_nm": req.wavelength_max_nm,
            "format": "tab-delimited",
            "x_col": "obs_wl*",
            "strength_col": "intens*",
        },
        x_unit=x_unit,
        y_unit=y_unit,
        x=x,
        y=y,
        x_count=len(x),
        warnings=warnings,
    ).model_dump()

    parsed["reference"] = {
        "source_type": "LineListDB",
        "data_type": "LineList",
        "trust_tier": "Primary/Authoritative",
        "source_name": "NIST ASD",
        "source_url": url,
        "retrieved_at": retrieved_at,
        "citation_text": citation_text,
        "query": {
            "species": species,
            "wavelength_min_nm": req.wavelength_min_nm,
            "wavelength_max_nm": req.wavelength_max_nm,
        },
        "license": req.license.model_dump(),
        "sharing_policy": _sharing_policy(req.license.redistribution_allowed),
        "raw_sha256": sha,
    }

    return save_dataset(
        name=title,
        source_file_name="nist-asd:lines1.pl",
        raw=raw,
        parsed=parsed,
    )
