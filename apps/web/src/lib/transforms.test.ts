import { describe, expect, it } from 'vitest'

import {
  convertXFromCanonical,
  convertXScalarToCanonical,
  differentialCompare,
  normalizeY,
  savitzkyGolaySmooth,
} from './transforms'

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

  it('converts display x back to canonical', () => {
    const xCanonical = 500
    const xDisplay = convertXFromCanonical([xCanonical], 'nm', 'cm⁻¹').x[0]
    const back = convertXScalarToCanonical(xDisplay, 'nm', 'cm⁻¹')
    expect(back).toBeCloseTo(xCanonical, 8)
  })

  it('rejects non-finite cm⁻¹ conversions (division by zero)', () => {
    expect(() => convertXFromCanonical([0], 'cm⁻¹', 'nm')).toThrow()
    expect(() => convertXScalarToCanonical(0, 'nm', 'cm⁻¹')).toThrow()
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

describe('CAP-06 differential comparison', () => {
  it('computes A-B on identical grids', () => {
    const x = [1, 2, 3]
    const a = { x, y: [10, 20, 30] }
    const b = { x, y: [1, 2, 3] }
    const out = differentialCompare(a, b, 'A-B', { method: 'none', target: 'A' }, { handling: 'mask', tau: null })
    expect(out.y).toEqual([9, 18, 27])
    expect(out.interpolated).toBe(false)
  })

  it('refuses mismatched grids when alignment is off', () => {
    const a = { x: [1, 2, 3], y: [10, 20, 30] }
    const b = { x: [1, 2.5, 3], y: [1, 2, 3] }
    expect(() =>
      differentialCompare(a, b, 'A-B', { method: 'none', target: 'A' }, { handling: 'mask', tau: null }),
    ).toThrow()
  })

  it('computes A/B with masking near zero', () => {
    const x = [1, 2, 3]
    const a = { x, y: [10, 20, 30] }
    const b = { x, y: [1, 0, 3] }
    const out = differentialCompare(a, b, 'A/B', { method: 'none', target: 'A' }, { handling: 'mask', tau: 0.5 })
    expect(Number.isFinite(out.y[0])).toBe(true)
    expect(Number.isNaN(out.y[1])).toBe(true)
    expect(out.y[2]).toBeCloseTo(10)
  })

  it('computes with linear alignment on overlap only', () => {
    const a = { x: [1, 2, 3, 4], y: [10, 20, 30, 40] }
    const b = { x: [2, 3, 4, 5], y: [2, 3, 4, 5] }
    const out = differentialCompare(a, b, 'A-B', { method: 'linear', target: 'A' }, { handling: 'mask', tau: null })
    expect(out.interpolated).toBe(true)
    // Outside overlap (x=1) should be NaN
    expect(Number.isNaN(out.y[0])).toBe(true)
    // Within overlap at x=2,3,4 should be finite
    expect(Number.isFinite(out.y[1])).toBe(true)
    expect(Number.isFinite(out.y[2])).toBe(true)
    expect(Number.isFinite(out.y[3])).toBe(true)
  })
})
