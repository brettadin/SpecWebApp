from __future__ import annotations

import io
import json
import threading
import urllib.parse
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import numpy as np
from astropy.io import fits
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

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


def _make_fits_bytes_v2() -> bytes:
    wave = np.array([1.0, 2.0, 3.0], dtype=float)
    flux = np.array([11.0, 22.0, 33.0], dtype=float)

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
_FITS_BYTES_V2 = _make_fits_bytes_v2()

_DATA_URI = "mast:JWST/product/example_x1d.fits"
_PROTECTED_DATA_URI = "mast:JWST/product/protected_x1d.fits"
_TEST_TOKEN = "testtoken"


class _Handler(BaseHTTPRequestHandler):
    download_requests = 0
    download_failures_remaining = 0

    def do_POST(self):  # noqa: N802
        if self.path == "/invoke":
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")

            parsed = urllib.parse.parse_qs(body)
            req_raw = parsed.get("request", [""])[0]
            req_json = urllib.parse.unquote(req_raw)
            request_obj = json.loads(req_json)
            service = request_obj.get("service")

            if service == "Mast.Name.Lookup":
                if request_obj.get("params", {}).get("input") == "PROTECTED":
                    if self.headers.get("Authorization") != f"Bearer {_TEST_TOKEN}":
                        self.send_response(401)
                        self.end_headers()
                        return
                payload: dict[str, Any] = {
                    "status": "COMPLETE",
                    "data": [
                        {
                            "resolved_ra": 10.0,
                            "resolved_dec": -5.0,
                            "input": request_obj["params"]["input"],
                        }
                    ],
                }
            elif service in ("Mast.Caom.Filtered.Position", "Mast.Caom.Cone"):
                payload = {
                    "status": "COMPLETE",
                    "data": [
                        {
                            "obsid": 123,
                            "obs_collection": "JWST",
                            "target_name": "TestTarget",
                            "dataproduct_type": "spectrum",
                        }
                    ],
                }
            elif service == "Mast.Caom.Products":
                payload = {
                    "status": "COMPLETE",
                    "data": [
                        {
                            "obsid": request_obj["params"]["obsid"],
                            "productFilename": "example_x1d.fits",
                            "dataURI": _DATA_URI,
                            "calib_level": 3,
                            "productType": "science",
                        }
                    ],
                }
            else:
                payload = {"status": "ERROR", "msg": f"unknown service {service}"}

            raw = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return

        if self.path == "/api/v0.1/Download/file":
            type(self).download_requests += 1
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            parsed = urllib.parse.parse_qs(body)
            uri = parsed.get("uri", [""])[0]

            if uri == _DATA_URI and type(self).download_failures_remaining > 0:
                type(self).download_failures_remaining -= 1
                self.send_response(503)
                self.end_headers()
                return

            if uri == _PROTECTED_DATA_URI:
                if self.headers.get("Authorization") != f"Bearer {_TEST_TOKEN}":
                    self.send_response(401)
                    self.end_headers()
                    return
                payload = _FITS_BYTES
                self.send_response(200)
                self.send_header("Content-Type", "application/fits")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return

            if uri != _DATA_URI:
                self.send_response(404)
                self.end_headers()
                return

            payload = _FITS_BYTES if type(self).download_requests == 1 else _FITS_BYTES_V2
            self.send_response(200)
            self.send_header("Content-Type", "application/fits")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format: str, *args: object):  # noqa: A002
        return


def _serve_once() -> tuple[ThreadingHTTPServer, str, str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    host = httpd.server_address[0]
    port = httpd.server_address[1]

    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    return httpd, f"http://{host}:{port}/invoke", f"http://{host}:{port}/api/v0.1/Download/file"


def test_cap08_mast_name_lookup_and_products(tmp_path: Path, monkeypatch: MonkeyPatch):
    # Ensure no incidental dataset writes and point MAST invoke to the local fake server.
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    httpd, invoke_url, download_url = _serve_once()
    monkeypatch.setenv("MAST_API_BASE_URL", invoke_url)
    monkeypatch.setenv("MAST_DOWNLOAD_FILE_URL", download_url)

    try:
        client = TestClient(app)

        res = client.post("/telescope/mast/name-lookup", json={"input": "M101"})
        assert res.status_code == 200, res.text
        assert res.json()["status"] == "COMPLETE"

        res = client.post(
            "/telescope/mast/caom-search",
            json={
                "ra": 10.0,
                "dec": -5.0,
                "radius": 0.1,
                "missions": ["JWST"],
                "dataproduct_types": ["spectrum"],
            },
        )
        assert res.status_code == 200, res.text
        payload = res.json()
        assert payload["status"] == "COMPLETE"
        assert payload["data"][0]["obs_collection"] == "JWST"

        res = client.post("/telescope/mast/caom-products", json={"obsid": 123})
        assert res.status_code == 200, res.text
        prod = res.json()
        assert prod["status"] == "COMPLETE"
        assert prod["data"][0]["productFilename"] == "example_x1d.fits"
        assert prod["data"][0]["recommended"] is True
    finally:
        httpd.shutdown()


def test_cap08_mast_download_preview_and_import(tmp_path: Path, monkeypatch: MonkeyPatch):
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    httpd, invoke_url, download_url = _serve_once()
    monkeypatch.setenv("MAST_API_BASE_URL", invoke_url)
    monkeypatch.setenv("MAST_DOWNLOAD_FILE_URL", download_url)

    try:
        client = TestClient(app)
        _Handler.download_requests = 0
        _Handler.download_failures_remaining = 0

        preview = client.post(
            "/telescope/mast/preview/fits-by-data-uri",
            json={
                "data_uri": _DATA_URI,
                "product_filename": "example_x1d.fits",
                "mission": "JWST",
                "source_name": "MAST",
                "citation_text": "MAST (example), retrieved for testing",
                "query": {"obsid": 123},
            },
        )
        assert preview.status_code == 200, preview.text
        pj = preview.json()
        assert pj["file_name"] == "example_x1d.fits"
        assert pj["fits_hdu_candidates"], "expected at least one table HDU"

        cache_key = sha256(_DATA_URI.encode()).hexdigest()
        cache_meta = json.loads(
            (tmp_path / "cache" / "mast" / f"{cache_key}.json").read_text(encoding="utf-8")
        )
        cached_downloaded_at = cache_meta["downloaded_at"]

        cand = pj["fits_hdu_candidates"][0]
        res = client.post(
            "/telescope/mast/import/fits-by-data-uri",
            json={
                "title": "JWST MAST Product Spectrum",
                "data_uri": _DATA_URI,
                "product_filename": "example_x1d.fits",
                "mission": "JWST",
                "source_name": "MAST",
                "citation_text": "MAST (example), retrieved for testing",
                "query": {
                    "obsid": 123,
                    "product": "example_x1d.fits",
                    "product_filename": "example_x1d.fits",
                    "data_uri": _DATA_URI,
                    "calib_level": 3,
                    "product_type": "science",
                    "recommended": True,
                },
                "hdu_index": cand["hdu_index"],
                "x_index": cand.get("suggested_x_index") or 0,
                "y_index": cand.get("suggested_y_index") or 1,
                "x_unit": "um",
                "y_unit": "Jy",
            },
        )
        assert res.status_code == 200, res.text
        assert _Handler.download_requests == 1, (
            "expected preview to populate cache and import to reuse it"
        )
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
        assert detail.get("reference", {}).get("source_url") == _DATA_URI
        assert detail.get("reference", {}).get("citation_present") is True
        assert detail.get("reference", {}).get("retrieved_at") == cached_downloaded_at

        saved = json.loads(
            (tmp_path / "datasets" / ds_id / "dataset.json").read_text(encoding="utf-8")
        )
        ref_query = saved.get("reference", {}).get("query", {})
        assert ref_query.get("data_uri") == _DATA_URI
        assert ref_query.get("product_filename") == "example_x1d.fits"
        assert ref_query.get("calib_level") == 3
        assert ref_query.get("product_type") == "science"
        assert ref_query.get("recommended") is True
    finally:
        httpd.shutdown()


def test_cap08_mast_download_retries_transient_503_then_success(
    tmp_path: Path, monkeypatch: MonkeyPatch
):
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    # Keep the test deterministic/fast.
    monkeypatch.setenv("MAST_RETRY_MAX_ATTEMPTS", "2")
    monkeypatch.setenv("MAST_RETRY_BACKOFF_BASE_S", "0")
    monkeypatch.setenv("MAST_RETRY_BACKOFF_MAX_S", "0")
    monkeypatch.setenv("MAST_RETRY_SLEEP_ENABLED", "0")

    httpd, invoke_url, download_url = _serve_once()
    monkeypatch.setenv("MAST_API_BASE_URL", invoke_url)
    monkeypatch.setenv("MAST_DOWNLOAD_FILE_URL", download_url)

    try:
        client = TestClient(app)
        _Handler.download_requests = 0
        _Handler.download_failures_remaining = 1

        preview = client.post(
            "/telescope/mast/preview/fits-by-data-uri",
            json={
                "data_uri": _DATA_URI,
                "product_filename": "example_x1d.fits",
                "mission": "JWST",
                "source_name": "MAST",
                "citation_text": "MAST (example), retrieved for testing",
                "query": {"obsid": 123},
            },
        )

        assert preview.status_code == 200, preview.text
        assert _Handler.download_requests == 2, "expected one transient 503 then a retry"
    finally:
        httpd.shutdown()


def test_cap08_mast_auth_is_passed_through_for_invoke_and_download(
    tmp_path: Path, monkeypatch: MonkeyPatch
):
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    httpd, invoke_url, download_url = _serve_once()
    monkeypatch.setenv("MAST_API_BASE_URL", invoke_url)
    monkeypatch.setenv("MAST_DOWNLOAD_FILE_URL", download_url)

    try:
        client = TestClient(app)

        # Without token, protected invoke should fail.
        res = client.post("/telescope/mast/name-lookup", json={"input": "PROTECTED"})
        assert res.status_code == 401

        # Without token, protected download should fail.
        res = client.post(
            "/telescope/mast/preview/fits-by-data-uri",
            json={
                "data_uri": _PROTECTED_DATA_URI,
                "product_filename": "protected_x1d.fits",
                "mission": "JWST",
                "source_name": "MAST",
                "citation_text": "MAST (protected), retrieved for testing",
                "query": {"obsid": 999},
            },
        )
        assert res.status_code == 401

        # With token, both should succeed.
        monkeypatch.setenv("MAST_BEARER_TOKEN", _TEST_TOKEN)

        res = client.post("/telescope/mast/name-lookup", json={"input": "PROTECTED"})
        assert res.status_code == 200, res.text
        assert res.json().get("status") == "COMPLETE"

        res = client.post(
            "/telescope/mast/preview/fits-by-data-uri",
            json={
                "data_uri": _PROTECTED_DATA_URI,
                "product_filename": "protected_x1d.fits",
                "mission": "JWST",
                "source_name": "MAST",
                "citation_text": "MAST (protected), retrieved for testing",
                "query": {"obsid": 999},
            },
        )
        assert res.status_code == 200, res.text
        assert res.json().get("file_name") == "protected_x1d.fits"
    finally:
        httpd.shutdown()


def test_cap08_mast_refresh_preserves_cache_history(tmp_path: Path, monkeypatch: MonkeyPatch):
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    httpd, invoke_url, download_url = _serve_once()
    monkeypatch.setenv("MAST_API_BASE_URL", invoke_url)
    monkeypatch.setenv("MAST_DOWNLOAD_FILE_URL", download_url)

    try:
        client = TestClient(app)
        _Handler.download_requests = 0

        res = client.post(
            "/telescope/mast/preview/fits-by-data-uri",
            json={
                "data_uri": _DATA_URI,
                "product_filename": "example_x1d.fits",
                "mission": "JWST",
                "source_name": "MAST",
                "citation_text": "MAST (example), retrieved for testing",
                "query": {"obsid": 123},
            },
        )
        assert res.status_code == 200, res.text
        body1 = res.json()
        assert isinstance(body1.get("cache"), dict)
        assert isinstance(body1["cache"].get("versions"), list)
        assert len(body1["cache"]["versions"]) == 1

        cache_key = sha256(_DATA_URI.encode()).hexdigest()
        meta_path = tmp_path / "cache" / "mast" / f"{cache_key}.json"
        meta1 = json.loads(meta_path.read_text(encoding="utf-8"))
        versions1 = meta1.get("versions")
        assert isinstance(versions1, list)
        assert len(versions1) == 1
        assert _Handler.download_requests == 1

        res = client.post(
            "/telescope/mast/preview/fits-by-data-uri",
            json={
                "data_uri": _DATA_URI,
                "product_filename": "example_x1d.fits",
                "refresh": True,
                "mission": "JWST",
                "source_name": "MAST",
                "citation_text": "MAST (example), retrieved for testing",
                "query": {"obsid": 123},
            },
        )
        assert res.status_code == 200, res.text
        body2 = res.json()
        assert isinstance(body2.get("cache"), dict)
        assert isinstance(body2["cache"].get("versions"), list)
        assert len(body2["cache"]["versions"]) == 2
        assert _Handler.download_requests == 2

        meta2 = json.loads(meta_path.read_text(encoding="utf-8"))
        versions2 = meta2.get("versions")
        assert isinstance(versions2, list)
        assert len(versions2) == 2

        sha_a = versions2[0].get("sha256")
        sha_b = versions2[1].get("sha256")
        assert isinstance(sha_a, str) and sha_a
        assert isinstance(sha_b, str) and sha_b

        # Both version paths should exist on disk.
        cache_dir = tmp_path / "cache" / "mast"
        for v in versions2:
            assert (cache_dir / str(v.get("path"))).exists()
    finally:
        httpd.shutdown()
