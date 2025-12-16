from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class JcampParseResult:
    title: str | None
    x_unit: str | None
    y_unit: str | None
    x: list[float]
    y: list[float]
    warnings: list[str]
    header: dict[str, str]


_TAG_RE = re.compile(r"^##(?P<key>[^=]+)=(?P<value>.*)$")


def _parse_header(lines: list[str]) -> tuple[dict[str, str], int]:
    header: dict[str, str] = {}
    idx = 0
    for idx, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        if not line.startswith("##"):
            continue
        if line.upper().startswith("##XYDATA") or line.upper().startswith("##PEAK TABLE"):
            return header, idx
        m = _TAG_RE.match(line)
        if not m:
            continue
        key = m.group("key").strip().upper()
        val = m.group("value").strip()
        header[key] = val
    return header, len(lines)


def _as_float(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


def _tokenize_numbers(line: str) -> list[float]:
    # JCAMP commonly uses space/comma separated numbers; allow multiple spaces.
    raw = line.strip().replace(",", " ")
    parts = [p for p in raw.split() if p]
    out: list[float] = []
    for p in parts:
        v = _as_float(p)
        if v is None:
            continue
        out.append(v)
    return out


def _parse_xydata(
    lines: list[str], start_idx: int, header: dict[str, str]
) -> tuple[list[float], list[float], list[str]]:
    warnings: list[str] = []

    xfactor = _as_float(header.get("XFACTOR", "1")) or 1.0
    yfactor = _as_float(header.get("YFACTOR", "1")) or 1.0
    deltax = _as_float(header.get("DELTAX", ""))

    x: list[float] = []
    y: list[float] = []

    mode = None
    # Find the XYDATA line if present
    for i in range(start_idx, len(lines)):
        line = lines[i].strip()
        if not line.upper().startswith("##XYDATA"):
            continue
        mode = line.upper()
        start_idx = i + 1
        break

    if mode is None:
        warnings.append("No ##XYDATA block found in JCAMP-DX.")
        return x, y, warnings

    # Two common modes:
    # - (X++(Y..Y)) : first number is X start, rest are Y values with uniform DELTAX.
    # - (XY..XY) : alternating X Y pairs.
    is_xpp = "X++" in mode

    if is_xpp and deltax is None:
        warnings.append(
            "JCAMP-DX uses X++ mode but DELTAX is missing; cannot expand X grid reliably."
        )

    for line in lines[start_idx:]:
        s = line.strip()
        if not s:
            continue
        if s.startswith("##"):
            break

        nums = _tokenize_numbers(s)
        if not nums:
            continue

        if is_xpp:
            x0 = nums[0] * xfactor
            yvals = [v * yfactor for v in nums[1:]]
            if deltax is None:
                # Best-effort: store only first point
                if yvals:
                    x.append(x0)
                    y.append(yvals[0])
                continue

            step = deltax * xfactor
            for k, yv in enumerate(yvals):
                x.append(x0 + k * step)
                y.append(yv)
        else:
            # XY pairs
            if len(nums) % 2 != 0:
                warnings.append(
                    "Odd number of numeric tokens in an XYDATA line; trailing value ignored."
                )
            for k in range(0, len(nums) - 1, 2):
                xv = nums[k] * xfactor
                yv = nums[k + 1] * yfactor
                x.append(xv)
                y.append(yv)

    return x, y, warnings


def parse_jcamp_dx(raw_text: str) -> JcampParseResult:
    # Keep parsing conservative; do not invent missing values.
    lines = raw_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    header, idx = _parse_header(lines)
    x, y, warnings = _parse_xydata(lines, idx, header)

    title = header.get("TITLE")
    x_unit = header.get("XUNITS")
    y_unit = header.get("YUNITS")

    if not x or not y:
        warnings.append("No plottable X/Y points were parsed from JCAMP-DX.")

    if len(x) != len(y):
        warnings.append("Parsed X and Y lengths differ; truncating to shortest length.")
        n = min(len(x), len(y))
        x = x[:n]
        y = y[:n]

    return JcampParseResult(
        title=title,
        x_unit=x_unit,
        y_unit=y_unit,
        x=x,
        y=y,
        warnings=warnings,
        header=header,
    )
