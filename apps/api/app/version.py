from __future__ import annotations

import json
from pathlib import Path


def read_version() -> dict:
    repo_root = Path(__file__).resolve().parents[3]
    version_path = repo_root / "version.json"
    return json.loads(version_path.read_text(encoding="utf-8"))
