from __future__ import annotations

import gzip
import io

import numpy as np
from astropy.io import fits
from fastapi.testclient import TestClient

from app.main import app


def test_ingest_preview_csv_two_numeric_columns() -> None:
    client = TestClient(app)

    csv_bytes = b"wavelength,flux\n1,10\n2,20\n3,30\n"
    res = client.post(
        "/ingest/preview",
        files={"file": ("test.csv", csv_bytes, "text/csv")},
    )

    assert res.status_code == 200
    body = res.json()

    assert body["file_name"] == "test.csv"
    assert body["delimiter"] in [",", ";", "\t", " "]
    assert body["has_header"] is True
    assert body["suggested_x_index"] == 0
    assert body["suggested_y_index"] == 1

    cols = body["columns"]
    assert cols[0]["name"] == "wavelength"
    assert cols[1]["name"] == "flux"
    assert cols[0]["is_numeric"] is True
    assert cols[1]["is_numeric"] is True


def test_ingest_preview_warns_on_ambiguous_columns() -> None:
    client = TestClient(app)

    csv_bytes = b"a,b,c\n1,10,100\n2,20,200\n"
    res = client.post(
        "/ingest/preview",
        files={"file": ("wide.csv", csv_bytes, "text/csv")},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["suggested_x_index"] == 0
    assert body["suggested_y_index"] == 1
    assert any("Multiple numeric columns" in w for w in body["warnings"])


def test_ingest_preview_jcamp_dx_detects_units_and_rows() -> None:
    client = TestClient(app)

    jcamp = """
##TITLE=Test Spectrum
##JCAMP-DX=5.01
##XUNITS=NM
##YUNITS=FLUX
##XYDATA=(XY..XY)
1 10
2 20
3 30
##END=
""".lstrip().encode("utf-8")

    res = client.post(
        "/ingest/preview",
        files={"file": ("test.jdx", jcamp, "text/plain")},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["parser"] == "jcamp-dx"
    assert body["x_unit_hint"] == "NM"
    assert body["y_unit_hint"] == "FLUX"
    assert body["suggested_x_index"] == 0
    assert body["suggested_y_index"] == 1
    assert len(body["preview_rows"]) >= 3


def test_ingest_preview_fits_detects_table_columns() -> None:
    client = TestClient(app)

    wave = np.array([1.0, 2.0, 3.0], dtype=np.float32)
    flux = np.array([10.0, 20.0, 30.0], dtype=np.float32)
    hdu = fits.BinTableHDU.from_columns(
        [
            fits.Column(name="wavelength", array=wave, format="E"),
            fits.Column(name="flux", array=flux, format="E"),
        ],
        name="SPECTRUM",
    )
    hdul = fits.HDUList([fits.PrimaryHDU(), hdu])
    buf = io.BytesIO()
    hdul.writeto(buf)
    fits_bytes = buf.getvalue()

    res = client.post(
        "/ingest/preview",
        files={"file": ("test.fits", fits_bytes, "application/fits")},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["parser"] == "fits"
    assert body["hdu_index"] is not None
    assert body["suggested_x_index"] == 0
    assert body["suggested_y_index"] == 1
    assert [c["name"] for c in body["columns"]] == ["wavelength", "flux"]


def test_ingest_preview_fits_gz_detects_table_columns() -> None:
    client = TestClient(app)

    wave = np.array([1.0, 2.0, 3.0], dtype=np.float32)
    flux = np.array([10.0, 20.0, 30.0], dtype=np.float32)
    hdu = fits.BinTableHDU.from_columns(
        [
            fits.Column(name="wavelength", array=wave, format="E"),
            fits.Column(name="flux", array=flux, format="E"),
        ],
        name="SPECTRUM",
    )
    hdul = fits.HDUList([fits.PrimaryHDU(), hdu])
    buf = io.BytesIO()
    hdul.writeto(buf)
    fits_bytes = buf.getvalue()

    gz_bytes = gzip.compress(fits_bytes)
    res = client.post(
        "/ingest/preview",
        files={"file": ("test.fits.gz", gz_bytes, "application/gzip")},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["parser"] == "fits"
    assert body["hdu_index"] is not None
    assert body["suggested_x_index"] == 0
    assert body["suggested_y_index"] == 1
    assert [c["name"] for c in body["columns"]] == ["wavelength", "flux"]


def test_ingest_preview_ocean_optics_txt_extracts_metadata_and_xy() -> None:
    client = TestClient(app)

    txt = """
Data from example.txt Node

Date: Mon Nov 17 14:18:29 EST 2025
User: brett
Spectrometer: USB4F03499
XAxis mode: Wavelengths
Number of Pixels in Spectrum: 3
>>>>>Begin Spectral Data<<<<<
3.4539E2\t2.364445E0
3.4561E2\t2.364445E0
3.4582E2\t2.364445E0
""".lstrip().encode("utf-8")

    res = client.post(
        "/ingest/preview",
        files={"file": ("ocean.txt", txt, "text/plain")},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["parser"] == "delimited-text"
    assert body["suggested_x_index"] == 0
    assert body["suggested_y_index"] == 1
    assert body.get("source_metadata", {}).get("Spectrometer") == "USB4F03499"
    assert body.get("source_metadata", {}).get("XAxis mode") == "Wavelengths"
    assert len(body["preview_rows"]) >= 2
