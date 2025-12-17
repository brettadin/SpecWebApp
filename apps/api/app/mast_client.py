from __future__ import annotations

import dataclasses
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from typing import Any

from .datasets import data_root


def _mast_invoke_url() -> str:
    return os.environ.get("MAST_API_BASE_URL", "https://mast.stsci.edu/api/v0/invoke")


def _mast_download_file_url() -> str:
    # MAST download endpoint (v0.1) for retrieving product bytes.
    # Exposed as an env override for offline tests.
    return os.environ.get(
        "MAST_DOWNLOAD_FILE_URL",
        "https://mast.stsci.edu/api/v0.1/Download/file",
    )


def _mast_cache_dir() -> Path:
    override = os.environ.get("SPECTRA_CACHE_DIR")
    if override:
        return Path(override) / "mast"
    return data_root() / "cache" / "mast"


def _mast_auth_headers() -> dict[str, str]:
    """Optional auth headers for MAST requests.

    MVP: pass through a caller-provided Authorization value via env var.
    This keeps auth out of request bodies and allows offline tests.
    """

    authorization = (os.environ.get("MAST_AUTHORIZATION") or "").strip()
    if authorization:
        return {"Authorization": authorization}

    bearer = (os.environ.get("MAST_BEARER_TOKEN") or "").strip()
    if bearer:
        return {"Authorization": f"Bearer {bearer}"}

    return {}


class MastHTTPError(RuntimeError):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = int(status_code)
        self.message = message


def mast_invoke(request: dict[str, Any], *, timeout_s: int = 30) -> dict[str, Any]:
    """Invoke a MAST API request.

    Uses the documented /api/v0/invoke endpoint with application/x-www-form-urlencoded
    payload: request=<urlencoded json>.

    Note: Auth/token handling is intentionally not implemented yet (CAP-08 follow-up).
    """

    version = ".".join(map(str, sys.version_info[:3]))
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/plain",
        "User-Agent": f"python-requests/{version}",
        **_mast_auth_headers(),
    }

    req_string = json.dumps(request)
    encoded = urllib.parse.quote(req_string)
    data = f"request={encoded}".encode()

    req = urllib.request.Request(
        _mast_invoke_url(),
        data=data,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as err:
        try:
            body = err.read()
            text = body.decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            text = ""
        msg = f"MAST invoke failed ({err.code})"
        if text.strip():
            msg = f"{msg}: {text.strip()}"
        raise MastHTTPError(err.code, msg) from err

    text = raw.decode("utf-8")
    return json.loads(text)


def mast_download_file(
    data_uri: str,
    *,
    timeout_s: int = 60,
    refresh: bool = False,
) -> bytes:
    """Download a MAST product by its dataURI.

    This wraps the documented /api/v0.1/Download/file endpoint.

    Note: Auth/token handling is intentionally not implemented yet (CAP-08 follow-up).
    """

    return mast_download_file_with_cache_info(data_uri, timeout_s=timeout_s, refresh=refresh).raw


@dataclasses.dataclass(frozen=True)
class MastDownloadResult:
    raw: bytes
    downloaded_at: str
    sha256: str
    cache_hit: bool


def _cache_paths_for_data_uri(data_uri: str) -> tuple[Path, Path]:
    cache_dir = _mast_cache_dir()
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_key = sha256(data_uri.encode()).hexdigest()
    cache_path = cache_dir / f"{cache_key}.bin"
    meta_path = cache_dir / f"{cache_key}.json"
    return cache_path, meta_path


def _compact_timestamp_for_filename(iso_timestamp: str) -> str:
    # ISO strings can contain ":" and "+" which are awkward for filenames.
    out = iso_timestamp.strip()
    out = out.replace(":", "")
    out = out.replace("+", "")
    out = out.replace("-", "")
    out = out.replace(".", "")
    out = out.replace("T", "_")
    return out


def _versioned_cache_path(cache_path: Path, *, downloaded_at: str, sha: str) -> Path:
    stamp = _compact_timestamp_for_filename(downloaded_at)
    short = sha[:12]
    return cache_path.with_name(f"{cache_path.stem}__{stamp}__{short}.bin")


def _load_meta(meta_path: Path) -> dict[str, Any]:
    if not meta_path.exists():
        return {}
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        return meta if isinstance(meta, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def mast_cache_info(data_uri: str) -> dict[str, Any] | None:
    """Return safe cache metadata for a data_uri.

    This is intended for API/UI consumption (e.g., showing cache history).
    It deliberately returns only non-sensitive fields.
    """

    if not data_uri.strip():
        return None

    cache_path, meta_path = _cache_paths_for_data_uri(data_uri)
    if not cache_path.exists() and not meta_path.exists():
        return None

    meta = _load_meta(meta_path)
    if not meta:
        return None

    latest = meta.get("latest")
    if not isinstance(latest, dict):
        latest = None

    versions = meta.get("versions")
    if not isinstance(versions, list):
        versions = []

    safe_versions: list[dict[str, Any]] = []
    for v in versions:
        if not isinstance(v, dict):
            continue
        safe_versions.append(
            {
                "downloaded_at": v.get("downloaded_at"),
                "sha256": v.get("sha256"),
                "bytes": v.get("bytes"),
                "path": v.get("path"),
            }
        )

    safe_latest: dict[str, Any] | None
    if latest is None:
        safe_latest = None
    else:
        safe_latest = {
            "downloaded_at": latest.get("downloaded_at"),
            "sha256": latest.get("sha256"),
            "bytes": latest.get("bytes"),
            "path": latest.get("path"),
        }

    return {
        "data_uri": meta.get("data_uri") or data_uri,
        "latest": safe_latest,
        "versions": safe_versions,
    }


def _write_meta(meta_path: Path, meta: dict[str, Any]) -> None:
    meta_path.write_text(
        json.dumps(meta, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def _ensure_versions_list(meta: dict[str, Any]) -> list[dict[str, Any]]:
    versions = meta.get("versions")
    if not isinstance(versions, list):
        versions = []
        meta["versions"] = versions
    return versions


def _record_version(
    meta: dict[str, Any],
    *,
    data_uri: str,
    downloaded_at: str,
    sha: str,
    bytes_len: int,
    path: str,
) -> None:
    meta["data_uri"] = data_uri
    versions = _ensure_versions_list(meta)
    entry = {
        "downloaded_at": downloaded_at,
        "sha256": sha,
        "bytes": bytes_len,
        "path": path,
    }
    if any(
        (isinstance(v, dict) and v.get("sha256") == sha and v.get("path") == path) for v in versions
    ):
        return
    versions.append(entry)


def _set_latest_meta(
    meta: dict[str, Any],
    *,
    data_uri: str,
    downloaded_at: str,
    sha: str,
    bytes_len: int,
    latest_path: str,
) -> None:
    # Backward-compatible top-level fields.
    meta["data_uri"] = data_uri
    meta["downloaded_at"] = downloaded_at
    meta["sha256"] = sha
    meta["bytes"] = bytes_len

    meta["latest"] = {
        "downloaded_at": downloaded_at,
        "sha256": sha,
        "bytes": bytes_len,
        "path": latest_path,
    }


def _archive_existing_latest_if_needed(
    *,
    data_uri: str,
    cache_path: Path,
    meta_path: Path,
) -> None:
    if not cache_path.exists():
        return

    raw = cache_path.read_bytes()
    sha = sha256(raw).hexdigest()
    downloaded_at = _best_effort_read_downloaded_at(meta_path, cache_path)
    if not downloaded_at:
        downloaded_at = datetime.fromtimestamp(cache_path.stat().st_mtime, tz=UTC).isoformat()

    version_path = _versioned_cache_path(cache_path, downloaded_at=downloaded_at, sha=sha)
    if not version_path.exists():
        version_path.write_bytes(raw)

    meta = _load_meta(meta_path)
    _record_version(
        meta,
        data_uri=data_uri,
        downloaded_at=downloaded_at,
        sha=sha,
        bytes_len=len(raw),
        path=version_path.name,
    )
    _set_latest_meta(
        meta,
        data_uri=data_uri,
        downloaded_at=downloaded_at,
        sha=sha,
        bytes_len=len(raw),
        latest_path=cache_path.name,
    )
    _write_meta(meta_path, meta)


def _best_effort_read_downloaded_at(meta_path: Path, cache_path: Path) -> str | None:
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            downloaded_at = meta.get("downloaded_at")
            if isinstance(downloaded_at, str) and downloaded_at.strip():
                return downloaded_at
        except Exception:  # noqa: BLE001
            pass

    if cache_path.exists():
        try:
            ts = cache_path.stat().st_mtime
            return datetime.fromtimestamp(ts, tz=UTC).isoformat()
        except Exception:  # noqa: BLE001
            return None

    return None


def mast_download_file_with_cache_info(
    data_uri: str,
    *,
    timeout_s: int = 60,
    refresh: bool = False,
) -> MastDownloadResult:
    """Download a MAST product by its dataURI and return cache-aware metadata.

    Returns:
    - raw bytes
    - downloaded_at: when the bytes were downloaded (or best-effort cache timestamp)
    - sha256: sha256 of raw bytes
    - cache_hit: whether we reused a cached copy

    Note: Auth/token handling is intentionally not implemented yet (CAP-08 follow-up).
    """

    if not data_uri.strip():
        raise ValueError("data_uri is required")

    cache_path, meta_path = _cache_paths_for_data_uri(data_uri)

    if cache_path.exists() and not refresh:
        raw = cache_path.read_bytes()
        downloaded_at = _best_effort_read_downloaded_at(meta_path, cache_path)
        sha = sha256(raw).hexdigest()
        if not downloaded_at:
            downloaded_at = datetime.now(tz=UTC).isoformat()

        # Ensure this cached value is represented as an immutable version.
        try:
            version_path = _versioned_cache_path(cache_path, downloaded_at=downloaded_at, sha=sha)
            if not version_path.exists():
                version_path.write_bytes(raw)

            meta = _load_meta(meta_path)
            _record_version(
                meta,
                data_uri=data_uri,
                downloaded_at=downloaded_at,
                sha=sha,
                bytes_len=len(raw),
                path=version_path.name,
            )
            _set_latest_meta(
                meta,
                data_uri=data_uri,
                downloaded_at=downloaded_at,
                sha=sha,
                bytes_len=len(raw),
                latest_path=cache_path.name,
            )
            _write_meta(meta_path, meta)
        except Exception:  # noqa: BLE001
            pass

        return MastDownloadResult(
            raw=raw,
            downloaded_at=downloaded_at,
            sha256=sha,
            cache_hit=True,
        )

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/octet-stream",
        **_mast_auth_headers(),
    }

    payload = urllib.parse.urlencode({"uri": data_uri}).encode()
    req = urllib.request.Request(
        _mast_download_file_url(), data=payload, headers=headers, method="POST"
    )

    if refresh:
        # Preserve previous cached bytes for reproducibility before overwriting latest.
        try:
            _archive_existing_latest_if_needed(
                data_uri=data_uri,
                cache_path=cache_path,
                meta_path=meta_path,
            )
        except Exception:  # noqa: BLE001
            pass

    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read(500 * 1024 * 1024)
    except urllib.error.HTTPError as err:
        try:
            body = err.read()
            text = body.decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            text = ""
        msg = f"MAST download failed ({err.code})"
        if text.strip():
            msg = f"{msg}: {text.strip()}"
        raise MastHTTPError(err.code, msg) from err

    downloaded_at = datetime.now(tz=UTC).isoformat()
    sha = sha256(raw).hexdigest()

    try:
        version_path = _versioned_cache_path(cache_path, downloaded_at=downloaded_at, sha=sha)
        version_path.write_bytes(raw)
        cache_path.write_bytes(raw)
        meta = _load_meta(meta_path)
        _record_version(
            meta,
            data_uri=data_uri,
            downloaded_at=downloaded_at,
            sha=sha,
            bytes_len=len(raw),
            path=version_path.name,
        )
        _set_latest_meta(
            meta,
            data_uri=data_uri,
            downloaded_at=downloaded_at,
            sha=sha,
            bytes_len=len(raw),
            latest_path=cache_path.name,
        )
        _write_meta(meta_path, meta)
    except Exception:  # noqa: BLE001
        pass

    return MastDownloadResult(
        raw=raw,
        downloaded_at=downloaded_at,
        sha256=sha,
        cache_hit=False,
    )


def set_filters(parameters: dict[str, Any]) -> list[dict[str, Any]]:
    return [{"paramName": name, "values": values} for name, values in parameters.items()]
