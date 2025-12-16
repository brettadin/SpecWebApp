from __future__ import annotations

import io
from dataclasses import dataclass


@dataclass(frozen=True)
class FitsTableCandidate:
    hdu_index: int
    hdu_name: str
    columns: list[str]


_X_NAME_HINTS = (
    "wavelength",
    "wave",
    "lambda",
    "lam",
    "frequency",
    "freq",
    "wavenumber",
    "wnum",
    "nu",
)

_Y_NAME_HINTS = (
    "flux",
    "flx",
    "fnu",
    "f_lambda",
    "f_lam",
    "spec",
    "sci",
    "counts",
    "intensity",
)


def _score_name(name: str, hints: tuple[str, ...]) -> int:
    n = name.strip().lower()
    score = 0
    for h in hints:
        if h in n:
            score += 10
    return score


def _is_numeric_dtype(dtype) -> bool:
    try:
        return getattr(dtype, "kind", "") in ("i", "u", "f")
    except Exception:
        return False


def list_table_candidates(raw: bytes) -> list[FitsTableCandidate]:
    from astropy.io import fits

    hdus = fits.open(io.BytesIO(raw), memmap=False)
    out: list[FitsTableCandidate] = []
    try:
        for i, hdu in enumerate(hdus):
            if not hasattr(hdu, "columns") or hdu.columns is None:
                continue
            cols = [c.name for c in hdu.columns]
            out.append(FitsTableCandidate(hdu_index=i, hdu_name=str(hdu.name), columns=cols))
    finally:
        hdus.close()
    return out


def suggest_xy_columns(raw: bytes, hdu_index: int) -> tuple[int | None, int | None]:
    from astropy.io import fits

    hdus = fits.open(io.BytesIO(raw), memmap=False)
    try:
        hdu = hdus[hdu_index]
        if not hasattr(hdu, "data") or hdu.data is None:
            return None, None

        cols = list(getattr(hdu, "columns", []) or [])
        if not cols:
            return None, None

        best_x = (None, -1)
        best_y = (None, -1)
        for idx, col in enumerate(cols):
            if not _is_numeric_dtype(col.dtype):
                continue
            x_score = _score_name(col.name, _X_NAME_HINTS)
            y_score = _score_name(col.name, _Y_NAME_HINTS)
            if x_score > best_x[1]:
                best_x = (idx, x_score)
            if y_score > best_y[1]:
                best_y = (idx, y_score)

        x_idx = best_x[0] if best_x[1] > 0 else None
        y_idx = best_y[0] if best_y[1] > 0 else None

        # Fallback: first two numeric columns
        if x_idx is None or y_idx is None or x_idx == y_idx:
            numeric = [i for i, c in enumerate(cols) if _is_numeric_dtype(c.dtype)]
            if len(numeric) >= 2:
                x_idx = numeric[0]
                y_idx = numeric[1]

        return x_idx, y_idx
    finally:
        hdus.close()


def extract_xy(
    raw: bytes, hdu_index: int, x_col_index: int, y_col_index: int
) -> tuple[list[float], list[float], dict]:
    from astropy.io import fits

    hdus = fits.open(io.BytesIO(raw), memmap=False)
    try:
        hdu = hdus[hdu_index]
        data = hdu.data
        cols = list(getattr(hdu, "columns", []) or [])
        x_name = cols[x_col_index].name if x_col_index < len(cols) else str(x_col_index)
        y_name = cols[y_col_index].name if y_col_index < len(cols) else str(y_col_index)

        if data is None:
            return [], [], {"hdu_index": hdu_index, "x_col": x_name, "y_col": y_name}

        x_values = data.field(x_col_index)
        y_values = data.field(y_col_index)

        # Handle either vector columns (single-row arrays) or scalar-per-row tables.
        def to_1d_list(v) -> list[float]:
            if hasattr(v, "tolist"):
                v_list = v.tolist()
            else:
                v_list = list(v)
            # Flatten if single row that itself is a list
            if len(v_list) == 1 and isinstance(v_list[0], (list, tuple)):
                v_list = list(v_list[0])
            return [float(x) for x in v_list]

        x = to_1d_list(x_values)
        y = to_1d_list(y_values)

        if len(x) != len(y):
            n = min(len(x), len(y))
            x = x[:n]
            y = y[:n]

        return x, y, {"hdu_index": hdu_index, "x_col": x_name, "y_col": y_name}
    finally:
        hdus.close()
