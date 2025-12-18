import { describe, expect, it } from 'vitest'

import { buildPlotSnapshotV1, coercePlotSnapshotV1 } from './plotSnapshot'

describe('plotSnapshot', () => {
  it('round-trips a minimal snapshot payload', () => {
    const snap = buildPlotSnapshotV1({
      captured_at: '2025-12-17T00:00:00.000Z',
      state: {
        traceStates: [{ datasetId: 'ds1', visible: true }],
        derivedTraces: [],
        displayXUnit: 'as-imported',
        showAnnotations: false,
        filter: '',
        plotlyRelayout: null,

        selectedTransformDatasetIds: [],
        normMode: 'none',
        normRangeX0: '',
        normRangeX1: '',
        baselineMode: 'none',
        baselineOrder: '1',
        includeBaselineTrace: false,
        smoothingMode: 'none',
        savgolWindow: '9',
        savgolPolyorder: '2',

        diffA: '',
        diffB: '',
        diffLockA: false,
        diffLockB: false,
        diffOp: 'A-B',
        diffAlignmentEnabled: false,
        diffAlignmentMethod: 'linear',
        diffTargetGrid: 'A',
        diffRatioHandling: 'mask',
        diffTau: '',
      },
    })

    const coerced = coercePlotSnapshotV1(snap)
    expect(coerced).toEqual(snap)
  })

  it('rejects non-snapshot payloads', () => {
    expect(coercePlotSnapshotV1(null)).toBeNull()
    expect(coercePlotSnapshotV1({})).toBeNull()
    expect(coercePlotSnapshotV1({ version: 2, kind: 'plot', captured_at: 'x', state: {} })).toBeNull()
  })
})
