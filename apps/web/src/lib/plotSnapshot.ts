import type {
  AlignmentMethod,
  BaselineMode,
  DifferentialOp,
  DisplayXUnit,
  RatioHandling,
  SmoothingMode,
} from './transforms'

export type TraceState = {
  datasetId: string
  visible: boolean
}

export type TransformRecord = {
  transform_id: string
  parent_trace_id: string
  transform_type: 'normalize' | 'baseline' | 'smooth' | 'unit_display' | 'resample' | 'differential'
  parameters: Record<string, unknown>
  created_at: string
  created_by: string
  output_trace_id: string
}

export type DerivedTrace = {
  traceId: string
  parentDatasetId: string
  name: string
  x: number[]
  y: number[]
  x_unit: string | null
  y_unit: string | null
  visible: boolean
  provenance: TransformRecord[]
  trust: { interpolated: boolean }
}

export type PlotSnapshotV1 = {
  version: 1
  kind: 'plot'
  captured_at: string
  state: {
    traceStates: TraceState[]
    derivedTraces: DerivedTrace[]
    displayXUnit: DisplayXUnit
    normalizeDisplayY?: boolean
    showAnnotations: boolean
    filter: string
    plotlyRelayout: Record<string, unknown> | null

    // CAP-03 overlay/trace management UI state (optional for backward-compatible restore)
    fastViewEnabled?: boolean
    detailedTooltips?: boolean
    collapsedDerived?: boolean
    derivedExpanded?: boolean
    aliasByDatasetId?: Record<string, string>
    aliasByDerivedId?: Record<string, string>

    selectedTransformDatasetIds: string[]
    baselineMode: BaselineMode
    baselineOrder: string
    includeBaselineTrace: boolean
    smoothingMode: SmoothingMode
    savgolWindow: string
    savgolPolyorder: string

    diffA: string
    diffB: string
    diffLockA: boolean
    diffLockB: boolean
    diffOp: DifferentialOp
    diffAlignmentEnabled: boolean
    diffAlignmentMethod: AlignmentMethod
    diffTargetGrid: 'A' | 'B'
    diffRatioHandling: RatioHandling
    diffTau: string
  }
}

export function buildPlotSnapshotV1(args: Omit<PlotSnapshotV1, 'version' | 'kind' | 'captured_at'> & { captured_at?: string }): PlotSnapshotV1 {
  return {
    version: 1,
    kind: 'plot',
    captured_at: args.captured_at ?? new Date().toISOString(),
    state: args.state,
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export function coercePlotSnapshotV1(payload: unknown): PlotSnapshotV1 | null {
  if (!isRecord(payload)) return null
  if (payload.version !== 1) return null
  if (payload.kind !== 'plot') return null
  if (!isRecord(payload.state)) return null

  const captured_at = typeof payload.captured_at === 'string' ? payload.captured_at : ''
  if (!captured_at.trim()) return null

  // Minimal structural validation; keep this permissive so we can evolve without breaking restore.
  const state = payload.state as Record<string, unknown>
  if (!Array.isArray(state.traceStates)) return null
  if (!Array.isArray(state.derivedTraces)) return null

  return payload as PlotSnapshotV1
}
