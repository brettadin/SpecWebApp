from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from fastapi.testclient import TestClient

from app.main import app

_CSV = "x,intensity\n500,1\n600,2\n700,3\n"


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path != "/lines.csv":
            self.send_response(404)
            self.end_headers()
            return

        payload = _CSV.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
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

    return httpd, f"http://{host}:{port}/lines.csv"


def test_cap07_import_reference_line_list_csv_by_url(tmp_path, monkeypatch):
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    httpd, url = _serve_once()
    try:
        client = TestClient(app)
        res = client.post(
            "/references/import/line-list-csv",
            json={
                "title": "NIST ASD Lines (Example)",
                "source_name": "NIST ASD",
                "source_url": url,
                "citation_text": "NIST ASD, retrieved for testing",
                "x_unit": "nm",
                "delimiter": ",",
                "has_header": True,
                "x_index": 0,
                "strength_index": 1,
                "license": {"redistribution_allowed": "unknown"},
                "trust_tier": "Primary/Authoritative",
            },
        )
        assert res.status_code == 200, res.text
        ds_id = res.json()["id"]

        ds = client.get(f"/datasets/{ds_id}")
        assert ds.status_code == 200
        assert ds.json().get("reference", {}).get("data_type") == "LineList"

        data = client.get(f"/datasets/{ds_id}/data")
        assert data.status_code == 200
        payload = data.json()
        assert payload["x"] == [500.0, 600.0, 700.0]
        assert payload["y"] == [1.0, 2.0, 3.0]
        assert payload.get("reference", {}).get("data_type") == "LineList"
    finally:
        httpd.shutdown()
