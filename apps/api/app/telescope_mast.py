from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from .mast_client import mast_invoke, set_filters


def _recommend_product(row: dict[str, Any]) -> bool:
    name = str(row.get("productFilename") or "").lower()
    if not name:
        return False

    # CAP-08 v1 baseline: conservatively prefer common spectral products.
    if "x1d" in name:
        return True
    if "s3d" in name:
        return True
    if "coadd" in name or "coadd" in name.replace("-", ""):
        return True
    return False


def _first_float(obj: dict[str, Any], keys: list[str]) -> float | None:
    for k in keys:
        v = obj.get(k)
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                f = float(v)
            except Exception:  # noqa: BLE001
                continue
            if f == f:  # not NaN
                return f
    return None


def _normalize_name_lookup_candidates(
    payload: dict[str, Any], *, input_text: str
) -> list[dict[str, Any]]:
    # Real MAST payloads can vary; keep this permissive.
    # Supported shapes:
    # - payload["resolvedCoordinate"] = [ra, dec]
    # - payload["data"] = [{resolved_ra/resolved_dec}, {ra/dec}, ...]
    candidates: list[dict[str, Any]] = []

    rc = payload.get("resolvedCoordinate")
    if isinstance(rc, (list, tuple)) and len(rc) >= 2:
        ra = rc[0]
        dec = rc[1]
        if isinstance(ra, (int, float)) and isinstance(dec, (int, float)):
            candidates.append({"label": input_text, "ra": float(ra), "dec": float(dec)})
            return candidates

    data = payload.get("data")
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            ra = _first_float(
                item,
                [
                    "resolved_ra",
                    "resolvedRA",
                    "resolvedRa",
                    "ra",
                    "RA",
                ],
            )
            dec = _first_float(
                item,
                [
                    "resolved_dec",
                    "resolvedDEC",
                    "resolvedDec",
                    "dec",
                    "DEC",
                ],
            )
            if ra is None or dec is None:
                continue
            label = (
                str(item.get("resolvedName") or item.get("input") or input_text).strip()
                or input_text
            )
            candidates.append({"label": label, "ra": ra, "dec": dec, "raw": item})

    return candidates


def _normalize_caom_observations(payload: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    data = payload.get("data")
    if not isinstance(data, list):
        return out
    for item in data:
        if not isinstance(item, dict):
            continue
        obsid = item.get("obsid")
        if obsid is None:
            obsid = item.get("obs_id")
        obs_collection = item.get("obs_collection") or item.get("mission")
        target_name = item.get("target_name") or item.get("target") or item.get("targetName")
        dataproduct_type = item.get("dataproduct_type") or item.get("dataproductType")
        out.append(
            {
                "obsid": obsid,
                "obs_collection": obs_collection,
                "target_name": target_name,
                "dataproduct_type": dataproduct_type,
                "raw": item,
            }
        )
    return out


def _normalize_products(payload: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    data = payload.get("data")
    if not isinstance(data, list):
        return out
    for item in data:
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "obsid": item.get("obsid"),
                "productFilename": item.get("productFilename"),
                "dataURI": item.get("dataURI") or item.get("data_uri"),
                "calib_level": item.get("calib_level"),
                "productType": item.get("productType"),
                "recommended": item.get("recommended"),
                "raw": item,
            }
        )
    return out


class MastNameLookupRequest(BaseModel):
    input: str


class MastCaomConeRequest(BaseModel):
    ra: float
    dec: float
    radius: float
    missions: list[str] | None = None
    dataproduct_types: list[str] | None = None
    pagesize: int = 200
    page: int = 1


class MastCaomProductsRequest(BaseModel):
    obsid: int | str
    pagesize: int = 200
    page: int = 1


def mast_name_lookup(req: MastNameLookupRequest) -> dict[str, Any]:
    request: dict[str, Any] = {
        "service": "Mast.Name.Lookup",
        "params": {"input": req.input},
        "format": "json",
    }
    payload = mast_invoke(request)
    payload["candidates"] = _normalize_name_lookup_candidates(payload, input_text=req.input)
    return payload


def mast_caom_search(req: MastCaomConeRequest) -> dict[str, Any]:
    # Prefer Filtered.Position so we can apply basic filters (mission/product type)
    # server-side rather than downloading a large cone result.
    filters: dict[str, Any] = {}
    if req.missions:
        filters["obs_collection"] = req.missions
    if req.dataproduct_types:
        filters["dataproduct_type"] = req.dataproduct_types

    request: dict[str, Any]
    if filters:
        request = {
            "service": "Mast.Caom.Filtered.Position",
            "format": "json",
            "params": {
                "columns": "*",
                "filters": set_filters(filters),
                "position": f"{req.ra}, {req.dec}, {req.radius}",
            },
            "pagesize": req.pagesize,
            "page": req.page,
            "removenullcolumns": True,
        }
    else:
        request = {
            "service": "Mast.Caom.Cone",
            "params": {"ra": req.ra, "dec": req.dec, "radius": req.radius},
            "format": "json",
            "pagesize": req.pagesize,
            "page": req.page,
            "removenullcolumns": True,
        }

    payload = mast_invoke(request)
    payload["observations"] = _normalize_caom_observations(payload)
    return payload


def mast_caom_products(req: MastCaomProductsRequest) -> dict[str, Any]:
    request: dict[str, Any] = {
        "service": "Mast.Caom.Products",
        "params": {"obsid": req.obsid},
        "format": "json",
        "pagesize": req.pagesize,
        "page": req.page,
    }
    payload = mast_invoke(request)

    data = payload.get("data")
    if isinstance(data, list):
        out: list[dict[str, Any]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            row = dict(item)
            row["recommended"] = _recommend_product(row)
            out.append(row)
        payload["data"] = out

    payload["products"] = _normalize_products(payload)
    return payload
