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
        "params": {"input": req.input, "format": "json"},
        "format": "json",
    }
    return mast_invoke(request)


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

    return mast_invoke(request)


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

    return payload
