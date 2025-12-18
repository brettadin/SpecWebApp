from __future__ import annotations

import io

import numpy as np
from astropy.io import fits

from app.fits_parser import extract_xy, suggest_xy_columns


def _make_tess_like_fits() -> bytes:
    # Minimal TESS-like lightcurve table: TIME, TIMECORR, SAP_FLUX, PDCSAP_FLUX, QUALITY
    cols = [
        fits.Column(
            name="TIME",
            format="D",
            array=np.array([0.0, 0.5, 1.0, 1.0, 2.0], dtype=float),
        ),
        fits.Column(
            name="TIMECORR",
            format="D",
            array=np.array([0.001, 0.001, 0.001, 0.001, 0.001], dtype=float),
        ),
        fits.Column(
            name="SAP_FLUX",
            format="E",
            array=np.array([10.0, 11.0, 9.0, 10.5, 12.0], dtype=float),
        ),
        fits.Column(
            name="PDCSAP_FLUX",
            format="E",
            array=np.array([10.2, 11.1, 9.1, 10.6, 12.1], dtype=float),
        ),
        fits.Column(name="QUALITY", format="J", array=np.array([0, 0, 0, 0, 0], dtype=int)),
    ]
    hdu = fits.BinTableHDU.from_columns(cols, name="LIGHTCURVE")
    hdul = fits.HDUList([fits.PrimaryHDU(), hdu])
    buf = io.BytesIO()
    hdul.writeto(buf, overwrite=True)
    return buf.getvalue()


def test_suggest_xy_prefers_time_and_flux_over_timecorr() -> None:
    raw = _make_tess_like_fits()
    x_idx, y_idx = suggest_xy_columns(raw, hdu_index=1)

    assert x_idx is not None
    assert y_idx is not None

    # TIME should be X (index 0)
    assert x_idx == 0

    # Y should be a flux-like column, not TIMECORR or QUALITY
    assert y_idx in (2, 3)


def test_extract_xy_filters_nonfinite_and_sorts_nonmonotonic() -> None:
    # Build a table where TIME is non-monotonic and contains NaNs.
    cols = [
        fits.Column(
            name="TIME",
            format="D",
            array=np.array([0.0, float("nan"), 2.0, 1.0], dtype=float),
        ),
        fits.Column(
            name="SAP_FLUX",
            format="E",
            array=np.array([10.0, 11.0, float("inf"), 9.0], dtype=float),
        ),
    ]
    hdu = fits.BinTableHDU.from_columns(cols, name="LIGHTCURVE")
    hdul = fits.HDUList([fits.PrimaryHDU(), hdu])
    buf = io.BytesIO()
    hdul.writeto(buf, overwrite=True)
    raw = buf.getvalue()

    x, y, decisions = extract_xy(raw, hdu_index=1, x_col_index=0, y_col_index=1)

    # Non-finite pairs are dropped: (nan,11) and (2,inf)
    assert x == [0.0, 1.0]
    assert y == [10.0, 9.0]
    assert decisions.get("dropped_nonfinite") == 2
    assert decisions.get("canonicalization") in ("sorted", "none")
