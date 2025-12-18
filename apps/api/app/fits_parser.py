from __future__ import annotations

import io
from dataclasses import dataclass


@dataclass(frozen=True)
class FitsTableCandidate:
    hdu_index: int
    hdu_name: str
    columns: list[str]


_X_NAME_HINTS = (
    # Time-series (e.g., TESS light curves)
    "time",
    "mjd",
    "jd",
    "bjd",
    "btjd",
    "tjd",
    "tstart",
    "tstop",
    "epoch",
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
    # Common pipeline names
    "pdcsap_flux",
    "sap_flux",
    "pdcsap",
    "sap",
    "rate",
    "counts",
    "flux",
    "flx",
    "fnu",
    "f_lambda",
    "f_lam",
    "spec",
    "sci",
    "intensity",
)

_Y_NAME_BAD_HINTS = (
    # These are almost never the primary Y trace.
    "timecorr",
    "barycorr",
    "corr",
    "quality",
    "flag",
    "status",
    "mask",
)

_ERR_HINTS = (
    "err",
    "error",
    "unc",
    "uncert",
    "sigma",
    "ivar",
    "variance",
)


def _score_name(name: str, hints: tuple[str, ...]) -> int:
    n = name.strip().lower()
    score = 0
    for h in hints:
        if h in n:
            score += 10
    return score


def _is_time_like(name: str) -> bool:
    n = name.strip().lower()
    return any(
        h in n
        for h in (
            "time",
            "mjd",
            "jd",
            "bjd",
            "btjd",
            "tjd",
            "epoch",
            "tstart",
            "tstop",
        )
    )


def _is_error_like(name: str) -> bool:
    n = name.strip().lower()
    return any(h in n for h in _ERR_HINTS)


def _monotonic_kind(values: list[float]) -> str | None:
    """Return monotonicity class allowing equal adjacent values.

    - nondecreasing: x[i] <= x[i+1] for all i
    - nonincreasing: x[i] >= x[i+1] for all i
    - nonmonotonic: otherwise
    """

    if len(values) < 3:
        return None
    nondec = all(values[i] <= values[i + 1] for i in range(len(values) - 1))
    noninc = all(values[i] >= values[i + 1] for i in range(len(values) - 1))
    if nondec:
        return "nondecreasing"
    if noninc:
        return "nonincreasing"
    return "nonmonotonic"


def _is_numeric_dtype(dtype) -> bool:
    try:
        kind = getattr(dtype, "kind", "")
        if kind in ("i", "u", "f"):
            return True

        # FITS vector columns are often numpy subdtypes like ('>f4', (N,)).
        sub = getattr(dtype, "subdtype", None)
        if sub is not None:
            base, _shape = sub
            return getattr(base, "kind", "") in ("i", "u", "f")

        return False
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
        best_y = (None, -10_000)
        for idx, col in enumerate(cols):
            if not _is_numeric_dtype(col.dtype):
                continue
            x_score = _score_name(col.name, _X_NAME_HINTS)
            y_score = _score_name(col.name, _Y_NAME_HINTS)

            # Avoid treating time-like fields as a Y trace.
            if _is_time_like(col.name):
                y_score -= 50

            # Prefer non-error columns for Y.
            if _is_error_like(col.name):
                y_score -= 20

            # De-prioritize bookkeeping-like columns.
            y_score -= _score_name(col.name, _Y_NAME_BAD_HINTS)

            if x_score > best_x[1]:
                best_x = (idx, x_score)
            if y_score > best_y[1]:
                best_y = (idx, y_score)

        x_idx = best_x[0] if best_x[1] > 0 else None
        # Allow y_score == 0 if we can still pick a sane non-time numeric column.
        y_idx = best_y[0] if best_y[0] is not None else None

        def is_good_y(i: int) -> bool:
            if i < 0 or i >= len(cols):
                return False
            name = cols[i].name
            if _is_time_like(name):
                return False
            if _score_name(name, _Y_NAME_BAD_HINTS) > 0:
                return False
            return True

        # Fallbacks:
        # - pick first time-like for X, else first numeric
        # - pick best non-time, non-error, non-quality-ish for Y
        numeric = [i for i, c in enumerate(cols) if _is_numeric_dtype(c.dtype)]
        if x_idx is None and numeric:
            time_like = [i for i in numeric if _is_time_like(cols[i].name)]
            x_idx = time_like[0] if time_like else numeric[0]

        if y_idx is None or y_idx == x_idx or not is_good_y(y_idx):
            # Prefer explicit Y hints if any.
            hinted = [i for i in numeric if _score_name(cols[i].name, _Y_NAME_HINTS) > 0]
            hinted_good = [
                i
                for i in hinted
                if i != x_idx and is_good_y(i) and not _is_error_like(cols[i].name)
            ]
            if hinted_good:
                y_idx = hinted_good[0]
            else:
                # Otherwise pick a numeric column that isn't time-like and isn't error-like.
                candidates = [
                    i
                    for i in numeric
                    if i != x_idx and is_good_y(i) and not _is_error_like(cols[i].name)
                ]
                if candidates:
                    y_idx = candidates[0]
                else:
                    # Last resort: pick any other numeric column.
                    others = [i for i in numeric if i != x_idx]
                    y_idx = others[0] if others else None

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

        def _flatten(v_list) -> list:
            if not v_list:
                return []
            if isinstance(v_list[0], (list, tuple)):
                # Multi-row vector columns (common in some HST products). Concatenate rows.
                out = []
                for row in v_list:
                    if isinstance(row, (list, tuple)):
                        out.extend(list(row))
                    else:
                        out.append(row)
                return out
            return list(v_list)

        def to_1d_list(v) -> tuple[list[float], dict]:
            if hasattr(v, "tolist"):
                v_list = v.tolist()
            else:
                v_list = list(v)

            flattened_rows = 0
            if v_list and isinstance(v_list[0], (list, tuple)):
                flattened_rows = len(v_list)

            flat = _flatten(v_list)
            out: list[float] = []
            non_numeric = 0
            for item in flat:
                try:
                    out.append(float(item))
                except Exception:
                    non_numeric += 1
                    out.append(float("nan"))
            return out, {"flattened_rows": flattened_rows, "non_numeric": non_numeric}

        x, x_meta = to_1d_list(x_values)
        y, y_meta = to_1d_list(y_values)

        if len(x) != len(y):
            n = min(len(x), len(y))
            x = x[:n]
            y = y[:n]

        # Drop non-finite pairs to avoid plot artifacts and downstream math issues.
        paired = [(xi, yi) for xi, yi in zip(x, y, strict=False) if xi == xi and yi == yi]
        # (xi==xi) is a fast NaN check; also guard inf/-inf.
        paired = [
            (xi, yi) for xi, yi in paired if abs(xi) != float("inf") and abs(yi) != float("inf")
        ]

        dropped = len(x) - len(paired)
        x_out = [p[0] for p in paired]
        y_out = [p[1] for p in paired]

        # Canonicalize order:
        # - reverse non-increasing axes
        # - stable sort non-monotonic axes
        canon = _monotonic_kind(x_out)
        canonicalization = "none"
        if canon == "nonincreasing":
            x_out.reverse()
            y_out.reverse()
            canonicalization = "reversed"
        elif canon == "nonmonotonic":
            order = sorted(range(len(x_out)), key=x_out.__getitem__)
            x_out = [x_out[i] for i in order]
            y_out = [y_out[i] for i in order]
            canonicalization = "sorted"

        return (
            x_out,
            y_out,
            {
                "hdu_index": hdu_index,
                "x_col": x_name,
                "y_col": y_name,
                "x": x_meta,
                "y": y_meta,
                "dropped_nonfinite": dropped,
                "canonicalization": canonicalization,
            },
        )
    finally:
        hdus.close()
