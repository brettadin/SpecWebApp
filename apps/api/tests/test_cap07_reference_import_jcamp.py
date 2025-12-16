from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from fastapi.testclient import TestClient

from app.main import app

_JCAMP = """##TITLE=Example IR
##JCAMP-DX=5.00
##DATA TYPE=INFRARED SPECTRUM
##XUNITS=1/CM
##YUNITS=ABSORBANCE
##FIRSTX=1000
##LASTX=1002
##NPOINTS=3
##XYDATA=(X++(Y..Y))
1000 1 2 3
##END=
"""


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path != "/example.jdx":
            self.send_response(404)
            self.end_headers()
            return

        payload = _JCAMP.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):  # noqa: A002
        # Keep tests quiet.
        return


def _serve_once() -> tuple[ThreadingHTTPServer, str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    host, port = httpd.server_address

    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    return httpd, f"http://{host}:{port}/example.jdx"


def test_cap07_import_reference_jcamp_dx_by_url(tmp_path, monkeypatch):
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    httpd, url = _serve_once()
    try:
        client = TestClient(app)
        res = client.post(
            "/references/import/jcamp-dx",
            json={
                "title": "NIST WebBook IR (Example)",
                "source_name": "NIST Chemistry WebBook",
                "source_url": url,
                "citation_text": "NIST Chemistry WebBook, retrieved for testing",
                "license": {"redistribution_allowed": "unknown"},
                "query": {"note": "unit test"},
                "trust_tier": "Primary/Authoritative",
            },
        )
        assert res.status_code == 200, res.text
        payload = res.json()
        assert payload["name"] == "NIST WebBook IR (Example)"

        ds_id = payload["id"]
        ds = client.get(f"/datasets/{ds_id}")
        assert ds.status_code == 200

        # Reference metadata should be persisted in dataset.json.
        meta = (tmp_path / "datasets" / ds_id / "dataset.json").read_text(encoding="utf-8")
        assert "reference" in meta
        assert "NIST Chemistry WebBook" in meta
        assert url in meta
        assert "citation_text" in meta
    finally:
        httpd.shutdown()
