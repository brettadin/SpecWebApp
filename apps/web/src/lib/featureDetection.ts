export type FeatureMode = 'peaks' | 'dips'

export type DetectFeaturesParams = {
  mode: FeatureMode
  minProminence?: number | null
  minSeparationX?: number | null
  maxCount?: number | null
}

export type DetectedFeature = {
  feature_id: string
  center_x: number
  value_y: number
  prominence: number | null
  width: number | null
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function lerpXAtY(x0: number, y0: number, x1: number, y1: number, yTarget: number): number {
  if (!Number.isFinite(x0) || !Number.isFinite(x1)) return x0
  if (y1 === y0) return x0
  const t = (yTarget - y0) / (y1 - y0)
  return x0 + t * (x1 - x0)
}

function computeProminence(y: number[], peakIndex: number): { prominence: number; leftMin: number; rightMin: number } {
  const peak = y[peakIndex]

  let left = peakIndex
  let leftMin = peak
  while (left > 0) {
    left--
    const v = y[left]
    if (v < leftMin) leftMin = v
    if (v > peak) break
  }

  let right = peakIndex
  let rightMin = peak
  while (right < y.length - 1) {
    right++
    const v = y[right]
    if (v < rightMin) rightMin = v
    if (v > peak) break
  }

  const baseline = Math.max(leftMin, rightMin)
  const prominence = peak - baseline
  return { prominence, leftMin, rightMin }
}

function computeWidthAtLevel(x: number[], y: number[], peakIndex: number, levelY: number): number | null {
  if (x.length !== y.length) return null
  if (peakIndex <= 0 || peakIndex >= x.length - 1) return null

  // Find left crossing.
  let li = peakIndex
  while (li > 0 && y[li] > levelY) li--
  if (li === peakIndex) return null

  const xLeft = lerpXAtY(x[li], y[li], x[li + 1], y[li + 1], levelY)

  // Find right crossing.
  let ri = peakIndex
  while (ri < x.length - 1 && y[ri] > levelY) ri++
  if (ri === peakIndex) return null

  const xRight = lerpXAtY(x[ri - 1], y[ri - 1], x[ri], y[ri], levelY)

  const width = xRight - xLeft
  if (!Number.isFinite(width)) return null
  return Math.abs(width)
}

function localMaximaIndices(y: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < y.length - 1; i++) {
    const a = y[i - 1]
    const b = y[i]
    const c = y[i + 1]
    if (!isFiniteNumber(a) || !isFiniteNumber(b) || !isFiniteNumber(c)) continue
    if (b > a && b >= c) out.push(i)
  }
  return out
}

function applyMinSeparationByX(
  features: Array<{ index: number; center_x: number; prominence: number }>,
  minSeparationX: number,
): Array<{ index: number; center_x: number; prominence: number }> {
  if (!(minSeparationX > 0)) return features

  // Keep stronger peaks first, then enforce spacing.
  const sorted = [...features].sort((a, b) => b.prominence - a.prominence)
  const kept: Array<{ index: number; center_x: number; prominence: number }> = []
  for (const f of sorted) {
    if (kept.every((k) => Math.abs(k.center_x - f.center_x) >= minSeparationX)) {
      kept.push(f)
    }
  }

  // Return in ascending X order for stable tables.
  return kept.sort((a, b) => a.center_x - b.center_x)
}

export function detectFeatures(x: number[], y: number[], params: DetectFeaturesParams): DetectedFeature[] {
  if (x.length !== y.length) throw new Error('x/y length mismatch')
  if (x.length < 3) return []

  const mode: FeatureMode = params.mode
  const yWork = mode === 'dips' ? y.map((v) => -v) : y

  const rawPeaks = localMaximaIndices(yWork)

  const enriched = rawPeaks
    .map((idx) => {
      const { prominence } = computeProminence(yWork, idx)
      return { index: idx, center_x: x[idx], prominence }
    })
    .filter((p) => isFiniteNumber(p.center_x) && isFiniteNumber(p.prominence))

  const minProm = params.minProminence
  const filteredByProm =
    typeof minProm === 'number' && Number.isFinite(minProm) ? enriched.filter((p) => p.prominence >= minProm) : enriched

  const minSep = params.minSeparationX
  const separated =
    typeof minSep === 'number' && Number.isFinite(minSep) ? applyMinSeparationByX(filteredByProm, minSep) : filteredByProm

  const maxCount = params.maxCount
  const limited = typeof maxCount === 'number' && maxCount > 0 ? separated.slice(0, maxCount) : separated

  return limited.map((p) => {
    const peakYWork = yWork[p.index]
    const peakY = y[p.index]

    const prom = computeProminence(yWork, p.index).prominence
    const relHeight = 0.5
    const levelY = peakYWork - prom * relHeight
    const width = prom > 0 ? computeWidthAtLevel(x, yWork, p.index, levelY) : null

    return {
      feature_id: `feat-${p.index}-${Math.round(p.center_x * 1e9)}`,
      center_x: p.center_x,
      value_y: peakY,
      prominence: Number.isFinite(prom) ? prom : null,
      width,
    }
  })
}
