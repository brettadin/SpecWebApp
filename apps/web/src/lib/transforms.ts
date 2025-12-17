export type DisplayXUnit = 'as-imported' | 'nm' | 'Å' | 'µm' | 'cm⁻¹'

export type NormalizationMode = 'none' | 'max' | 'min-max' | 'z-score' | 'area'

export type BaselineMode = 'none' | 'poly'

export type SmoothingMode = 'none' | 'savgol'

export type AlignmentMethod = 'none' | 'nearest' | 'linear' | 'pchip'

export type DifferentialOp = 'A-B' | 'A/B'

export type RatioHandling = 'mask'

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

export function convertXToCanonical(
  xDisplay: number[],
  canonicalUnit: string | null,
  displayUnit: DisplayXUnit,
): { x: number[]; unitLabel: string } {
  const canonical = normalizeXUnit(canonicalUnit)
  if (!canonical) {
    throw new Error('X unit is unknown; set X unit in dataset metadata before converting.')
  }

  if (displayUnit === 'as-imported') {
    return { x: xDisplay, unitLabel: canonical }
  }

  if (canonical === displayUnit) {
    return { x: xDisplay, unitLabel: canonical }
  }

  const out = new Array<number>(xDisplay.length)
  for (let i = 0; i < xDisplay.length; i++) {
    const v = xDisplay[i]
    // display => nm
    const nm = mapToNm(v, displayUnit)
    // nm => canonical
    out[i] = mapFromNm(nm, canonical)
  }
  return { x: out, unitLabel: canonical }
}

export function convertXScalarToCanonical(
  valueDisplay: number,
  canonicalUnit: string | null,
  displayUnit: DisplayXUnit,
): number {
  return convertXToCanonical([valueDisplay], canonicalUnit, displayUnit).x[0]
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

function isMonotoneIncreasing(x: number[]): boolean {
  for (let i = 1; i < x.length; i++) {
    if (x[i] < x[i - 1]) return false
  }
  return true
}

function overlapRange(a: number[], b: number[]): { lo: number; hi: number } | null {
  if (!a.length || !b.length) return null
  const lo = Math.max(a[0], b[0])
  const hi = Math.min(a[a.length - 1], b[b.length - 1])
  if (!(lo <= hi)) return null
  return { lo, hi }
}

function lowerBound(x: number[], value: number): number {
  let lo = 0
  let hi = x.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (x[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

function interpNearest(x: number[], y: number[], xq: number): number {
  const i = lowerBound(x, xq)
  if (i <= 0) return y[0]
  if (i >= x.length) return y[x.length - 1]
  const left = i - 1
  const right = i
  return Math.abs(xq - x[left]) <= Math.abs(xq - x[right]) ? y[left] : y[right]
}

function interpLinear(x: number[], y: number[], xq: number): number {
  const i = lowerBound(x, xq)
  if (i <= 0) return y[0]
  if (i >= x.length) return y[x.length - 1]
  const x0 = x[i - 1]
  const x1 = x[i]
  const y0 = y[i - 1]
  const y1 = y[i]
  if (x1 === x0) return y0
  const t = (xq - x0) / (x1 - x0)
  return y0 + t * (y1 - y0)
}

function pchipSlopes(x: number[], y: number[]): number[] {
  // Fritsch–Carlson monotone cubic Hermite slopes.
  const n = x.length
  const h = new Array<number>(n - 1)
  const d = new Array<number>(n - 1)
  for (let i = 0; i < n - 1; i++) {
    h[i] = x[i + 1] - x[i]
    d[i] = (y[i + 1] - y[i]) / h[i]
  }

  const m = new Array<number>(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]

  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] === 0 || d[i] === 0 || (d[i - 1] > 0) !== (d[i] > 0)) {
      m[i] = 0
      continue
    }
    const w1 = 2 * h[i] + h[i - 1]
    const w2 = h[i] + 2 * h[i - 1]
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
  }

  return m
}

function interpPchip(x: number[], y: number[], m: number[], xq: number): number {
  const i = lowerBound(x, xq)
  const idx = clampIndex(i - 1, 0, x.length - 2)
  const x0 = x[idx]
  const x1 = x[idx + 1]
  const h = x1 - x0
  if (h === 0) return y[idx]

  const t = (xq - x0) / h
  const t2 = t * t
  const t3 = t2 * t

  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2

  return h00 * y[idx] + h10 * h * m[idx] + h01 * y[idx + 1] + h11 * h * m[idx + 1]
}

export function alignToTargetGrid(
  sourceX: number[],
  sourceY: number[],
  targetX: number[],
  method: AlignmentMethod,
  overlapOnly: boolean,
): { yAligned: number[]; interpolated: boolean; overlap: { lo: number; hi: number } | null } {
  if (sourceX.length !== sourceY.length) throw new Error('Alignment requires matching source x/y lengths.')
  if (!isMonotoneIncreasing(sourceX)) throw new Error('Alignment requires monotone increasing X.')
  if (!isMonotoneIncreasing(targetX)) throw new Error('Alignment requires monotone increasing target X.')

  const overlap = overlapRange(targetX, sourceX)
  if (overlapOnly && !overlap) {
    return { yAligned: targetX.map(() => Number.NaN), interpolated: method !== 'none', overlap: null }
  }

  const lo = overlap?.lo ?? -Infinity
  const hi = overlap?.hi ?? Infinity

  const out = new Array<number>(targetX.length)

  if (method === 'none') {
    // Exact join only.
    const sourceIndex = new Map<number, number>()
    for (let i = 0; i < sourceX.length; i++) sourceIndex.set(sourceX[i], i)
    for (let i = 0; i < targetX.length; i++) {
      const xv = targetX[i]
      if (overlapOnly && (xv < lo || xv > hi)) {
        out[i] = Number.NaN
        continue
      }
      const idx = sourceIndex.get(xv)
      out[i] = idx == null ? Number.NaN : sourceY[idx]
    }
    return { yAligned: out, interpolated: false, overlap }
  }

  const pchipM = method === 'pchip' ? pchipSlopes(sourceX, sourceY) : null

  for (let i = 0; i < targetX.length; i++) {
    const xv = targetX[i]
    if (overlapOnly && (xv < lo || xv > hi)) {
      out[i] = Number.NaN
      continue
    }
    // no extrapolation by default
    if (xv < sourceX[0] || xv > sourceX[sourceX.length - 1]) {
      out[i] = Number.NaN
      continue
    }

    if (method === 'nearest') out[i] = interpNearest(sourceX, sourceY, xv)
    else if (method === 'linear') out[i] = interpLinear(sourceX, sourceY, xv)
    else out[i] = interpPchip(sourceX, sourceY, pchipM as number[], xv)
  }

  return { yAligned: out, interpolated: true, overlap }
}

export function differentialCompare(
  a: { x: number[]; y: number[] },
  b: { x: number[]; y: number[] },
  op: DifferentialOp,
  alignment: { method: AlignmentMethod; target: 'A' | 'B' },
  ratio: { handling: RatioHandling; tau: number | null },
): {
  x: number[]
  y: number[]
  warnings: string[]
  interpolated: boolean
  overlap: { lo: number; hi: number } | null
  ratioMask: { tau: number; maskedCount: number } | null
} {
  const warnings: string[] = []
  if (!isMonotoneIncreasing(a.x) || !isMonotoneIncreasing(b.x)) {
    throw new Error('Non-monotonic X detected; fix upstream ingest or metadata before comparing.')
  }

  const overlap = overlapRange(a.x, b.x)
  if (!overlap) {
    throw new Error('No overlapping X range between A and B. Differential comparison requires overlap.')
  }

  const targetX = alignment.target === 'A' ? a.x : b.x
  const other = alignment.target === 'A' ? b : a

  const alignedOther = alignToTargetGrid(other.x, other.y, targetX, alignment.method, false)
  // Self is already on target grid by definition.

  if (alignment.method === 'none') {
    // CAP-06: alignment is opt-in. Without alignment, require exact X matches for all points we would compute.
    const otherIndex = new Set<number>(other.x)
    for (const xv of targetX) {
      if (xv < overlap.lo || xv > overlap.hi) continue
      if (!otherIndex.has(xv)) {
        throw new Error('X grids differ. Enable alignment (interpolation) or select compatible traces.')
      }
    }
  }

  const yOut = new Array<number>(targetX.length)
  const interpolated = alignedOther.interpolated

  let ratioMask: { tau: number; maskedCount: number } | null = null

  if (op === 'A-B') {
    const yA = alignment.target === 'A' ? a.y : alignedOther.yAligned
    const yB = alignment.target === 'A' ? alignedOther.yAligned : b.y
    for (let i = 0; i < yOut.length; i++) {
      const va = yA[i]
      const vb = yB[i]
      const xv = targetX[i]
      if (xv < overlap.lo || xv > overlap.hi) {
        yOut[i] = Number.NaN
      } else {
        yOut[i] = Number.isFinite(va) && Number.isFinite(vb) ? va - vb : Number.NaN
      }
    }
  } else {
    const yA = alignment.target === 'A' ? a.y : alignedOther.yAligned
    const yB = alignment.target === 'A' ? alignedOther.yAligned : b.y

    let maxAbsB = 0
    for (const v of yB) {
      if (!Number.isFinite(v)) continue
      maxAbsB = Math.max(maxAbsB, Math.abs(v))
    }
    const tau = ratio.tau != null ? ratio.tau : Math.max(1e-12, 1e-6 * maxAbsB)

    let maskedCount = 0
    for (let i = 0; i < yOut.length; i++) {
      const xv = targetX[i]
      if (xv < overlap.lo || xv > overlap.hi) {
        yOut[i] = Number.NaN
        continue
      }
      const va = yA[i]
      const vb = yB[i]
      if (!Number.isFinite(va) || !Number.isFinite(vb)) {
        yOut[i] = Number.NaN
        continue
      }
      if (Math.abs(vb) < tau) {
        yOut[i] = Number.NaN
        maskedCount++
        continue
      }
      yOut[i] = va / vb
    }
    if (maskedCount > 0) {
      warnings.push(`Ratio masked where |B| < τ (τ=${tau}).`)
      ratioMask = { tau, maskedCount }
    }
  }

  if (interpolated) warnings.push('Interpolated alignment used (explicit).')

  return {
    x: targetX,
    y: yOut,
    warnings,
    interpolated,
    overlap,
    ratioMask,
  }
}
