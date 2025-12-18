from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.main import app

# Minimal NIST ASD-like output:
# - tab-delimited
# - quoted numeric fields
# - intensity can contain non-numeric suffixes
_NIST_TSV = (
    "obs_wl_vac(nm)\tritz_wl_vac(nm)\twn(cm-1)\tintens\tAki(s^-1)\tAcc\tType\n"
    '"91.8125"\t"91.8129300"\t"108917.6"\t"5600"\t"5.0659e+04"\tAAA\t\n'
    '"92.3148"\t"92.3150275"\t"108325.0"\t"700bl"\t"2.1425e+05"\tAAA\t\n'
    '"93.0751"\t"93.0748142"\t"107440.1"\t"(1200)"\t"7.5684e+05"\tAAA\t\n'
)


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/cgi-bin/ASD/lines1.pl":
            self.send_response(404)
            self.end_headers()
            return

        # Validate a few required query params are present.
        qs = parse_qs(parsed.query)
        assert qs.get("spectra"), "missing spectra"
        assert qs.get("low_w"), "missing low_w"
        assert qs.get("upp_w"), "missing upp_w"
        assert qs.get("format") == ["3"], "expected tab-delimited format=3"
        assert qs.get("unit") == ["1"], "expected unit=1 (nm)"
        assert qs.get("allowed_out") == ["1"], "expected allowed_out=1"
        assert qs.get("forbid_out") == ["1"], "expected forbid_out=1"

        payload = _NIST_TSV.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
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

    return httpd, f"http://{host}:{port}/cgi-bin/ASD/lines1.pl"


def test_cap07_import_reference_nist_asd_line_list_by_query(tmp_path, monkeypatch):
    monkeypatch.setenv("SPECTRA_DATA_DIR", str(tmp_path))

    httpd, base_url = _serve_once()
    monkeypatch.setenv("NIST_ASD_LINES_URL", base_url)

    try:
        client = TestClient(app)
        res = client.post(
            "/references/import/nist-asd-line-list",
            json={
                "species": "Fe II",
                "wavelength_min_nm": 91,
                "wavelength_max_nm": 94,
            },
        )
        assert res.status_code == 200, res.text
        ds_id = res.json()["id"]

        data = client.get(f"/datasets/{ds_id}/data")
        assert data.status_code == 200
        payload = data.json()

        assert payload["x"] == [91.8125, 92.3148, 93.0751]
        assert payload["y"] == [5600.0, 700.0, 1200.0]

        ref = payload.get("reference", {})
        assert ref.get("data_type") == "LineList"
        assert ref.get("source_name") == "NIST ASD"
        assert "spectra=Fe+II" in (ref.get("source_url") or "")
    finally:
        httpd.shutdown()
