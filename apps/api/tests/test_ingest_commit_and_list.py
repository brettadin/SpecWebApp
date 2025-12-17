from __future__ import annotations

import io
import json
import os

import numpy as np
from astropy.io import fits
from fastapi.testclient import TestClient

from app.main import app


def test_ingest_commit_creates_dataset_and_lists(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

    client = TestClient(app)
    csv_bytes = b"x,y\n1,10\n2,20\n3,30\n"

    res = client.post(
        "/ingest/commit",
        files={"file": ("ok.csv", csv_bytes, "text/csv")},
        data={"x_index": "0", "y_index": "1", "x_unit": "nm", "y_unit": "flux"},
    )
    assert res.status_code == 200

    body = res.json()
    dataset_id = body["dataset"]["id"]

    # Stored metadata exists
    meta_path = tmp_path / "datasets" / dataset_id / "dataset.json"
    assert meta_path.exists()
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["x"] == [1.0, 2.0, 3.0]
    assert meta["y"] == [10.0, 20.0, 30.0]

    # Listed
    res2 = client.get("/datasets")
    assert res2.status_code == 200
    listed = res2.json()
    assert any(d["id"] == dataset_id for d in listed)


def test_ingest_commit_reverses_decreasing_x(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

    client = TestClient(app)
    csv_bytes = b"x,y\n3,30\n2,20\n1,10\n"

    res = client.post(
        "/ingest/commit",
        files={"file": ("dec.csv", csv_bytes, "text/csv")},
        data={"x_index": "0", "y_index": "1", "x_unit": "nm", "y_unit": "flux"},
    )
    assert res.status_code == 200
    dataset_id = res.json()["dataset"]["id"]

    meta_path = tmp_path / "datasets" / dataset_id / "dataset.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["x"] == [1.0, 2.0, 3.0]
    assert meta["y"] == [10.0, 20.0, 30.0]
    assert any("reversed" in w.lower() for w in meta["warnings"])


def test_ingest_commit_jcamp_dx_creates_dataset(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

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
        "/ingest/commit",
        files={"file": ("ok.jdx", jcamp, "text/plain")},
        data={"x_unit": "", "y_unit": ""},
    )
    assert res.status_code == 200
    dataset_id = res.json()["dataset"]["id"]

    meta_path = tmp_path / "datasets" / dataset_id / "dataset.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["parser"] == "jcamp-dx"
    assert meta["x_unit"] == "NM"
    assert meta["y_unit"] == "FLUX"
    assert meta["x"] == [1.0, 2.0, 3.0]
    assert meta["y"] == [10.0, 20.0, 30.0]


def test_ingest_commit_fits_creates_dataset(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

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

    client = TestClient(app)
    res = client.post(
        "/ingest/commit",
        files={"file": ("ok.fits", fits_bytes, "application/fits")},
        data={"hdu_index": "1", "x_index": "0", "y_index": "1", "x_unit": "nm", "y_unit": "flux"},
    )
    assert res.status_code == 200
    dataset_id = res.json()["dataset"]["id"]

    meta_path = tmp_path / "datasets" / dataset_id / "dataset.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["parser"] == "fits"
    assert meta["x"] == [1.0, 2.0, 3.0]
    assert meta["y"] == [10.0, 20.0, 30.0]


def test_ingest_commit_ocean_optics_txt_creates_dataset_and_preserves_metadata(tmp_path) -> None:
    os.environ["SPECTRA_DATA_DIR"] = str(tmp_path)

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
        "/ingest/commit",
        files={"file": ("ocean.txt", txt, "text/plain")},
        data={"x_index": "0", "y_index": "1", "x_unit": "", "y_unit": ""},
    )
    assert res.status_code == 200
    dataset_id = res.json()["dataset"]["id"]

    meta_path = tmp_path / "datasets" / dataset_id / "dataset.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["parser"] == "delimited-text"
    assert meta["x"] == [345.39, 345.61, 345.82]
    assert meta["y"] == [2.364445, 2.364445, 2.364445]
    assert meta.get("source_metadata", {}).get("Spectrometer") == "USB4F03499"
