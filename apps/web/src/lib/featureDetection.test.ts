import { describe, expect, it } from 'vitest'

import { detectFeatures } from './featureDetection'

describe('CAP-09 feature detection', () => {
  it('detects simple peaks with prominence', () => {
    const x = [0, 1, 2, 3, 4]
    const y = [0, 1, 0, 2, 0]
    const out = detectFeatures(x, y, { mode: 'peaks', minProminence: 0.5, minSeparationX: null, maxCount: null })
    expect(out.map((f) => f.center_x)).toEqual([1, 3])
    expect(out[0].prominence).toBeGreaterThan(0)
    expect(out[1].prominence).toBeGreaterThan(0)
  })

  it('detects dips by inverting y', () => {
    const x = [0, 1, 2, 3, 4]
    const y = [1, 0, 1, -1, 1]
    const out = detectFeatures(x, y, { mode: 'dips', minProminence: 0.5, minSeparationX: null, maxCount: null })
    expect(out.map((f) => f.center_x)).toEqual([1, 3])
    // value_y should reflect original y at the dip.
    expect(out[0].value_y).toBe(0)
    expect(out[1].value_y).toBe(-1)
  })

  it('enforces minimum separation in x', () => {
    const x = [0, 1, 2, 3, 4]
    const y = [0, 2, 0, 1.5, 0]
    const out = detectFeatures(x, y, { mode: 'peaks', minProminence: 0.1, minSeparationX: 3, maxCount: null })
    // Peaks at x=1 and x=3 are within 3; keep strongest only.
    expect(out).toHaveLength(1)
    expect(out[0].center_x).toBe(1)
  })
})
