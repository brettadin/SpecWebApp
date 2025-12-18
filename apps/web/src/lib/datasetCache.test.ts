import { describe, expect, it } from 'vitest'

import { loadCachedDatasets, saveCachedDatasets } from './datasetCache'

describe('datasetCache', () => {
  it('round-trips cached datasets', () => {
    saveCachedDatasets([
      { id: 'a', name: 'Alpha', created_at: '2025-12-17T00:00:00Z' },
      { id: 'b', name: '', created_at: '2025-12-17T00:00:01Z' },
    ])

    expect(loadCachedDatasets()).toEqual([
      { id: 'a', name: 'Alpha', created_at: '2025-12-17T00:00:00Z' },
      { id: 'b', name: 'b', created_at: '2025-12-17T00:00:01Z' },
    ])
  })
})
