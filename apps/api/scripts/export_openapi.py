from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    api_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(api_root))

    from app.main import app

    repo_root = Path(__file__).resolve().parents[3]
    out_path = repo_root / "packages" / "api-client" / "openapi.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    schema = app.openapi()
    out_path.write_text(json.dumps(schema, indent=2, sort_keys=True), encoding="utf-8")


if __name__ == "__main__":
    main()
