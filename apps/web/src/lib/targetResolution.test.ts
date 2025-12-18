import { describe, expect, it } from 'vitest'

import { loadTargetResolutionCache, parseRaDecDegrees, saveTargetResolutionCache } from './targetResolution'

describe('parseRaDecDegrees', () => {
  it('parses a comma-separated pair', () => {
    expect(parseRaDecDegrees('83.6331, -5.3911')).toEqual({ ra: 83.6331, dec: -5.3911 })
  })

  it('parses an ra/dec labeled pair and wraps RA', () => {
    expect(parseRaDecDegrees('ra=370 dec=10')).toEqual({ ra: 10, dec: 10 })
  })

  it('rejects out-of-range declination', () => {
    expect(parseRaDecDegrees('10 120')).toBe(null)
  })
})

describe('target resolution cache', () => {
  it('round-trips a cache entry', () => {
    saveTargetResolutionCache('Sirius', {
      retrieved_at: '2025-12-17T00:00:00Z',
      candidates: [{ label: 'Sirius', ra: 101.287, dec: -16.716 }],
    })

    expect(loadTargetResolutionCache('sirius')).toEqual({
      retrieved_at: '2025-12-17T00:00:00Z',
      candidates: [{ label: 'Sirius', ra: 101.287, dec: -16.716 }],
    })
  })
})
