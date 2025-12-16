export type DisplayXUnit = 'as-imported' | 'nm' | 'Å' | 'µm' | 'cm⁻¹'

export type NormalizationMode = 'none' | 'max' | 'min-max' | 'z-score' | 'area'

export type BaselineMode = 'none' | 'poly'

export type SmoothingMode = 'none' | 'savgol'

export type XUnitCanonical = 'nm' | 'Å' | 'µm' | 'cm⁻¹'

export function normalizeXUnit(unit: string | null): XUnitCanonical | null {
  const u = (unit ?? '').trim()
  if (!u) return null

  const lower = u.toLowerCase()
  if (lower === 'nm' || lower === 'nanometer' || lower === 'nanometers') return 'nm'
  if (u === 'Å' || lower === 'a' || lower === 'angstrom' || lower === 'angstroms' || lower === 'å') return 'Å'
  if (u === 'µm' || lower === 'um' || lower === 'micron' || lower === 'microns') return 'µm'
  if (
    u === 'cm⁻¹' ||
    lower === 'cm-1' ||
    lower === 'cm^-1' ||
    lower === 'cm⁻¹' ||
    lower === 'wavenumber' ||
    lower === 'wavenumbers'
  )
    return 'cm⁻¹'

  return null
}

function mapToNm(value: number, unit: XUnitCanonical): number {
  if (unit === 'nm') return value
  if (unit === 'Å') return value / 10
  if (unit === 'µm') return value * 1000
  // cm⁻¹ => nm
  return 1e7 / value
}

function mapFromNm(valueNm: number, unit: XUnitCanonical): number {
  if (unit === 'nm') return valueNm
  if (unit === 'Å') return valueNm * 10
  if (unit === 'µm') return valueNm / 1000
  // nm => cm⁻¹
  return 1e7 / valueNm
}

export function convertXFromCanonical(
  xCanonical: number[],
  canonicalUnit: string | null,
  displayUnit: DisplayXUnit,
): { x: number[]; unitLabel: string } {
  const canonical = normalizeXUnit(canonicalUnit)
  if (displayUnit === 'as-imported') {
    return { x: xCanonical, unitLabel: canonical ?? 'unknown' }
  }

  if (!canonical) {
    throw new Error('X unit is unknown; set X unit in dataset metadata before converting.')
  }

  if (canonical === displayUnit) {
    return { x: xCanonical, unitLabel: displayUnit }
  }

  const out = new Array<number>(xCanonical.length)
  for (let i = 0; i < xCanonical.length; i++) {
    const v = xCanonical[i]
    const nm = mapToNm(v, canonical)
    out[i] = mapFromNm(nm, displayUnit)
  }
  return { x: out, unitLabel: displayUnit }
}

export function convertXScalarFromCanonical(
  valueCanonical: number,
  canonicalUnit: string | null,
  displayUnit: DisplayXUnit,
): number {
  return convertXFromCanonical([valueCanonical], canonicalUnit, displayUnit).x[0]
}

export type RangeSelection = {
  x0: number | null
  x1: number | null
  unit: DisplayXUnit
  method: 'manual'
}

export type NormalizationStats =
  | { mode: 'none' }
  | { mode: 'max'; maxAbs: number }
  | { mode: 'min-max'; min: number; max: number }
  | { mode: 'z-score'; mean: number; std: number }
  | { mode: 'area'; areaAbs: number }

function clampIndex(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function findIndexRange(x: number[], x0: number, x1: number): { start: number; end: number } {
  const lo = Math.min(x0, x1)
  const hi = Math.max(x0, x1)

  let start = 0
  while (start < x.length && x[start] < lo) start++

  let end = x.length - 1
  while (end >= 0 && x[end] > hi) end--

  start = clampIndex(start, 0, Math.max(0, x.length - 1))
  end = clampIndex(end, 0, Math.max(0, x.length - 1))
  if (end < start) return { start: 0, end: x.length - 1 }
  return { start, end }
}

function mean(values: number[]): number {
  if (!values.length) return 0
  let s = 0
  for (const v of values) s += v
  return s / values.length
}

function std(values: number[], valuesMean: number): number {
  if (values.length < 2) return 0
  let s = 0
  for (const v of values) {
    const d = v - valuesMean
    s += d * d
  }
  return Math.sqrt(s / (values.length - 1))
}

function trapezoidAbsArea(x: number[], y: number[]): number {
  if (x.length < 2) return 0
  let area = 0
  for (let i = 1; i < x.length; i++) {
    const dx = x[i] - x[i - 1]
    const a = Math.abs(y[i - 1])
    const b = Math.abs(y[i])
    area += 0.5 * (a + b) * dx
  }
  return Math.abs(area)
}

export function normalizeY(
  xCanonical: number[],
  y: number[],
  mode: NormalizationMode,
  selection: RangeSelection | null,
  canonicalXUnit: string | null,
): { y: number[]; stats: NormalizationStats; usedSelection: RangeSelection | null } {
  if (mode === 'none') return { y, stats: { mode: 'none' }, usedSelection: selection }

  let ySlice = y
  let xSlice = xCanonical

  if (selection && selection.x0 != null && selection.x1 != null) {
    const xDisplay = convertXFromCanonical(xCanonical, canonicalXUnit, selection.unit).x
    const { start, end } = findIndexRange(xDisplay, selection.x0, selection.x1)
    ySlice = y.slice(start, end + 1)
    xSlice = xCanonical.slice(start, end + 1)
  }

  if (!ySlice.length) {
    throw new Error('Normalization range contains no points.')
  }

  if (mode === 'max') {
    let maxAbs = 0
    for (const v of ySlice) maxAbs = Math.max(maxAbs, Math.abs(v))
    if (!Number.isFinite(maxAbs) || maxAbs === 0) {
      throw new Error('Cannot max-normalize a constant or empty trace (max(|y|) is 0).')
    }
    return {
      y: y.map((v) => v / maxAbs),
      stats: { mode: 'max', maxAbs },
      usedSelection: selection,
    }
  }

  if (mode === 'min-max') {
    let minV = Infinity
    let maxV = -Infinity
    for (const v of ySlice) {
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }
    if (!Number.isFinite(minV) || !Number.isFinite(maxV) || maxV === minV) {
      throw new Error('Cannot min-max scale a constant trace (max(y) equals min(y)).')
    }
    const span = maxV - minV
    return {
      y: y.map((v) => (v - minV) / span),
      stats: { mode: 'min-max', min: minV, max: maxV },
      usedSelection: selection,
    }
  }

  if (mode === 'z-score') {
    const m = mean(ySlice)
    const s = std(ySlice, m)
    if (!Number.isFinite(s) || s === 0) {
      throw new Error('Cannot z-score a constant trace (std is 0).')
    }
    return {
      y: y.map((v) => (v - m) / s),
      stats: { mode: 'z-score', mean: m, std: s },
      usedSelection: selection,
    }
  }

  if (mode === 'area') {
    const area = trapezoidAbsArea(xSlice, ySlice)
    if (!Number.isFinite(area) || area === 0) {
      throw new Error('Cannot area-normalize a trace with zero absolute area in the selected range.')
    }
    return {
      y: y.map((v) => v / area),
      stats: { mode: 'area', areaAbs: area },
      usedSelection: selection,
    }
  }

  return { y, stats: { mode: 'none' }, usedSelection: selection }
}

export type PolynomialBaselineParams = {
  order: number
}

function solveLinearSystem(a: number[][], b: number[]): number[] {
  // Gaussian elimination with partial pivoting.
  const n = b.length
  const m = a.map((row) => row.slice())
  const x = b.slice()

  for (let col = 0; col < n; col++) {
    // Pivot
    let pivotRow = col
    let pivotAbs = Math.abs(m[col][col])
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(m[r][col])
      if (v > pivotAbs) {
        pivotAbs = v
        pivotRow = r
      }
    }

    if (pivotAbs === 0 || !Number.isFinite(pivotAbs)) {
      throw new Error('Baseline fit failed (singular matrix).')
    }

    if (pivotRow !== col) {
      ;[m[col], m[pivotRow]] = [m[pivotRow], m[col]]
      ;[x[col], x[pivotRow]] = [x[pivotRow], x[col]]
    }

    const pivot = m[col][col]
    for (let c = col; c < n; c++) m[col][c] /= pivot
    x[col] /= pivot

    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = m[r][col]
      if (factor === 0) continue
      for (let c = col; c < n; c++) {
        m[r][c] -= factor * m[col][c]
      }
      x[r] -= factor * x[col]
    }
  }

  return x
}

function polyFit(x: number[], y: number[], order: number): number[] {
  const n = order + 1
  const ata: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  const atb: number[] = Array.from({ length: n }, () => 0)

  for (let i = 0; i < x.length; i++) {
    const xi = x[i]
    const yi = y[i]
    const powers: number[] = [1]
    for (let p = 1; p < n; p++) powers[p] = powers[p - 1] * xi

    for (let r = 0; r < n; r++) {
      atb[r] += powers[r] * yi
      for (let c = 0; c < n; c++) {
        ata[r][c] += powers[r] * powers[c]
      }
    }
  }

  return solveLinearSystem(ata, atb)
}

function polyEval(coeffs: number[], x: number): number {
  let out = 0
  let p = 1
  for (const c of coeffs) {
    out += c * p
    p *= x
  }
  return out
}

export function baselineCorrectPolynomial(
  x: number[],
  y: number[],
  params: PolynomialBaselineParams,
): { corrected: number[]; baseline: number[] } {
  const order = Math.max(0, Math.min(6, Math.floor(params.order)))
  if (x.length !== y.length) throw new Error('Baseline correction requires matching x/y lengths.')
  if (x.length < order + 2) throw new Error('Baseline correction requires more points than polynomial order.')

  const coeffs = polyFit(x, y, order)
  const baseline = x.map((xi) => polyEval(coeffs, xi))
  const corrected = y.map((v, i) => v - baseline[i])
  return { corrected, baseline }
}

export type SavitzkyGolayParams = {
  windowLength: number
  polyorder: number
}

function invertMatrix(mat: number[][]): number[][] {
  const n = mat.length
  const a = mat.map((row) => row.slice())
  const inv: number[][] = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => (r === c ? 1 : 0)),
  )

  for (let col = 0; col < n; col++) {
    let pivotRow = col
    let pivotAbs = Math.abs(a[col][col])
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(a[r][col])
      if (v > pivotAbs) {
        pivotAbs = v
        pivotRow = r
      }
    }

    if (pivotAbs === 0 || !Number.isFinite(pivotAbs)) {
      throw new Error('Smoothing failed (singular matrix).')
    }

    if (pivotRow !== col) {
      ;[a[col], a[pivotRow]] = [a[pivotRow], a[col]]
      ;[inv[col], inv[pivotRow]] = [inv[pivotRow], inv[col]]
    }

    const pivot = a[col][col]
    for (let c = 0; c < n; c++) {
      a[col][c] /= pivot
      inv[col][c] /= pivot
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = a[r][col]
      if (factor === 0) continue
      for (let c = 0; c < n; c++) {
        a[r][c] -= factor * a[col][c]
        inv[r][c] -= factor * inv[col][c]
      }
    }
  }

  return inv
}

function multiplyMatrixVector(a: number[][], v: number[]): number[] {
  return a.map((row) => {
    let s = 0
    for (let i = 0; i < v.length; i++) s += row[i] * v[i]
    return s
  })
}

export function savitzkyGolaySmooth(y: number[], params: SavitzkyGolayParams): number[] {
  const wl = Math.floor(params.windowLength)
  const p = Math.floor(params.polyorder)

  if (wl < 3 || wl % 2 === 0) throw new Error('Savitzky-Golay window length must be an odd integer >= 3.')
  if (p < 0 || p >= wl) throw new Error('Savitzky-Golay polyorder must be >= 0 and < window length.')

  const m = (wl - 1) / 2

  // Design matrix A: rows for k=-m..m, columns for k^j, j=0..p
  const a: number[][] = []
  for (let k = -m; k <= m; k++) {
    const row: number[] = []
    let pow = 1
    for (let j = 0; j <= p; j++) {
      row.push(pow)
      pow *= k
    }
    a.push(row)
  }

  // Compute coefficients c = A * ( (A^T A)^{-1} * e0 )
  const atA: number[][] = Array.from({ length: p + 1 }, () => Array.from({ length: p + 1 }, () => 0))
  for (let r = 0; r <= p; r++) {
    for (let c = 0; c <= p; c++) {
      let s = 0
      for (let i = 0; i < a.length; i++) s += a[i][r] * a[i][c]
      atA[r][c] = s
    }
  }

  const invAtA = invertMatrix(atA)
  const e0 = Array.from({ length: p + 1 }, (_, i) => (i === 0 ? 1 : 0))
  const v = multiplyMatrixVector(invAtA, e0)
  const coeffs = a.map((row) => {
    let s = 0
    for (let i = 0; i < v.length; i++) s += row[i] * v[i]
    return s
  })

  const out = new Array<number>(y.length)
  for (let i = 0; i < y.length; i++) {
    let acc = 0
    for (let j = -m; j <= m; j++) {
      const idx = clampIndex(i + j, 0, y.length - 1)
      acc += y[idx] * coeffs[j + m]
    }
    out[i] = acc
  }
  return out
}
