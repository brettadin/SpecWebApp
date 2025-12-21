from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.main import app


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/cgi/cbook.cgi":
            self.send_response(404)
            self.end_headers()
            return

        qs = parse_qs(parsed.query)
        name = (qs.get("Name") or [""])[0]

        # Minimal fake page that includes an ID=... token.
        # The resolver only needs ID=... and optionally <title>.
        html = f"""<!doctype html>
<html>
<head><title>{name} - Fake NIST WebBook</title></head>
<body>
  <a href="/cgi/cbook.cgi?ID=C124-38-9&Units=SI&Type=IR&Index=0">IR spectrum</a>
</body>
</html>"""

        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _serve_once() -> tuple[ThreadingHTTPServer, str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    host, port = httpd.server_address
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, f"http://{host}:{port}"


def test_cap07_resolve_reference_nist_webbook_ir(tmp_path, monkeypatch):
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    httpd, base = _serve_once()
    monkeypatch.setenv("NIST_WEBBOOK_BASE_URL", base)

    try:
        client = TestClient(app)
        res = client.post("/references/resolve/nist-webbook-ir", json={"name": "CO2", "index": 0})
        assert res.status_code == 200, res.text
        payload = res.json()
        assert isinstance(payload, list)
        assert payload
        cand = payload[0]
        assert "NIST" in cand["source_name"]
        assert "JCAMP=" in cand["source_url"]
        assert "Type=IR" in cand["source_url"]
        assert "Index=0" in cand["source_url"]
        assert cand.get("open_page_url")
        assert cand.get("query", {}).get("species_id")
    finally:
        httpd.shutdown()
