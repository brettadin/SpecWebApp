from __future__ import annotations

import io
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from astropy.io import fits
from fastapi.testclient import TestClient

from app.main import app


def _make_fits_bytes() -> bytes:
    wave = np.array([1.0, 2.0, 3.0], dtype=float)
    flux = np.array([10.0, 20.0, 30.0], dtype=float)

    cols = [
        fits.Column(name="WAVELENGTH", array=wave, format="D"),
        fits.Column(name="FLUX", array=flux, format="D"),
    ]
    hdu = fits.BinTableHDU.from_columns(cols, name="SPECTRUM")
    hdul = fits.HDUList([fits.PrimaryHDU(), hdu])

    buf = io.BytesIO()
    hdul.writeto(buf)
    return buf.getvalue()


_FITS_BYTES = _make_fits_bytes()


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path != "/example.fits":
            self.send_response(404)
            self.end_headers()
            return

        payload = _FITS_BYTES
        self.send_response(200)
        self.send_header("Content-Type", "application/fits")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):  # noqa: A002
        return


def _serve_once() -> tuple[ThreadingHTTPServer, str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    host, port = httpd.server_address

    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    return httpd, f"http://{host}:{port}/example.fits"


def test_cap08_preview_and_import_fits_by_url(tmp_path, monkeypatch):
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    httpd, url = _serve_once()
    try:
        client = TestClient(app)

        preview = client.post(
            "/telescope/preview/fits-by-url",
            json={
                "source_url": url,
                "mission": "JWST",
                "source_name": "MAST",
                "citation_text": "MAST (example), retrieved for testing",
                "query": {"note": "unit test"},
            },
        )
        assert preview.status_code == 200, preview.text
        pj = preview.json()
        assert pj["file_name"].endswith(".fits")
        assert pj["file_size_bytes"] > 0
        assert pj["sha256"]
        assert pj["fits_hdu_candidates"], "expected at least one table HDU"

        cand = pj["fits_hdu_candidates"][0]
        assert cand["hdu_name"]
        assert cand["columns"]

        # Explicit mapping (CAP-08 rule: no silent extraction choices).
        res = client.post(
            "/telescope/import/fits-by-url",
            json={
                "title": "JWST Example Spectrum",
                "source_url": url,
                "mission": "JWST",
                "source_name": "MAST",
                "citation_text": "MAST (example), retrieved for testing",
                "hdu_index": cand["hdu_index"],
                "x_index": cand.get("suggested_x_index") or 0,
                "y_index": cand.get("suggested_y_index") or 1,
                "x_unit": "um",
                "y_unit": "Jy",
            },
        )
        assert res.status_code == 200, res.text
        ds_id = res.json()["id"]

        data = client.get(f"/datasets/{ds_id}/data")
        assert data.status_code == 200
        payload = data.json()
        assert payload["x"] == [1.0, 2.0, 3.0]
        assert payload["y"] == [10.0, 20.0, 30.0]

        ds = client.get(f"/datasets/{ds_id}")
        assert ds.status_code == 200
        detail = ds.json()
        assert detail.get("reference", {}).get("source_name") == "MAST"
        assert detail.get("reference", {}).get("citation_present") is True
    finally:
        httpd.shutdown()
