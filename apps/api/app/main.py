from __future__ import annotations

import os
from datetime import UTC, datetime

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .datasets import (
    DatasetDetail,
    DatasetSummary,
    IngestCommitResponse,
    get_dataset_detail,
    get_dataset_xy,
    list_datasets,
    save_dataset,
    sha256_bytes,
)
from .ingest_preview import IngestPreviewResponse, build_ingest_preview, parse_delimited_xy
from .version import read_version

app = FastAPI(title="Spectra App API", version=read_version().get("version", "0.0.0"))

FILE_REQUIRED = File(...)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": read_version()}


@app.post("/ingest/preview", response_model=IngestPreviewResponse)
async def ingest_preview(
    file: UploadFile = FILE_REQUIRED, max_rows: int = 50, hdu_index: int | None = None
) -> IngestPreviewResponse:
    # CAP-01: preview and resolve uncertainty before creating a dataset.
    # This endpoint does not normalize or otherwise transform data.
    raw = await file.read(5 * 1024 * 1024)
    return build_ingest_preview(
        file_name=file.filename or "upload", raw=raw, max_rows=max_rows, hdu_index=hdu_index
    )


@app.post("/ingest/commit", response_model=IngestCommitResponse)
async def ingest_commit(
    file: UploadFile = FILE_REQUIRED,
    name: str = Form(""),
    x_index: int | None = Form(None),
    y_index: int | None = Form(None),
    hdu_index: int | None = Form(None),
    x_unit: str = Form(""),
    y_unit: str = Form(""),
) -> IngestCommitResponse:
    source_name = file.filename or "upload"

    raw = await file.read(50 * 1024 * 1024)
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    created_at = datetime.now(tz=UTC).isoformat()
    sha = sha256_bytes(raw)

    dataset_name = name.strip() or source_name
    ext = os.path.splitext(source_name.lower())[1]

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

    if ext in (".fits", ".fit"):
        from .fits_parser import extract_xy
        from .ingest_preview import ParsedDataset

        if hdu_index is None:
            raise HTTPException(
                status_code=400,
                detail="Missing hdu_index for FITS ingest; call /ingest/preview first.",
            )
        if x_index is None or y_index is None:
            raise HTTPException(
                status_code=400,
                detail="Missing x_index/y_index for FITS ingest; call /ingest/preview first.",
            )

        x, y, decisions = extract_xy(
            raw, hdu_index=hdu_index, x_col_index=x_index, y_col_index=y_index
        )
        warnings: list[str] = []
        direction = monotonic_direction(x)
        if direction == "decreasing":
            x.reverse()
            y.reverse()
            warnings.append(
                "X axis was strictly decreasing; reversed order for canonical plotting."
            )
        elif direction == "non-monotonic":
            warnings.append("X axis is non-monotonic; downstream tools may require monotonic X.")
        if not x_unit.strip():
            warnings.append("X unit is missing; please confirm units for trustworthy comparisons.")
        if not y_unit.strip():
            warnings.append("Y unit is missing; please confirm units for trustworthy comparisons.")

        parsed = ParsedDataset(
            name=dataset_name,
            created_at=created_at,
            source_file_name=source_name,
            sha256=sha,
            parser="fits",
            parser_decisions=decisions,
            x_unit=x_unit.strip() or None,
            y_unit=y_unit.strip() or None,
            x=x,
            y=y,
            x_count=len(x),
            warnings=warnings,
        )
    elif ext in (".jdx", ".dx", ".jcamp"):
        from .ingest_preview import ParsedDataset
        from .jcamp_dx import parse_jcamp_dx

        # Prefer UTF-8 (with BOM support), fall back to latin-1 for "messy" files.
        for enc in ("utf-8-sig", "utf-8"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                text = ""
        else:
            text = raw.decode("latin-1")
        parsed_jc = parse_jcamp_dx(text)

        warnings = list(parsed_jc.warnings)
        direction = monotonic_direction(parsed_jc.x)
        x = list(parsed_jc.x)
        y = list(parsed_jc.y)
        if direction == "decreasing":
            x.reverse()
            y.reverse()
            warnings.append(
                "X axis was strictly decreasing; reversed order for canonical plotting."
            )
        elif direction == "non-monotonic":
            warnings.append("X axis is non-monotonic; downstream tools may require monotonic X.")

        final_x_unit = x_unit.strip() or parsed_jc.x_unit
        final_y_unit = y_unit.strip() or parsed_jc.y_unit
        if not final_x_unit:
            warnings.append("X unit is missing; please confirm units for trustworthy comparisons.")
        if not final_y_unit:
            warnings.append("Y unit is missing; please confirm units for trustworthy comparisons.")

        parsed = ParsedDataset(
            name=dataset_name,
            created_at=created_at,
            source_file_name=source_name,
            sha256=sha,
            parser="jcamp-dx",
            parser_decisions={"header": parsed_jc.header},
            x_unit=final_x_unit,
            y_unit=final_y_unit,
            x=x,
            y=y,
            x_count=len(x),
            warnings=warnings,
        )
    else:
        if x_index is None or y_index is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Missing x_index/y_index for delimited-text ingest; call /ingest/preview first."
                ),
            )

        parsed = parse_delimited_xy(
            file_name=source_name,
            raw=raw,
            x_index=x_index,
            y_index=y_index,
            name=dataset_name,
            created_at=created_at,
            sha256=sha,
            x_unit=x_unit.strip() or None,
            y_unit=y_unit.strip() or None,
        )

    detail = save_dataset(
        name=dataset_name,
        source_file_name=source_name,
        raw=raw,
        parsed=parsed.model_dump(),
    )

    return IngestCommitResponse(dataset=detail)


@app.get("/datasets", response_model=list[DatasetSummary])
def datasets_list() -> list[DatasetSummary]:
    return list_datasets()


@app.get("/datasets/{dataset_id}", response_model=DatasetDetail)
def datasets_get(dataset_id: str) -> DatasetDetail:
    return get_dataset_detail(dataset_id)


@app.get("/datasets/{dataset_id}/data")
def datasets_get_data(dataset_id: str) -> dict:
    return get_dataset_xy(dataset_id)
