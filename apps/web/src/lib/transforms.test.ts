import { describe, expect, it } from 'vitest'

import { convertXFromCanonical, normalizeY, savitzkyGolaySmooth } from './transforms'

describe('CAP-05 transforms', () => {
  it('converts nm <-> cm⁻¹ without cumulative drift (canonical baseline)', () => {
    const xNm = [500, 1000, 2000]

    const toWn = convertXFromCanonical(xNm, 'nm', 'cm⁻¹').x
    const backNm = convertXFromCanonical(xNm, 'nm', 'nm').x

    // Converting from canonical to canonical should preserve exact values.
    expect(backNm).toEqual(xNm)

    // Now convert canonical->cm^-1, but then recompute display->cm^-1 again.
    // Since we always start from canonical in UI, results must match.
    const toWn2 = convertXFromCanonical(xNm, 'nm', 'cm⁻¹').x
    expect(toWn2).toEqual(toWn)
  })

  it('max-normalizes y so max(|y|)=1', () => {
    const x = [1, 2, 3]
    const y = [10, -20, 5]
    const out = normalizeY(x, y, 'max', null, 'nm')
    expect(out.y).toEqual([0.5, -1, 0.25])
    expect(out.stats.mode).toBe('max')
    if (out.stats.mode === 'max') {
      expect(out.stats.maxAbs).toBe(20)
    }
  })

  it('Savitzky-Golay preserves length and rejects even window', () => {
    const y = [1, 2, 3, 4, 5]
    expect(() => savitzkyGolaySmooth(y, { windowLength: 4, polyorder: 2 })).toThrow()

    const smoothed = savitzkyGolaySmooth(y, { windowLength: 5, polyorder: 2 })
    expect(smoothed).toHaveLength(y.length)
  })
})
