from __future__ import annotations

import csv
import io
import re
from collections.abc import Iterable
from dataclasses import dataclass

from pydantic import BaseModel


class ColumnInfo(BaseModel):
    index: int
    name: str
    is_numeric: bool
    non_numeric_count: int


class FitsHduCandidate(BaseModel):
    hdu_index: int
    hdu_name: str
    columns: list[str]


class IngestPreviewResponse(BaseModel):
    file_name: str
    file_size_bytes: int
    encoding: str
    parser: str
    delimiter: str
    has_header: bool
    hdu_index: int | None
    fits_hdu_candidates: list[FitsHduCandidate] | None
    x_unit_hint: str | None
    y_unit_hint: str | None
    columns: list[ColumnInfo]
    preview_rows: list[list[str]]
    suggested_x_index: int | None
    suggested_y_index: int | None
    warnings: list[str]
    # Best-effort capture of messy headers / instrument exports.
    source_preamble: list[str] | None = None
    source_metadata: dict[str, str] | None = None


class ParsedDataset(BaseModel):
    # Canonical representation for plotting, derived from raw file.
    name: str
    created_at: str
    source_file_name: str
    sha256: str
    parser: str
    parser_decisions: dict
    x_unit: str | None
    y_unit: str | None
    x: list[float]
    y: list[float]
    x_count: int
    warnings: list[str]
    # Best-effort capture of messy headers / instrument exports.
    source_preamble: list[str] | None = None
    source_metadata: dict[str, str] | None = None


@dataclass(frozen=True)
class _ParseResult:
    delimiter: str
    has_header: bool
    header: list[str]
    rows: list[list[str]]


def _decode_text(raw: bytes) -> tuple[str, str]:
    # Prefer UTF-8 (with BOM support), fall back to latin-1 for "messy" files.
    for encoding in ("utf-8-sig", "utf-8"):
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1"), "latin-1"


def _sniff_csv(sample: str) -> tuple[str, bool]:
    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(sample, delimiters=[",", "\t", ";", "|", " "])
        delimiter = dialect.delimiter
    except csv.Error:
        # Heuristic fallback: choose the most common delimiter among a small set.
        candidates = [",", "\t", ";", "|"]
        counts = {d: sample.count(d) for d in candidates}
        delimiter = max(counts, key=counts.get) if any(counts.values()) else ","

    try:
        has_header = sniffer.has_header(sample)
    except csv.Error:
        has_header = False

    return delimiter, has_header


_SPECTRAL_DATA_MARKER = ">>>>>BEGIN SPECTRAL DATA<<<<<"


def _strip_spectral_data_preamble(text: str) -> str:
    """Best-effort support for instrument exports with a data marker.

    Example: Ocean Optics/OceanView-style TXT files include a header section and a
    '>>>>>Begin Spectral Data<<<<<' marker before the 2-column numeric data.
    """

    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.strip().upper() == _SPECTRAL_DATA_MARKER:
            return "\n".join(lines[i + 1 :]).lstrip("\n")
    return text


_META_KV_RE = re.compile(r"^\s*(?P<key>[^:=]{1,64})\s*[:=]\s*(?P<value>.+?)\s*$")


def _split_spectral_data_marker(text: str) -> tuple[list[str], str]:
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.strip().upper() == _SPECTRAL_DATA_MARKER:
            return lines[:i], "\n".join(lines[i + 1 :]).lstrip("\n")
    return [], text


def _split_leading_comment_preamble(text: str) -> tuple[list[str], str]:
    lines = text.splitlines()
    pre: list[str] = []
    comment_prefixes = ("#", "//", ";", "!")
    idx = 0
    for _idx, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            pre.append(line)
            continue
        if stripped.startswith(comment_prefixes):
            pre.append(line)
            continue
        idx = _idx
        break
    else:
        return pre, ""

    return pre, "\n".join(lines[idx:])


def _extract_metadata_from_preamble(preamble_lines: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in preamble_lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.upper() == _SPECTRAL_DATA_MARKER:
            continue
        m = _META_KV_RE.match(stripped)
        if not m:
            continue
        key = m.group("key").strip()
        val = m.group("value").strip()
        if not key or not val:
            continue
        if key in out:
            # Keep first occurrence to avoid silently overwriting meaningful fields.
            continue
        out[key] = val
    return out


def _extract_text_preamble_and_metadata(text: str) -> tuple[list[str], dict[str, str]]:
    spectral_preamble, after_marker = _split_spectral_data_marker(text)
    comment_preamble, _rest = _split_leading_comment_preamble(after_marker)

    preamble = [*spectral_preamble, *comment_preamble]
    # Avoid huge payloads; keep a small, useful sample.
    preamble_trimmed = preamble[:200]
    meta = _extract_metadata_from_preamble(preamble_trimmed)
    return preamble_trimmed, meta


def _parse_delimited_text(text: str, max_rows: int) -> _ParseResult:
    text = _strip_spectral_data_preamble(text)
    # Skip leading comment/preamble lines (messy files).
    lines = text.splitlines()
    cleaned_lines: list[str] = []
    comment_prefixes = ("#", "//", ";", "!")
    for line in lines:
        stripped = line.strip()
        if not cleaned_lines and (not stripped or stripped.startswith(comment_prefixes)):
            continue
        cleaned_lines.append(line)
    cleaned_text = "\n".join(cleaned_lines)

    sample = cleaned_text[: 64 * 1024]
    delimiter, has_header = _sniff_csv(sample)

    reader = csv.reader(io.StringIO(cleaned_text), delimiter=delimiter)
    rows: list[list[str]] = []
    header: list[str] = []

    for row in reader:
        if not row or all(cell.strip() == "" for cell in row):
            continue

        if has_header and not header:
            header = [c.strip() or f"col_{i + 1}" for i, c in enumerate(row)]
            continue

        rows.append([c.strip() for c in row])
        if len(rows) >= max_rows:
            break

    if not header:
        width = max((len(r) for r in rows), default=0)
        header = [f"col_{i + 1}" for i in range(width)]

    return _ParseResult(delimiter=delimiter, has_header=has_header, header=header, rows=rows)


def _iter_nonempty_rows(reader: Iterable[list[str]]) -> Iterable[list[str]]:
    for row in reader:
        if not row or all(cell.strip() == "" for cell in row):
            continue
        yield row


def _parse_delimited_text_all(text: str) -> _ParseResult:
    text = _strip_spectral_data_preamble(text)
    lines = text.splitlines()
    cleaned_lines: list[str] = []
    comment_prefixes = ("#", "//", ";", "!")
    for line in lines:
        stripped = line.strip()
        if not cleaned_lines and (not stripped or stripped.startswith(comment_prefixes)):
            continue
        cleaned_lines.append(line)
    cleaned_text = "\n".join(cleaned_lines)

    sample = cleaned_text[: 64 * 1024]
    delimiter, has_header = _sniff_csv(sample)

    reader = csv.reader(io.StringIO(cleaned_text), delimiter=delimiter)
    rows: list[list[str]] = []
    header: list[str] = []

    for row in _iter_nonempty_rows(reader):
        if has_header and not header:
            header = [c.strip() or f"col_{i + 1}" for i, c in enumerate(row)]
            continue
        rows.append([c.strip() for c in row])

    if not header:
        width = max((len(r) for r in rows), default=0)
        header = [f"col_{i + 1}" for i in range(width)]

    return _ParseResult(delimiter=delimiter, has_header=has_header, header=header, rows=rows)


def _is_float(value: str) -> bool:
    try:
        float(value)
        return True
    except ValueError:
        return False


def build_ingest_preview(
    *,
    file_name: str,
    raw: bytes,
    max_rows: int = 50,
    hdu_index: int | None = None,
) -> IngestPreviewResponse:
    # Format detection: extension + lightweight sniffing
    file_lower = file_name.lower()
    head = raw[:4096]
    upper_head = head.upper()

    def looks_like_fits_filename(name_lower: str) -> bool:
        return name_lower.endswith(
            (
                ".fits",
                ".fit",
                ".fts",
                ".fits.gz",
                ".fit.gz",
                ".fts.gz",
            )
        )

    fits_payload = raw
    if (
        file_lower.endswith(".gz")
        and looks_like_fits_filename(file_lower)
        and head[:2] == b"\x1f\x8b"
    ):
        import gzip

        try:
            fits_payload = gzip.decompress(raw)
        except Exception as err:
            return IngestPreviewResponse(
                file_name=file_name,
                file_size_bytes=len(raw),
                encoding="binary",
                parser="fits",
                delimiter="",
                has_header=True,
                hdu_index=None,
                fits_hdu_candidates=[],
                x_unit_hint=None,
                y_unit_hint=None,
                columns=[],
                preview_rows=[],
                suggested_x_index=None,
                suggested_y_index=None,
                warnings=[
                    "File looks like gzip-compressed FITS, but preview decompression failed.",
                    f"gzip error: {err}",
                ],
                source_preamble=None,
                source_metadata=None,
            )

    fits_head = fits_payload[:4096]

    if (
        fits_head.startswith(b"SIMPLE  ")
        or fits_head.startswith(b"XTENSION")
        or looks_like_fits_filename(file_lower)
    ):
        from .fits_parser import list_table_candidates, suggest_xy_columns

        warnings: list[str] = []
        try:
            candidates = list_table_candidates(fits_payload)
        except Exception as err:
            return IngestPreviewResponse(
                file_name=file_name,
                file_size_bytes=len(raw),
                encoding="binary",
                parser="fits",
                delimiter="",
                has_header=True,
                hdu_index=None,
                fits_hdu_candidates=[],
                x_unit_hint=None,
                y_unit_hint=None,
                columns=[],
                preview_rows=[],
                suggested_x_index=None,
                suggested_y_index=None,
                warnings=[f"Failed to parse FITS preview: {err}"],
                source_preamble=None,
                source_metadata=None,
            )
        if not candidates:
            return IngestPreviewResponse(
                file_name=file_name,
                file_size_bytes=len(raw),
                encoding="binary",
                parser="fits",
                delimiter="",
                has_header=True,
                hdu_index=None,
                fits_hdu_candidates=[],
                x_unit_hint=None,
                y_unit_hint=None,
                columns=[],
                preview_rows=[],
                suggested_x_index=None,
                suggested_y_index=None,
                warnings=["No FITS table HDUs found for 1D spectra."],
                source_preamble=None,
                source_metadata=None,
            )

        fits_candidates = [
            FitsHduCandidate(hdu_index=c.hdu_index, hdu_name=c.hdu_name, columns=c.columns)
            for c in candidates
        ]

        chosen = None
        if hdu_index is not None:
            for c in candidates:
                if c.hdu_index == hdu_index:
                    chosen = c
                    break
            if chosen is None:
                warnings.append(
                    f"Requested hdu_index={hdu_index} not found; using best-effort choice."
                )

        if chosen is None:
            chosen = candidates[0]
            for c in candidates:
                if "SCI" in c.hdu_name.upper() or c.hdu_name.upper() in ("SPECTRUM", "SPEC"):
                    chosen = c
                    break

        if len(candidates) > 1:
            warnings.append(
                "Multiple FITS table HDUs detected; please confirm which HDU contains the spectrum."
            )

        x_idx, y_idx = suggest_xy_columns(fits_payload, chosen.hdu_index)
        if x_idx is None or y_idx is None:
            warnings.append(
                "Could not confidently infer X/Y columns from FITS; please select manually."
            )

        return IngestPreviewResponse(
            file_name=file_name,
            file_size_bytes=len(raw),
            encoding="binary",
            parser="fits",
            delimiter="",
            has_header=True,
            hdu_index=chosen.hdu_index,
            fits_hdu_candidates=fits_candidates,
            x_unit_hint=None,
            y_unit_hint=None,
            columns=[
                ColumnInfo(index=i, name=n, is_numeric=True, non_numeric_count=0)
                for i, n in enumerate(chosen.columns)
            ],
            preview_rows=[],
            suggested_x_index=x_idx,
            suggested_y_index=y_idx,
            warnings=warnings,
            source_preamble=None,
            source_metadata=None,
        )

    if b"##" in head and (b"JCAMP" in upper_head or b"XYDATA" in upper_head):
        from .jcamp_dx import parse_jcamp_dx

        text, encoding = _decode_text(raw)
        parsed_jc = parse_jcamp_dx(text)

        preview_rows: list[list[str]] = []
        for i in range(min(max_rows, len(parsed_jc.x))):
            preview_rows.append([str(parsed_jc.x[i]), str(parsed_jc.y[i])])

        return IngestPreviewResponse(
            file_name=file_name,
            file_size_bytes=len(raw),
            encoding=encoding,
            parser="jcamp-dx",
            delimiter="",
            has_header=True,
            hdu_index=None,
            fits_hdu_candidates=None,
            x_unit_hint=parsed_jc.x_unit,
            y_unit_hint=parsed_jc.y_unit,
            columns=[
                ColumnInfo(index=0, name="x", is_numeric=True, non_numeric_count=0),
                ColumnInfo(index=1, name="y", is_numeric=True, non_numeric_count=0),
            ],
            preview_rows=preview_rows,
            suggested_x_index=0,
            suggested_y_index=1,
            warnings=parsed_jc.warnings,
            source_preamble=None,
            source_metadata=parsed_jc.header,
        )

    warnings: list[str] = []
    text, encoding = _decode_text(raw)
    preamble_lines, preamble_meta = _extract_text_preamble_and_metadata(text)
    parsed = _parse_delimited_text(text, max_rows=max_rows)

    if not parsed.rows:
        warnings.append("No data rows parsed (file may be empty or non-tabular).")

    width = max((len(r) for r in parsed.rows), default=len(parsed.header))

    def cell_at(row: list[str], index: int) -> str:
        if index < len(row):
            return row[index]
        return ""

    columns: list[ColumnInfo] = []
    numeric_indices: list[int] = []

    for i in range(width):
        non_numeric = 0
        seen_any = False
        for row in parsed.rows:
            value = cell_at(row, i)
            if value == "":
                continue
            seen_any = True
            if not _is_float(value):
                non_numeric += 1

        is_numeric = seen_any and non_numeric == 0
        if is_numeric:
            numeric_indices.append(i)

        name = parsed.header[i] if i < len(parsed.header) else f"col_{i + 1}"
        columns.append(
            ColumnInfo(index=i, name=name, is_numeric=is_numeric, non_numeric_count=non_numeric)
        )

    suggested_x_index: int | None = None
    suggested_y_index: int | None = None

    if len(numeric_indices) >= 2:
        suggested_x_index = numeric_indices[0]
        suggested_y_index = numeric_indices[1]
        if len(numeric_indices) > 2:
            warnings.append(
                "Multiple numeric columns detected; please confirm X/Y columns before ingest."
            )
    elif len(numeric_indices) == 1:
        warnings.append(
            "Only one fully-numeric column detected in preview; "
            "file may be messy or require manual mapping."
        )
    else:
        warnings.append(
            "No fully-numeric columns detected in preview; "
            "file may be non-tabular or include units/headers in data rows."
        )

    preview_rows: list[list[str]] = []
    for row in parsed.rows:
        preview_rows.append([cell_at(row, i) for i in range(width)])

    x_unit_hint = None
    y_unit_hint = None

    def extract_unit(header_cell: str) -> str | None:
        m = re.search(r"\(([^)]+)\)|\[([^\]]+)\]", header_cell)
        if not m:
            return None
        unit = (m.group(1) or m.group(2) or "").strip()
        return unit or None

    if suggested_x_index is not None and suggested_x_index < len(parsed.header):
        x_unit_hint = extract_unit(parsed.header[suggested_x_index])
    if suggested_y_index is not None and suggested_y_index < len(parsed.header):
        y_unit_hint = extract_unit(parsed.header[suggested_y_index])

    return IngestPreviewResponse(
        file_name=file_name,
        file_size_bytes=len(raw),
        encoding=encoding,
        parser="delimited-text",
        delimiter=parsed.delimiter,
        has_header=parsed.has_header,
        hdu_index=None,
        fits_hdu_candidates=None,
        x_unit_hint=x_unit_hint,
        y_unit_hint=y_unit_hint,
        columns=columns,
        preview_rows=preview_rows,
        suggested_x_index=suggested_x_index,
        suggested_y_index=suggested_y_index,
        warnings=warnings,
        source_preamble=preamble_lines or None,
        source_metadata=preamble_meta or None,
    )


def _monotonic_direction(values: list[float]) -> str | None:
    if len(values) < 3:
        return None
    inc = all(values[i] < values[i + 1] for i in range(len(values) - 1))
    dec = all(values[i] > values[i + 1] for i in range(len(values) - 1))
    if inc:
        return "increasing"
    if dec:
        return "decreasing"
    return "non-monotonic"


def parse_delimited_xy(
    *,
    file_name: str,
    raw: bytes,
    x_index: int,
    y_index: int,
    name: str,
    created_at: str,
    sha256: str,
    x_unit: str | None,
    y_unit: str | None,
) -> ParsedDataset:
    warnings: list[str] = []

    text, encoding = _decode_text(raw)
    preamble_lines, preamble_meta = _extract_text_preamble_and_metadata(text)
    parsed = _parse_delimited_text_all(text)

    def cell_at(row: list[str], index: int) -> str:
        return row[index] if index < len(row) else ""

    x: list[float] = []
    y: list[float] = []

    for row in parsed.rows:
        xs = cell_at(row, x_index)
        ys = cell_at(row, y_index)
        if xs == "" or ys == "":
            continue
        if not _is_float(xs) or not _is_float(ys):
            continue
        x.append(float(xs))
        y.append(float(ys))

    if not x:
        warnings.append("No numeric X/Y pairs parsed with the selected column mapping.")

    direction = _monotonic_direction(x)
    if direction == "decreasing":
        # Safe: preserves raw values, just reverses order for plotting/tooling.
        x.reverse()
        y.reverse()
        warnings.append("X axis was strictly decreasing; reversed order for canonical plotting.")
    elif direction == "non-monotonic":
        warnings.append("X axis is non-monotonic; downstream tools may require monotonic X.")

    if not x_unit:
        warnings.append("X unit is missing; please confirm units for trustworthy comparisons.")
    if not y_unit:
        warnings.append("Y unit is missing; please confirm units for trustworthy comparisons.")

    return ParsedDataset(
        name=name,
        created_at=created_at,
        source_file_name=file_name,
        sha256=sha256,
        parser="delimited-text",
        parser_decisions={
            "encoding": encoding,
            "delimiter": parsed.delimiter,
            "has_header": parsed.has_header,
            "x_index": x_index,
            "y_index": y_index,
        },
        x_unit=x_unit,
        y_unit=y_unit,
        x=x,
        y=y,
        x_count=len(x),
        warnings=warnings,
        source_preamble=preamble_lines or None,
        source_metadata=preamble_meta or None,
    )
