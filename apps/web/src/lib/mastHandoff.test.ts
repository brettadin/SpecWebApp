import { describe, expect, it } from 'vitest'

import { buildMastHandoffUrl, loadMastHandoffPrefs, saveMastHandoffPrefs } from './mastHandoff'

describe('mastHandoff', () => {
  it('builds a URL with required params', () => {
    const url = buildMastHandoffUrl({ target: 'M42', autoSearch: true, token: 't1' })
    expect(url).toContain('/plot?')
    expect(url).toContain('mastTarget=M42')
    expect(url).toContain('mastAutoSearch=1')
    expect(url).toContain('mastToken=t1')
  })

  it('includes prefs when provided', () => {
    const url = buildMastHandoffUrl({
      target: '83.6331 -5.3911',
      autoSearch: true,
      token: 't2',
      prefs: { radiusDeg: 0.2, mission: 'JWST', dataType: 'spectrum' },
    })

    expect(url).toContain('mastRadius=0.2')
    expect(url).toContain('mastMission=JWST')
    expect(url).toContain('mastDataType=spectrum')
  })

  it('load/save roundtrips (best effort)', () => {
    localStorage.clear()
    saveMastHandoffPrefs({ radiusDeg: 0.3, mission: 'HST', dataType: 'cube' })
    expect(loadMastHandoffPrefs()).toEqual({ radiusDeg: 0.3, mission: 'HST', dataType: 'cube' })
  })
})
