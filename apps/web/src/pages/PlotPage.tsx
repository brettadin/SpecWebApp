import { useCallback, useEffect, useMemo, useState } from 'react'
import Plot, { type PlotParams } from 'react-plotly.js'

import {
  baselineCorrectPolynomial,
  convertXFromCanonical,
  convertXScalarFromCanonical,
  convertXScalarToCanonical,
  normalizeXUnit,
  normalizeY,
  savitzkyGolaySmooth,
  type BaselineMode,
  type DisplayXUnit,
  type NormalizationMode,
  type RangeSelection,
  type SmoothingMode,
  differentialCompare,
  type AlignmentMethod,
  type DifferentialOp,
  type RatioHandling,
} from '../lib/transforms'

import { detectFeatures, type DetectedFeature, type FeatureMode } from '../lib/featureDetection'

type DatasetSummary = {
  id: string
  name: string
  created_at: string
  source_file_name: string
  sha256: string
  reference?: {
    data_type?: string
    source_name?: string
    source_url?: string
    retrieved_at?: string
    trust_tier?: string
    citation_present?: boolean | null
    license_redistribution_allowed?: string
    sharing_visibility?: string
  } | null
}

type DatasetSeries = {
  id: string
  x: number[]
  y: number[]
  x_unit: string | null
  y_unit: string | null
  reference?: {
    source_type?: string
    data_type?: string
    trust_tier?: string
    source_name?: string
    source_url?: string
    retrieved_at?: string
    citation_text?: string
  } | null
}

type Annotation = {
  annotation_id: string
  dataset_id: string
  type: 'point' | 'range_x' | string
  text: string
  author_user_id: string
  created_at: string
  updated_at: string
  x_unit: string | null
  y_unit: string | null
  x0: number | null
  x1: number | null
  y0: number | null
  y1: number | null
}

type TraceState = {
  datasetId: string
  visible: boolean
}

type TransformRecord = {
  transform_id: string
  parent_trace_id: string
  transform_type: 'normalize' | 'baseline' | 'smooth' | 'unit_display' | 'resample' | 'differential'
  parameters: Record<string, unknown>
  created_at: string
  created_by: string
  output_trace_id: string
}

type DerivedTrace = {
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

const API_BASE = 'http://localhost:8000'

type PlotlyDash = 'solid' | 'dot' | 'dash' | 'longdash' | 'dashdot' | 'longdashdot'

const dashStyles: PlotlyDash[] = ['solid', 'dot', 'dash', 'longdash', 'dashdot', 'longdashdot']

function formatUnit(unit: string | null) {
  return unit?.trim() ? unit.trim() : 'unknown'
}

function makeId(prefix: string) {
  const rnd = globalThis.crypto && 'randomUUID' in globalThis.crypto ? globalThis.crypto.randomUUID() : null
  return `${prefix}-${rnd ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
}

function nowIso() {
  return new Date().toISOString()
}

function makeTimestampForFilename(d: Date) {
  // e.g. 2025-12-17T21-08-50Z
  return d
    .toISOString()
    .replace(/\..*$/, 'Z')
    .replace(/:/g, '-')
}

function sanitizeFilename(name: string) {
  // Windows disallows: \ / : * ? " < > |
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  return cleaned || 'what_i_see.zip'
}

export function PlotPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [traceStates, setTraceStates] = useState<TraceState[]>([])
  const [seriesById, setSeriesById] = useState<Record<string, DatasetSeries>>({})
  const [derivedTraces, setDerivedTraces] = useState<DerivedTrace[]>([])
  const [annotationsByDatasetId, setAnnotationsByDatasetId] = useState<Record<string, Annotation[]>>({})
  const [filter, setFilter] = useState('')
  const [showAnnotations, setShowAnnotations] = useState(false)

  const [displayXUnit, setDisplayXUnit] = useState<DisplayXUnit>('as-imported')
  const [selectedTransformDatasetIds, setSelectedTransformDatasetIds] = useState<string[]>([])
  const [normMode, setNormMode] = useState<NormalizationMode>('none')
  const [normRangeX0, setNormRangeX0] = useState('')
  const [normRangeX1, setNormRangeX1] = useState('')
  const [baselineMode, setBaselineMode] = useState<BaselineMode>('none')
  const [baselineOrder, setBaselineOrder] = useState('1')
  const [includeBaselineTrace, setIncludeBaselineTrace] = useState(false)
  const [smoothingMode, setSmoothingMode] = useState<SmoothingMode>('none')
  const [savgolWindow, setSavgolWindow] = useState('9')
  const [savgolPolyorder, setSavgolPolyorder] = useState('2')

  const [diffA, setDiffA] = useState('')
  const [diffB, setDiffB] = useState('')
  const [diffLockA, setDiffLockA] = useState(false)
  const [diffLockB, setDiffLockB] = useState(false)
  const [diffOp, setDiffOp] = useState<DifferentialOp>('A-B')
  const [diffAlignmentEnabled, setDiffAlignmentEnabled] = useState(false)
  const [diffAlignmentMethod, setDiffAlignmentMethod] = useState<AlignmentMethod>('linear')
  const [diffTargetGrid, setDiffTargetGrid] = useState<'A' | 'B'>('A')
  const [diffRatioHandling, setDiffRatioHandling] = useState<RatioHandling>('mask')
  const [diffTau, setDiffTau] = useState('')
  const [warning, setWarning] = useState<string | null>(null)

  const [newAnnotationDatasetId, setNewAnnotationDatasetId] = useState<string>('')
  const [newPointX, setNewPointX] = useState('')
  const [newPointY, setNewPointY] = useState('')
  const [newPointText, setNewPointText] = useState('')
  const [newRangeX0, setNewRangeX0] = useState('')
  const [newRangeX1, setNewRangeX1] = useState('')
  const [newRangeText, setNewRangeText] = useState('')

  const [featureBusy, setFeatureBusy] = useState(false)
  const [featureError, setFeatureError] = useState<string | null>(null)
  const [featureTraceKeys, setFeatureTraceKeys] = useState<string[]>([])
  const [featureMode, setFeatureMode] = useState<FeatureMode>('peaks')
  const [featureProminence, setFeatureProminence] = useState('')
  const [featureMinSeparation, setFeatureMinSeparation] = useState('')
  const [featureResults, setFeatureResults] = useState<
    Array<
      DetectedFeature & {
        trace_key: string
        trace_name: string
        trace_kind: 'original' | 'derived'
        dataset_id_for_annotation: string | null
        created_at: string
        x_unit_display: string
        parameters: { mode: FeatureMode; min_prominence: number | null; min_separation_x: number | null }
      }
    >
  >([])
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([])
  const [highlightedFeatureRowId, setHighlightedFeatureRowId] = useState<string | null>(null)

  const [matchBusy, setMatchBusy] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [matchReferenceType, setMatchReferenceType] = useState<'line-list' | 'band-ranges'>('line-list')
  const [matchReferenceDatasetId, setMatchReferenceDatasetId] = useState('')
  const [matchTolerance, setMatchTolerance] = useState('')
  const [matchReferenceInfo, setMatchReferenceInfo] = useState<
    | {
        source_name: string | null
        source_url: string | null
        retrieved_at: string | null
        citation_text: string | null
        data_type: string | null
      }
    | null
  >(null)
  const [matchResults, setMatchResults] = useState<
    Array<{
      feature_row_id: string
      feature_center_x_display: number
      dataset_id_for_annotation: string | null
      trace_name: string
      candidates: Array<{
        kind: 'line' | 'band'
        label: string
        score: number
        // Optional fields used by specific matching modes.
        x_ref_display?: number
        x_ref_canonical?: number
        strength?: number | null
        delta_display?: number
        range_x0_display?: number
        range_x1_display?: number
        range_x0_canonical?: number
        range_x1_canonical?: number
      }>
    }>
  >([])

  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const visibleDatasetIds = useMemo(
    () => traceStates.filter((t) => t.visible).map((t) => t.datasetId),
    [traceStates],
  )

  useEffect(() => {
    let cancelled = false

    async function loadDatasets() {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/datasets`)
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
        const json = (await res.json()) as DatasetSummary[]
        if (cancelled) return
        setDatasets(json)
        setTraceStates((prev) => {
          // Ensure we have a stable entry for each dataset.
          const existing = new Map(prev.map((t) => [t.datasetId, t]))
          return json.map((d) => existing.get(d.id) ?? { datasetId: d.id, visible: false })
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    void loadDatasets()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (error) setWarning(null)
  }, [error])

  async function ensureSeriesLoaded(datasetId: string): Promise<DatasetSeries> {
    const cached = seriesById[datasetId]
    if (cached) return cached

    const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(datasetId)}/data`)
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
    const json = (await res.json()) as DatasetSeries
    setSeriesById((prev) => ({ ...prev, [datasetId]: json }))
    return json
  }

  const ensureAnnotationsLoaded = useCallback(
    async (datasetId: string) => {
      if (annotationsByDatasetId[datasetId]) return
      const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(datasetId)}/annotations`)
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
      const json = (await res.json()) as Annotation[]
      setAnnotationsByDatasetId((prev) => ({ ...prev, [datasetId]: json }))
    },
    [annotationsByDatasetId],
  )

  async function onToggleDataset(datasetId: string, nextVisible: boolean) {
    setError(null)
    setWarning(null)
    setTraceStates((prev) =>
      prev.map((t) => (t.datasetId === datasetId ? { ...t, visible: nextVisible } : t)),
    )
    if (nextVisible) {
      try {
        await ensureSeriesLoaded(datasetId)
        if (showAnnotations) {
          await ensureAnnotationsLoaded(datasetId)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        // Revert toggle if fetch fails.
        setTraceStates((prev) =>
          prev.map((t) => (t.datasetId === datasetId ? { ...t, visible: false } : t)),
        )
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    async function loadForVisible() {
      if (!showAnnotations) return
      try {
        await Promise.all(visibleDatasetIds.map((id) => ensureAnnotationsLoaded(id)))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void loadForVisible()
    return () => {
      cancelled = true
    }
  }, [ensureAnnotationsLoaded, showAnnotations, visibleDatasetIds])

  function onIsolate(datasetId: string) {
    setTraceStates((prev) => prev.map((t) => ({ ...t, visible: t.datasetId === datasetId })))
  }

  function onToggleDerived(traceId: string, nextVisible: boolean) {
    setDerivedTraces((prev) =>
      prev.map((t) => (t.traceId === traceId ? { ...t, visible: nextVisible } : t)),
    )
  }

  function onShowAll() {
    setTraceStates((prev) => prev.map((t) => ({ ...t, visible: true })))
  }

  function onHideAll() {
    setTraceStates((prev) => prev.map((t) => ({ ...t, visible: false })))
  }

  const datasetsById = useMemo(() => new Map(datasets.map((d) => [d.id, d])), [datasets])

  const activeSeries = useMemo(() => {
    return visibleDatasetIds.map((id) => ({ id, series: seriesById[id], meta: datasetsById.get(id) }))
  }, [visibleDatasetIds, seriesById, datasetsById])

  const unitHints = useMemo(() => {
    // Prefer first loaded trace's units for axis labels.
    const first = activeSeries.find((t) => t.series)
    return {
      x: first?.series?.x_unit ?? null,
      y: first?.series?.y_unit ?? null,
    }
  }, [activeSeries])

  const xUnitIsKnown = useMemo(() => normalizeXUnit(unitHints.x) != null, [unitHints.x])

  const xUnitLabel = useMemo(() => {
    if (displayXUnit === 'as-imported') return formatUnit(unitHints.x)
    return displayXUnit
  }, [displayXUnit, unitHints.x])

  const featureTraceOptions = useMemo(() => {
    const originals = visibleDatasetIds.map((id) => ({
      key: `o:${id}`,
      label: `Original: ${datasetsById.get(id)?.name ?? id}`,
    }))
    const derived = derivedTraces
      .filter((t) => t.visible)
      .map((t) => ({ key: `d:${t.traceId}`, label: `Derived: ${t.name}` }))
    return [...originals, ...derived]
  }, [datasetsById, derivedTraces, visibleDatasetIds])

  const matchReferenceOptions = useMemo(() => {
    return datasets
      .filter((d) => d.reference?.data_type === 'LineList')
      .map((d) => ({ id: d.id, label: d.name || d.id }))
  }, [datasets])

  const matchBandRangeOptions = useMemo(() => {
    return datasets.map((d) => ({ id: d.id, label: d.name || d.id }))
  }, [datasets])

  const selectedMatchResult = useMemo(() => {
    if (!highlightedFeatureRowId) return null
    return matchResults.find((m) => m.feature_row_id === highlightedFeatureRowId) ?? null
  }, [highlightedFeatureRowId, matchResults])

  useEffect(() => {
    // CAP-09: default to all visible traces; keep selection valid as the plot changes.
    if (!featureTraceOptions.length) {
      setFeatureTraceKeys([])
      return
    }
    setFeatureTraceKeys((prev) => {
      const allowed = new Set(featureTraceOptions.map((t) => t.key))
      const kept = prev.filter((k) => allowed.has(k))
      if (kept.length) return kept
      return featureTraceOptions.map((t) => t.key)
    })
  }, [featureTraceOptions])

  const plotData = useMemo<PlotParams['data']>(() => {
    const xUnit = xUnitLabel
    const yUnit = formatUnit(unitHints.y)

    const traces = activeSeries
      .filter((t) => t.series)
      .map((t, idx) => {
        const s = t.series as DatasetSeries
        const displayName = t.meta?.name || t.id

        let x = s.x
        try {
          x = convertXFromCanonical(s.x, s.x_unit, displayXUnit).x
        } catch {
          // If X unit is unknown, keep canonical and let the UI guide the user.
          x = s.x
        }

        if (s.reference?.data_type === 'LineList') {
          return {
            type: 'bar',
            name: displayName,
            x,
            y: s.y,
            hovertemplate: `${displayName}<br>x=%{x} ${xUnit}<br>strength=%{y}<extra></extra>`,
          }
        }

        // Use Plotly defaults for colors; we only provide a stable dash style for differentiation.
        const dash = dashStyles[idx % dashStyles.length]
        return {
          type: 'scatter',
          mode: 'lines',
          name: displayName,
          x,
          y: s.y,
          line: { dash },
          hovertemplate: `${displayName}<br>x=%{x} ${xUnit}<br>y=%{y} ${yUnit}<extra></extra>`,
        }
      })

    const derived = derivedTraces
      .filter((t) => t.visible)
      .map((t, idx) => {
        const dash = dashStyles[(idx + traces.length) % dashStyles.length]
        let x = t.x
        try {
          x = convertXFromCanonical(t.x, t.x_unit, displayXUnit).x
        } catch {
          x = t.x
        }
        return {
          type: 'scatter',
          mode: 'lines',
          name: t.name,
          x,
          y: t.y,
          line: { dash },
          hovertemplate: `${t.name}<br>x=%{x} ${xUnit}<br>y=%{y} ${formatUnit(t.y_unit)}<extra></extra>`,
        }
      })

    const featureTraces = (() => {
      if (!featureResults.length) return []

      const byTrace = new Map<string, typeof featureResults>()
      for (const f of featureResults) {
        const k = f.trace_key
        const prev = byTrace.get(k) ?? []
        prev.push(f)
        byTrace.set(k, prev)
      }

      const out: Array<Record<string, unknown>> = []
      for (const feats of byTrace.values()) {
        const traceName = feats[0]?.trace_name ?? 'trace'
        out.push({
          type: 'scatter',
          mode: 'markers',
          name: `${traceName} (features)`,
          x: feats.map((f) => f.center_x),
          y: feats.map((f) => f.value_y),
          marker: { size: 9, symbol: featureMode === 'dips' ? 'triangle-down' : 'triangle-up' },
          text: feats.map((f) => {
            const p = typeof f.prominence === 'number' ? `prom=${f.prominence.toFixed(3)}` : 'prom=?'
            const w = typeof f.width === 'number' ? `width=${f.width.toFixed(3)}` : 'width=?'
            return `${p}, ${w}`
          }),
          hovertemplate: `${traceName} (feature)<br>x=%{x} ${xUnit}<br>y=%{y} ${yUnit}<br>%{text}<extra></extra>`,
        })
      }

      if (highlightedFeatureRowId) {
        const selected = featureResults.find((f) => featureRowId(f) === highlightedFeatureRowId)
        if (selected) {
          out.push({
            type: 'scatter',
            mode: 'markers',
            name: `${selected.trace_name} (selected feature)`,
            x: [selected.center_x],
            y: [selected.value_y],
            marker: { size: 14, symbol: 'circle-open', line: { width: 2 } },
            hovertemplate: `${selected.trace_name} (selected)<br>x=%{x} ${xUnit}<br>y=%{y} ${yUnit}<extra></extra>`,
          })
        }
      }
      return out
    })()

    if (!showAnnotations) return [...traces, ...derived, ...featureTraces]

    const noteTraces = activeSeries
      .map((t) => {
        const anns = annotationsByDatasetId[t.id] ?? []
        const points = anns.filter((a) => a.type === 'point' && a.x0 != null)
        if (!points.length) return null
        const displayName = `${t.meta?.name || t.id} (notes)`

        const s = t.series as DatasetSeries | undefined
        const canonicalUnit = s?.x_unit ?? unitHints.x

        return {
          type: 'scatter',
          mode: 'markers',
          name: displayName,
          x: points.map((p) => convertXScalarFromCanonical(p.x0 as number, canonicalUnit, displayXUnit)),
          y: points.map((p) => p.y0 ?? null),
          marker: { size: 8, symbol: 'circle-open' },
          hovertemplate: `${displayName}<br>x=%{x} ${xUnit}<br>y=%{y} ${yUnit}<br>%{text}<extra></extra>`,
          text: points.map((p) => p.text),
        }
      })
      .filter((v): v is NonNullable<typeof v> => v != null)

    return [...traces, ...derived, ...noteTraces, ...featureTraces]
  }, [activeSeries, annotationsByDatasetId, derivedTraces, displayXUnit, featureMode, featureResults, highlightedFeatureRowId, showAnnotations, unitHints.x, unitHints.y, xUnitLabel])

  const plotLayout = useMemo<PlotParams['layout']>(() => {
    const shapes: NonNullable<PlotParams['layout']>['shapes'] = []

    if (showAnnotations) {
      for (const t of activeSeries) {
        const anns = annotationsByDatasetId[t.id] ?? []
        const s = t.series as DatasetSeries | undefined
        const canonicalUnit = s?.x_unit ?? unitHints.x
        for (const a of anns) {
          if (a.type !== 'range_x') continue
          if (a.x0 == null || a.x1 == null) continue
          shapes.push({
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: convertXScalarFromCanonical(a.x0, canonicalUnit, displayXUnit),
            x1: convertXScalarFromCanonical(a.x1, canonicalUnit, displayXUnit),
            y0: 0,
            y1: 1,
            line: { width: 1, color: '#e5e7eb' },
            fillcolor: 'rgba(229,231,235,0.25)',
          })
        }
      }
    }

    return {
      autosize: true,
      height: 520,
      margin: { l: 50, r: 20, t: 20, b: 50 },
      xaxis: { title: `X (${xUnitLabel})` },
      yaxis: { title: `Y (${formatUnit(unitHints.y)})` },
      legend: { orientation: 'h' },
      shapes,
    }
  }, [activeSeries, annotationsByDatasetId, displayXUnit, showAnnotations, unitHints.x, unitHints.y, xUnitLabel])

  const visibleAnnotations = useMemo(() => {
    if (!showAnnotations) return []
    const out: Array<{ datasetId: string; datasetName: string; ann: Annotation }> = []
    for (const datasetId of visibleDatasetIds) {
      const meta = datasetsById.get(datasetId)
      const datasetName = meta?.name ?? datasetId
      for (const ann of annotationsByDatasetId[datasetId] ?? []) {
        out.push({ datasetId, datasetName, ann })
      }
    }
    return out
  }, [showAnnotations, visibleDatasetIds, annotationsByDatasetId, datasetsById])

  useEffect(() => {
    // Pick a sensible default dataset for creating annotations.
    if (newAnnotationDatasetId) return
    if (visibleDatasetIds.length === 1) setNewAnnotationDatasetId(visibleDatasetIds[0])
  }, [newAnnotationDatasetId, visibleDatasetIds])

  useEffect(() => {
    // Keep transform selection aligned to what's visible.
    if (!visibleDatasetIds.length) {
      setSelectedTransformDatasetIds([])
      return
    }
    setSelectedTransformDatasetIds((prev) => prev.filter((id) => visibleDatasetIds.includes(id)))
  }, [visibleDatasetIds])

  useEffect(() => {
    // CAP-05: block display conversions when X unit is unknown.
    if (displayXUnit === 'as-imported') return
    if (!xUnitIsKnown) {
      setError('X unit is unknown; set X unit in dataset metadata before converting.')
      setDisplayXUnit('as-imported')
    }
  }, [displayXUnit, xUnitIsKnown])

  useEffect(() => {
    // CAP-09: feature detection is unit-sensitive; clear results if display units change.
    setFeatureResults([])
    setSelectedFeatureIds([])
    setFeatureError(null)
    setHighlightedFeatureRowId(null)
    setMatchResults([])
    setMatchError(null)
  }, [displayXUnit])

  useEffect(() => {
    if (!highlightedFeatureRowId) return
    const allowed = new Set(featureResults.map((f) => featureRowId(f)))
    if (!allowed.has(highlightedFeatureRowId)) {
      setHighlightedFeatureRowId(null)
    }
  }, [featureResults, highlightedFeatureRowId])

  function clearLastDerived() {
    setDerivedTraces((prev) => prev.slice(0, -1))
  }

  function clearAllDerived() {
    setDerivedTraces([])
  }

  function toggleTransformTarget(datasetId: string, checked: boolean) {
    setSelectedTransformDatasetIds((prev) => {
      const set = new Set(prev)
      if (checked) set.add(datasetId)
      else set.delete(datasetId)
      return Array.from(set)
    })
  }

  async function onApplyTransforms() {
    if (!selectedTransformDatasetIds.length) return

    setError(null)
    try {
      const createdAt = nowIso()
      const createdBy = 'local/anonymous'

      const selection: RangeSelection | null =
        normRangeX0.trim() !== '' && normRangeX1.trim() !== ''
          ? {
              x0: Number(normRangeX0),
              x1: Number(normRangeX1),
              unit: displayXUnit,
              method: 'manual',
            }
          : null

      if (selection && (!Number.isFinite(selection.x0 as number) || !Number.isFinite(selection.x1 as number))) {
        throw new Error('Normalization range must be numeric (x0 and x1).')
      }

      const next: DerivedTrace[] = []

      for (const datasetId of selectedTransformDatasetIds) {
        const s = await ensureSeriesLoaded(datasetId)
        const meta = datasetsById.get(datasetId)
        const baseName = meta?.name ?? datasetId

        let x = s.x
        let y = s.y
        const provenanceSteps: Array<
          | { type: 'baseline'; parameters: Record<string, unknown>; baseline?: number[] }
          | { type: 'normalize'; parameters: Record<string, unknown> }
          | { type: 'smooth'; parameters: Record<string, unknown> }
        > = []

        // CAP-05: data-level transforms must not change X; unit conversions are view-level.
        x = s.x

        const prefixes: string[] = []

        if (baselineMode === 'poly') {
          const order = Number(baselineOrder)
          if (!Number.isFinite(order)) throw new Error('Baseline polynomial order must be numeric.')

          const { corrected, baseline } = baselineCorrectPolynomial(s.x, y, { order })
          y = corrected
          prefixes.push(`BASE(poly${Math.floor(order)})`)

          provenanceSteps.push({
            type: 'baseline',
            parameters: { mode: 'poly', order: Math.floor(order) },
            baseline: includeBaselineTrace ? baseline : undefined,
          })
        }

        if (normMode !== 'none') {
          const out = normalizeY(s.x, y, normMode, selection, s.x_unit)
          y = out.y
          prefixes.push(`NORM(${normMode})`)
          provenanceSteps.push({
            type: 'normalize',
            parameters: { mode: normMode, selection: out.usedSelection, stats: out.stats },
          })
        }

        if (smoothingMode === 'savgol') {
          const windowLength = Number(savgolWindow)
          const polyorder = Number(savgolPolyorder)
          if (!Number.isFinite(windowLength) || !Number.isFinite(polyorder)) {
            throw new Error('Savitzky-Golay parameters must be numeric.')
          }
          y = savitzkyGolaySmooth(y, { windowLength, polyorder })
          prefixes.push(`SAVGOL(${Math.floor(windowLength)},${Math.floor(polyorder)})`)
          provenanceSteps.push({
            type: 'smooth',
            parameters: { mode: 'savgol', window_length: Math.floor(windowLength), polyorder: Math.floor(polyorder) },
          })
        }

        if (!prefixes.length) {
          throw new Error('Select at least one transform (baseline, normalize, or smoothing).')
        }

        const derivedId = makeId('derived')
        const prefix = prefixes.join('+')

        const provenance: TransformRecord[] = provenanceSteps.map((step) => ({
          transform_id: makeId('tf'),
          parent_trace_id: datasetId,
          transform_type: step.type,
          parameters: step.parameters,
          created_at: createdAt,
          created_by: createdBy,
          output_trace_id: derivedId,
        }))

        for (const step of provenanceSteps) {
          if (step.type !== 'baseline') continue
          if (!step.baseline) continue
          const baselineTraceId = makeId('derived')
          next.push({
            traceId: baselineTraceId,
            parentDatasetId: datasetId,
            name: `BASELINE(${String(step.parameters.mode)}): ${baseName}`,
            x,
            y: step.baseline,
            x_unit: s.x_unit,
            y_unit: s.y_unit,
            visible: true,
            provenance: provenance.map((p) => ({ ...p, output_trace_id: baselineTraceId })),
            trust: { interpolated: false },
          })
        }

        next.push({
          traceId: derivedId,
          parentDatasetId: datasetId,
          name: `${prefix}: ${baseName}`,
          x,
          y,
          x_unit: s.x_unit,
          y_unit: s.y_unit,
          visible: true,
          provenance,
          trust: { interpolated: false },
        })
      }

      setDerivedTraces((prev) => [...prev, ...next])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onSaveDerivedToLibrary() {
    if (!derivedTraces.length) return

    setError(null)
    try {
      for (const t of derivedTraces) {
        const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(t.parentDatasetId)}/derived`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: t.name, y: t.y, y_unit: t.y_unit, transforms: t.provenance }),
        })
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function refreshAnnotations(datasetId: string) {
    const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(datasetId)}/annotations`)
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
    const json = (await res.json()) as Annotation[]
    setAnnotationsByDatasetId((prev) => ({ ...prev, [datasetId]: json }))
  }

  async function onAddPoint() {
    if (!newAnnotationDatasetId) return
    const x = Number(newPointX)
    if (!Number.isFinite(x)) return

    const body: { text: string; x: number; y?: number } = { text: newPointText.trim(), x }
    const y = newPointY.trim() === '' ? null : Number(newPointY)
    if (y != null && Number.isFinite(y)) body.y = y

    setError(null)
    try {
      const res = await fetch(
        `${API_BASE}/datasets/${encodeURIComponent(newAnnotationDatasetId)}/annotations/point`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
      await refreshAnnotations(newAnnotationDatasetId)
      setNewPointX('')
      setNewPointY('')
      setNewPointText('')
      setShowAnnotations(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onAddRange() {
    if (!newAnnotationDatasetId) return
    const x0 = Number(newRangeX0)
    const x1 = Number(newRangeX1)
    if (!Number.isFinite(x0) || !Number.isFinite(x1)) return

    setError(null)
    try {
      const res = await fetch(
        `${API_BASE}/datasets/${encodeURIComponent(newAnnotationDatasetId)}/annotations/range-x`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newRangeText.trim(), x0, x1 }),
        },
      )
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
      await refreshAnnotations(newAnnotationDatasetId)
      setNewRangeX0('')
      setNewRangeX1('')
      setNewRangeText('')
      setShowAnnotations(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onDeleteAnnotation(datasetId: string, annotationId: string) {
    setError(null)
    try {
      const res = await fetch(
        `${API_BASE}/datasets/${encodeURIComponent(datasetId)}/annotations/${encodeURIComponent(annotationId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
      await refreshAnnotations(datasetId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const differentialOptions = useMemo(() => {
    const originals = datasets.map((d) => ({ key: `o:${d.id}`, label: `Original: ${d.name || d.id}` }))
    const derived = derivedTraces.map((t) => ({ key: `d:${t.traceId}`, label: `Derived: ${t.name}` }))
    return [...originals, ...derived]
  }, [datasets, derivedTraces])

  function displayTraceName(key: string): string {
    if (key.startsWith('o:')) {
      const id = key.slice(2)
      return datasetsById.get(id)?.name ?? id
    }
    if (key.startsWith('d:')) {
      const id = key.slice(2)
      return derivedTraces.find((d) => d.traceId === id)?.name ?? id
    }
    return key
  }

  async function resolveTraceAsync(
    key: string,
  ): Promise<{ id: string; name: string; x: number[]; y: number[]; x_unit: string | null; y_unit: string | null }> {
    if (key.startsWith('o:')) {
      const id = key.slice(2)
      const s = await ensureSeriesLoaded(id)
      const name = datasetsById.get(id)?.name ?? id
      return { id, name, x: s.x, y: s.y, x_unit: s.x_unit, y_unit: s.y_unit }
    }
    if (key.startsWith('d:')) {
      const id = key.slice(2)
      const t = derivedTraces.find((d) => d.traceId === id)
      if (!t) throw new Error('Derived trace not found.')
      return { id: t.traceId, name: t.name, x: t.x, y: t.y, x_unit: t.x_unit, y_unit: t.y_unit }
    }
    throw new Error('Unknown trace key.')
  }

  async function resolveTraceForFeatureFinder(key: string): Promise<{
    trace_key: string
    trace_name: string
    trace_kind: 'original' | 'derived'
    dataset_id_for_annotation: string | null
    x_display: number[]
    y: number[]
    canonical_x_unit: string | null
    y_unit: string | null
  }> {
    if (key.startsWith('o:')) {
      const datasetId = key.slice(2)
      const s = await ensureSeriesLoaded(datasetId)
      const traceName = datasetsById.get(datasetId)?.name ?? datasetId
      const x_display = convertXFromCanonical(s.x, s.x_unit, displayXUnit).x
      return {
        trace_key: key,
        trace_name: traceName,
        trace_kind: 'original',
        dataset_id_for_annotation: datasetId,
        x_display,
        y: s.y,
        canonical_x_unit: s.x_unit,
        y_unit: s.y_unit,
      }
    }

    if (key.startsWith('d:')) {
      const traceId = key.slice(2)
      const t = derivedTraces.find((d) => d.traceId === traceId)
      if (!t) throw new Error('Derived trace not found.')
      const x_display = convertXFromCanonical(t.x, t.x_unit, displayXUnit).x
      return {
        trace_key: key,
        trace_name: t.name,
        trace_kind: 'derived',
        dataset_id_for_annotation: t.parentDatasetId,
        x_display,
        y: t.y,
        canonical_x_unit: t.x_unit,
        y_unit: t.y_unit,
      }
    }

    throw new Error('Unknown trace key.')
  }

  function featureRowId(f: { trace_key: string; feature_id: string }) {
    return `${f.trace_key}:${f.feature_id}`
  }

  function lowerBoundSorted(values: number[], target: number): number {
    let lo = 0
    let hi = values.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (values[mid] < target) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  function upperBoundSorted(values: number[], target: number): number {
    let lo = 0
    let hi = values.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (values[mid] <= target) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  async function onRunFeatureFinder() {
    setFeatureError(null)
    setSelectedFeatureIds([])
    setFeatureResults([])
    setHighlightedFeatureRowId(null)

    if (!featureTraceKeys.length) return

    const minProm = featureProminence.trim() === '' ? null : Number(featureProminence)
    if (minProm != null && !Number.isFinite(minProm)) {
      setFeatureError('Prominence must be a number.')
      return
    }

    const minSep = featureMinSeparation.trim() === '' ? null : Number(featureMinSeparation)
    if (minSep != null && !Number.isFinite(minSep)) {
      setFeatureError('Minimum separation must be a number.')
      return
    }

    setFeatureBusy(true)
    try {
      const createdAt = nowIso()
      const xUnitDisplay = xUnitLabel
      const out: typeof featureResults = []

      for (const key of featureTraceKeys) {
        const t = await resolveTraceForFeatureFinder(key)
        const feats = detectFeatures(t.x_display, t.y, {
          mode: featureMode,
          minProminence: minProm,
          minSeparationX: minSep,
          maxCount: 200,
        })

        for (const f of feats) {
          out.push({
            ...f,
            trace_key: t.trace_key,
            trace_name: t.trace_name,
            trace_kind: t.trace_kind,
            dataset_id_for_annotation: t.dataset_id_for_annotation,
            created_at: createdAt,
            x_unit_display: xUnitDisplay,
            parameters: { mode: featureMode, min_prominence: minProm, min_separation_x: minSep },
          })
        }
      }

      setFeatureResults(out)
      setMatchResults([])
      setMatchError(null)
      if (out.length > 250) {
        setFeatureError('Too many features detected; increase prominence or minimum separation.')
      } else if (!out.length) {
        setFeatureError('No features found; try lowering prominence or selecting a narrower range.')
      }
    } catch (e) {
      setFeatureError(e instanceof Error ? e.message : String(e))
    } finally {
      setFeatureBusy(false)
    }
  }

  async function onConvertSelectedFeaturesToAnnotations() {
    if (!selectedFeatureIds.length) return

    setError(null)
    setFeatureError(null)
    try {
      const selected = featureResults.filter((f) => selectedFeatureIds.includes(featureRowId(f)))
      for (const f of selected) {
        const datasetId = f.dataset_id_for_annotation
        if (!datasetId) continue

        const canonicalUnit = (await ensureSeriesLoaded(datasetId)).x_unit
        const xCanonical = convertXScalarToCanonical(f.center_x, canonicalUnit, displayXUnit)

        const minProm = f.parameters.min_prominence
        const minSep = f.parameters.min_separation_x
        const promLabel = typeof minProm === 'number' ? `prom≥${minProm}` : 'prom=default'
        const sepLabel = typeof minSep === 'number' ? `sep≥${minSep} ${xUnitLabel}` : `sep=default (${xUnitLabel})`
        const kind = f.parameters.mode === 'dips' ? 'dip' : 'peak'

        const text = `Candidate: ${kind} (CAP-09; ${promLabel}; ${sepLabel}; trace=${f.trace_name})`

        const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(datasetId)}/annotations/point`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, x: xCanonical, y: f.value_y }),
        })
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
        await refreshAnnotations(datasetId)
      }

      setShowAnnotations(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onRunMatch() {
    setMatchError(null)
    setMatchResults([])
    setMatchReferenceInfo(null)

    const tol = matchReferenceType === 'line-list' ? (matchTolerance.trim() === '' ? null : Number(matchTolerance)) : null
    if (matchReferenceType === 'line-list' && (tol == null || !Number.isFinite(tol) || tol <= 0)) {
      setMatchError(`Tolerance must be a positive number (${xUnitLabel}).`)
      return
    }

    if (!matchReferenceDatasetId) return

    const toMatch = selectedFeatureIds.length
      ? featureResults.filter((f) => selectedFeatureIds.includes(featureRowId(f)))
      : featureResults

    if (!toMatch.length) {
      setMatchError('No features selected/found to match.')
      return
    }

    setMatchBusy(true)
    try {
      const ref = await ensureSeriesLoaded(matchReferenceDatasetId)
      const refCanonical = normalizeXUnit(ref.x_unit)
      if (!refCanonical) {
        throw new Error('Reference dataset has unknown X units; fix metadata before matching.')
      }

      setMatchReferenceInfo({
        source_name: ref.reference?.source_name ?? null,
        source_url: ref.reference?.source_url ?? null,
        retrieved_at: ref.reference?.retrieved_at ?? null,
        citation_text: ref.reference?.citation_text ?? null,
        data_type: ref.reference?.data_type ?? null,
      })

      const out: typeof matchResults = []
      const mismatch: string[] = []

      if (matchReferenceType === 'band-ranges') {
        const annRes = await fetch(`${API_BASE}/datasets/${encodeURIComponent(matchReferenceDatasetId)}/annotations`)
        if (!annRes.ok) throw new Error((await annRes.text()) || `HTTP ${annRes.status}`)
        const anns = (await annRes.json()) as Annotation[]
        const ranges = anns.filter((a) => a.type === 'range_x' && a.x0 != null && a.x1 != null)
        if (!ranges.length) {
          throw new Error('Selected reference dataset has no range annotations to use as band/range references.')
        }

        for (const f of toMatch) {
          if (!Number.isFinite(f.center_x)) continue
          if (!f.dataset_id_for_annotation) continue

          const featureSeries = await ensureSeriesLoaded(f.dataset_id_for_annotation)
          const featureCanonical = normalizeXUnit(featureSeries.x_unit)
          if (!featureCanonical) {
            mismatch.push(`${f.trace_name}: unknown X unit`)
            continue
          }

          if (displayXUnit === 'as-imported' && featureCanonical !== refCanonical) {
            mismatch.push(`${f.trace_name}: ${featureCanonical} vs ${refCanonical}`)
            continue
          }

          const xFeatureCanonicalInRef = convertXScalarToCanonical(f.center_x, ref.x_unit, displayXUnit)

          const candidates = ranges
            .filter((r) => {
              const x0 = r.x0 as number
              const x1 = r.x1 as number
              return xFeatureCanonicalInRef >= x0 && xFeatureCanonicalInRef <= x1
            })
            .map((r) => {
              const x0C = r.x0 as number
              const x1C = r.x1 as number
              const x0D = convertXScalarFromCanonical(x0C, ref.x_unit, displayXUnit)
              const x1D = convertXScalarFromCanonical(x1C, ref.x_unit, displayXUnit)
              const lo = Math.min(x0D, x1D)
              const hi = Math.max(x0D, x1D)
              const mid = 0.5 * (lo + hi)
              const half = Math.max(hi - lo, 0) / 2
              const dist = Math.abs(f.center_x - mid)
              const score = half > 0 ? Math.max(0, 1 - dist / half) : 1
              const bandName = String(r.text ?? '').trim() || '(unnamed band)'
              const label = `Band: ${bandName} [${lo.toFixed(6)}–${hi.toFixed(6)} ${xUnitLabel}]`
              return {
                kind: 'band' as const,
                label,
                score,
                range_x0_display: lo,
                range_x1_display: hi,
                range_x0_canonical: Math.min(x0C, x1C),
                range_x1_canonical: Math.max(x0C, x1C),
              }
            })
            .sort((a, b) => b.score - a.score)

          out.push({
            feature_row_id: featureRowId(f),
            feature_center_x_display: f.center_x,
            dataset_id_for_annotation: f.dataset_id_for_annotation,
            trace_name: f.trace_name,
            candidates: candidates.slice(0, 10),
          })
        }

        if (mismatch.length) {
          setMatchError(
            `Some features were skipped due to unit mismatch in as-imported mode: ${mismatch.slice(0, 5).join('; ')}${
              mismatch.length > 5 ? '…' : ''
            }`,
          )
        }

        setMatchResults(out)
        if (!out.length) {
          setMatchError('No matches found; ensure your reference ranges overlap the detected feature positions.')
        }
        return
      }

      // line-list matching
      if (ref.reference?.data_type !== 'LineList') {
        throw new Error('Selected reference dataset is not a line list.')
      }
      if (tol == null) {
        throw new Error('Tolerance is required for line list matching.')
      }

      for (const f of toMatch) {
        if (!Number.isFinite(f.center_x)) continue
        if (!f.dataset_id_for_annotation) continue

        const featureSeries = await ensureSeriesLoaded(f.dataset_id_for_annotation)
        const featureCanonical = normalizeXUnit(featureSeries.x_unit)
        if (!featureCanonical) {
          mismatch.push(`${f.trace_name}: unknown X unit`)
          continue
        }

        // In as-imported mode we cannot safely compare across differing unit conventions.
        if (displayXUnit === 'as-imported' && featureCanonical !== refCanonical) {
          mismatch.push(`${f.trace_name}: ${featureCanonical} vs ${refCanonical}`)
          continue
        }

        const x0Display = f.center_x - tol
        const x1Display = f.center_x + tol

        // Convert the tolerance window endpoints into the reference's canonical unit
        // (the reference X array is sorted in its canonical unit).
        const loC = convertXScalarToCanonical(Math.min(x0Display, x1Display), ref.x_unit, displayXUnit)
        const hiC = convertXScalarToCanonical(Math.max(x0Display, x1Display), ref.x_unit, displayXUnit)

        const start = lowerBoundSorted(ref.x, loC)
        const endExclusive = upperBoundSorted(ref.x, hiC)

        const candidates: Array<{
          kind: 'line'
          label: string
          score: number
          x_ref_display: number
          x_ref_canonical: number
          strength: number | null
          delta_display: number
        }> = []

        for (let i = start; i < endExclusive; i++) {
          const xRefCanonical = ref.x[i]
          const xRefDisplay = convertXScalarFromCanonical(xRefCanonical, ref.x_unit, displayXUnit)
          const deltaSigned = xRefDisplay - f.center_x
          const deltaAbs = Math.abs(deltaSigned)
          if (deltaAbs > tol) continue

          const strength = typeof ref.y?.[i] === 'number' && Number.isFinite(ref.y[i]) ? ref.y[i] : null
          const score = Math.max(0, 1 - deltaAbs / tol)
          const deltaLabel = `${deltaSigned >= 0 ? '+' : ''}${deltaSigned.toFixed(6)} ${xUnitLabel}`
          const strengthLabel = strength != null ? `; strength=${strength.toFixed(3)}` : ''
          const label = `Line @ ${xRefDisplay.toFixed(6)} ${xUnitLabel} (Δ=${deltaLabel}${strengthLabel})`
          candidates.push({
            kind: 'line',
            label,
            score,
            x_ref_display: xRefDisplay,
            x_ref_canonical: xRefCanonical,
            strength,
            delta_display: deltaAbs,
          })
        }

        candidates.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          const bs = b.strength ?? -Infinity
          const as = a.strength ?? -Infinity
          return bs - as
        })

        out.push({
          feature_row_id: featureRowId(f),
          feature_center_x_display: f.center_x,
          dataset_id_for_annotation: f.dataset_id_for_annotation,
          trace_name: f.trace_name,
          candidates: candidates.slice(0, 10),
        })
      }

      if (mismatch.length) {
        setMatchError(
          `Some features were skipped due to unit mismatch in as-imported mode: ${mismatch.slice(0, 5).join('; ')}${
            mismatch.length > 5 ? '…' : ''
          }`,
        )
      }

      setMatchResults(out)
      if (!out.length) {
        setMatchError('No matches found; try increasing tolerance or choose another line list.')
      }
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : String(e))
    } finally {
      setMatchBusy(false)
    }
  }

  async function onApplyTopMatchesToAnnotations() {
    if (!matchResults.length) return
    if (!matchReferenceDatasetId) return

    setError(null)
    setMatchError(null)
    try {
      const ref = await ensureSeriesLoaded(matchReferenceDatasetId)
      const srcName = ref.reference?.source_name ?? 'Unknown'
      const srcUrl = ref.reference?.source_url
      const retrievedAt = ref.reference?.retrieved_at
      const cite = ref.reference?.citation_text

      const tol = matchReferenceType === 'line-list' ? (matchTolerance.trim() === '' ? null : Number(matchTolerance)) : null
      if (matchReferenceType === 'line-list' && (tol == null || !Number.isFinite(tol) || tol <= 0)) {
        throw new Error('Tolerance must be set before applying line-list match labels.')
      }

      for (const m of matchResults) {
        if (!m.dataset_id_for_annotation) continue
        const top = m.candidates[0]
        if (!top) continue

        const canonicalUnit = (await ensureSeriesLoaded(m.dataset_id_for_annotation)).x_unit
        const xCanonical = convertXScalarToCanonical(m.feature_center_x_display, canonicalUnit, displayXUnit)

        const dxLabel = tol != null ? `Δx=±${tol} ${xUnitLabel}` : null
        const sourceLabel = srcUrl ? `${srcName} (${srcUrl})` : srcName
        const retrievedLabel = retrievedAt ? `retrieved=${retrievedAt}` : null

        // Keep UI labels rich, but persist a compact label in annotations.
        const compactCandidateLabel =
          top.kind === 'line'
            ? `Line @ ${top.x_ref_display.toFixed(6)} ${xUnitLabel}`
            : top.label

        const matchLabel = `Candidate: ${compactCandidateLabel}`
        const metaBits = [
          'CAP-09',
          dxLabel,
          `source=${sourceLabel}`,
          retrievedLabel,
          `trace=${m.trace_name}`,
        ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

        const pieces = [matchLabel, `(${metaBits.join('; ')})`]
        if (cite && String(cite).trim()) {
          pieces.push(`Cite: ${String(cite).trim()}`)
        }
        const text = pieces.join(' ')

        const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(m.dataset_id_for_annotation)}/annotations/point`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, x: xCanonical, y: null }),
        })
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
        await refreshAnnotations(m.dataset_id_for_annotation)
      }

      setShowAnnotations(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onExportWhatISee() {
    setExportError(null)

    const timestamp = makeTimestampForFilename(new Date())
    const defaultName = `what_i_see_${timestamp}.zip`
    const chosen = globalThis.prompt ? globalThis.prompt('Save export as…', defaultName) : defaultName
    if (chosen === null) return
    const downloadName = (() => {
      const raw = sanitizeFilename(chosen)
      return raw.toLowerCase().endsWith('.zip') ? raw : `${raw}.zip`
    })()

    const originalTraces = activeSeries
      .filter((t) => t.series)
      .map((t) => {
        const s = t.series as DatasetSeries
        let x = s.x
        try {
          x = convertXFromCanonical(s.x, s.x_unit, displayXUnit).x
        } catch {
          x = s.x
        }

        return {
          trace_id: `o:${t.id}`,
          label: t.meta?.name || t.id,
          trace_kind: 'original',
          dataset_id: t.id,
          parent_dataset_id: null,
          x,
          y: s.y,
          x_unit: xUnitLabel,
          y_unit: formatUnit(s.y_unit),
          provenance: [],
        }
      })

    const derivedExportTraces = derivedTraces
      .filter((t) => t.visible)
      .map((t) => {
        let x = t.x
        try {
          x = convertXFromCanonical(t.x, t.x_unit, displayXUnit).x
        } catch {
          x = t.x
        }

        return {
          trace_id: `d:${t.traceId}`,
          label: t.name,
          trace_kind: 'derived',
          dataset_id: null,
          parent_dataset_id: t.parentDatasetId,
          x,
          y: t.y,
          x_unit: xUnitLabel,
          y_unit: formatUnit(t.y_unit),
          provenance: t.provenance,
        }
      })

    const traces = [...originalTraces, ...derivedExportTraces]
    if (!traces.length) {
      setExportError('No visible traces to export.')
      return
    }

    const payload = {
      export_name: downloadName.replace(/\.zip$/i, ''),
      plot_state: {
        exported_at: nowIso(),
        display_x_unit: displayXUnit,
        x_unit_label: xUnitLabel,
        y_unit_label: formatUnit(unitHints.y),
        visible_dataset_ids: visibleDatasetIds,
        visible_derived_trace_ids: derivedTraces.filter((t) => t.visible).map((t) => t.traceId),
        show_annotations: showAnnotations,
      },
      traces,
      features: featureResults,
      matches: matchResults,
    }

    setExportBusy(true)
    try {
      const res = await fetch(`${API_BASE}/exports/what-i-see.zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    } finally {
      setExportBusy(false)
    }
  }

  async function onSwapDiff() {
    setWarning(null)
    setError(null)
    setDiffA(diffB)
    setDiffB(diffA)
  }

  async function onComputeDifferential() {
    setError(null)
    setWarning(null)

    try {
      if (!diffA || !diffB) return

      const a = await resolveTraceAsync(diffA)
      const b = await resolveTraceAsync(diffB)

      const aSeries = diffA.startsWith('o:') ? seriesById[diffA.slice(2)] : null
      const bSeries = diffB.startsWith('o:') ? seriesById[diffB.slice(2)] : null
      if (aSeries?.reference?.data_type === 'LineList' || bSeries?.reference?.data_type === 'LineList') {
        throw new Error('Line lists cannot be used for A−B or A/B. Select spectrum traces instead.')
      }

      const ax = normalizeXUnit(a.x_unit)
      const bx = normalizeXUnit(b.x_unit)
      if (!ax || !bx) {
        throw new Error('Trace A and/or B has unknown X units. Fix dataset metadata before comparing.')
      }
      if (ax !== bx) {
        throw new Error(
          'Trace A and Trace B use different X units/dimensions. Convert display units or fix dataset metadata.',
        )
      }

      if (a.y_unit && b.y_unit && a.y_unit !== b.y_unit) {
        setWarning('Y units differ between A and B; comparison proceeds without unit harmonization.')
      }

      const alignment = {
        method: diffAlignmentEnabled ? diffAlignmentMethod : 'none',
        target: diffTargetGrid,
      } as const

      const tau = diffTau.trim() === '' ? null : Number(diffTau)
      if (tau != null && !Number.isFinite(tau)) throw new Error('τ must be numeric.')

      const out = differentialCompare(
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
        diffOp,
        alignment,
        { handling: diffRatioHandling, tau },
      )

      const createdAt = nowIso()
      const createdBy = 'local/anonymous'

      const isInterpolated = out.interpolated
      const interpolatedBadge = isInterpolated ? ' (Interpolated)' : ''
      const derivedId = makeId('derived')

      const aAlias = a.name
      const bAlias = b.name
      const opLabel = diffOp === 'A-B' ? 'A-B' : 'A/B'

      const provenance: TransformRecord[] = []
      if (diffAlignmentEnabled) {
        provenance.push({
          transform_id: makeId('tf'),
          parent_trace_id: a.id,
          transform_type: 'resample',
          parameters: {
            method: diffAlignmentMethod,
            target_grid: diffTargetGrid,
            overlap_only: true,
            overlap: out.overlap,
          },
          created_at: createdAt,
          created_by: createdBy,
          output_trace_id: derivedId,
        })
      }

      provenance.push({
        transform_id: makeId('tf'),
        parent_trace_id: a.id,
        transform_type: 'differential',
        parameters: {
          op: diffOp,
          a: { id: a.id, name: a.name },
          b: { id: b.id, name: b.name },
          alignment,
          ratio: { handling: diffRatioHandling, tau_used: out.ratioMask?.tau ?? null, masked: out.ratioMask?.maskedCount ?? 0 },
        },
        created_at: createdAt,
        created_by: createdBy,
        output_trace_id: derivedId,
      })

      if (out.warnings.length) {
        setWarning(out.warnings.join(' '))
      }

      // Choose parent dataset as the selected target grid's original dataset if possible.
      const parentDatasetId = diffTargetGrid === 'A'
        ? (diffA.startsWith('o:') ? diffA.slice(2) : (diffB.startsWith('o:') ? diffB.slice(2) : newAnnotationDatasetId || ''))
        : (diffB.startsWith('o:') ? diffB.slice(2) : (diffA.startsWith('o:') ? diffA.slice(2) : newAnnotationDatasetId || ''))

      setDerivedTraces((prev) => [
        ...prev,
        {
          traceId: derivedId,
          parentDatasetId: parentDatasetId || (diffA.startsWith('o:') ? diffA.slice(2) : ''),
          name: `${opLabel}${interpolatedBadge}: ${aAlias} vs ${bAlias}`,
          x: out.x,
          y: out.y,
          x_unit: a.x_unit,
          y_unit: null,
          visible: true,
          provenance,
          trust: { interpolated: isInterpolated },
        },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const filteredTraceRows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const rows = traceStates
      .map((t) => ({ t, meta: datasetsById.get(t.datasetId) }))
      .filter((row) => row.meta)
    if (!q) return rows
    return rows.filter((row) => (row.meta?.name ?? '').toLowerCase().includes(q))
  }, [traceStates, datasetsById, filter])

  return (
    <section>
      <h1>Plot</h1>
      <p style={{ marginTop: '0.25rem', marginBottom: '0.75rem' }}>
        Overlay and inspect datasets (CAP-03). CAP-05 transforms are optional and non-destructive (derived traces only).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem' }}>
        <aside style={{ borderRight: '1px solid #e5e7eb', paddingRight: '1rem' }}>
          <div>
            <label htmlFor="trace-filter" style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>
              Trace filter
            </label>
            <input
              id="trace-filter"
              aria-label="Trace filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by dataset name"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={onShowAll} style={{ cursor: 'pointer' }}>
              Show all
            </button>
            <button type="button" onClick={onHideAll} style={{ cursor: 'pointer' }}>
              Hide all
            </button>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Traces</div>
            {busy ? <p>Loading datasets…</p> : null}
            {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
            {warning ? <p>{warning}</p> : null}

            {filteredTraceRows.length ? (
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <div style={{ fontWeight: 700, marginTop: '0.25rem' }}>Original</div>
                {filteredTraceRows.map(({ t, meta }) => (
                  <div
                    key={t.datasetId}
                    style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.5rem', alignItems: 'center' }}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Toggle ${meta?.name ?? t.datasetId}`}
                      checked={t.visible}
                      onChange={(e) => onToggleDataset(t.datasetId, e.target.checked)}
                    />
                    <div title={meta?.name ?? t.datasetId} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {meta?.name ?? t.datasetId}
                    </div>
                    <button
                      type="button"
                      onClick={() => onIsolate(t.datasetId)}
                      disabled={!t.visible && visibleDatasetIds.length === 0}
                      style={{ cursor: 'pointer' }}
                    >
                      Isolate
                    </button>
                  </div>
                ))}

                {derivedTraces.length ? (
                  <>
                    <div style={{ fontWeight: 700, marginTop: '0.5rem' }}>Derived</div>
                    {derivedTraces.map((t) => (
                      <div
                        key={t.traceId}
                        style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem', alignItems: 'center' }}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Toggle ${t.name}`}
                          checked={t.visible}
                          onChange={(e) => onToggleDerived(t.traceId, e.target.checked)}
                        />
                        <div title={t.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.name}
                        </div>
                      </div>
                    ))}
                  </>
                ) : null}
              </div>
            ) : (
              <p style={{ marginTop: '0.25rem' }}>
                No datasets found. Import one in Library first.
              </p>
            )}
          </div>

          <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Transforms (CAP-05)</div>

            <div style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Targets</label>
              {visibleDatasetIds.length ? (
                <div style={{ display: 'grid', gap: '0.25rem' }}>
                  {visibleDatasetIds.map((id) => (
                    <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedTransformDatasetIds.includes(id)}
                        onChange={(e) => toggleTransformTarget(id, e.target.checked)}
                      />
                      <span>{datasetsById.get(id)?.name ?? id}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p style={{ marginTop: '0.25rem' }}>Select a trace to enable transforms.</p>
              )}
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>X unit display (view-only)</label>
              <select
                aria-label="X unit display"
                value={displayXUnit}
                onChange={(e) => setDisplayXUnit(e.target.value as DisplayXUnit)}
                style={{ width: '100%' }}
              >
                <option value="as-imported">As imported</option>
                <option value="nm" disabled={!xUnitIsKnown}>
                  nm
                </option>
                <option value="Å" disabled={!xUnitIsKnown}>
                  Å
                </option>
                <option value="µm" disabled={!xUnitIsKnown}>
                  µm
                </option>
                <option value="cm⁻¹" disabled={!xUnitIsKnown}>
                  cm⁻¹
                </option>
              </select>
              {!xUnitIsKnown ? (
                <p style={{ marginTop: '0.25rem' }}>X unit unknown; conversion disabled until metadata is set.</p>
              ) : null}
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Y normalization/scaling</label>
              <select
                aria-label="Y normalization"
                value={normMode}
                onChange={(e) => setNormMode(e.target.value as NormalizationMode)}
                style={{ width: '100%' }}
              >
                <option value="none">None</option>
                <option value="max">Max normalization</option>
                <option value="min-max">Min-max scaling</option>
                <option value="z-score">Z-score</option>
                <option value="area">Area normalization</option>
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  aria-label="Normalization range x0"
                  placeholder={`x0 (${xUnitLabel}) optional`}
                  value={normRangeX0}
                  onChange={(e) => setNormRangeX0(e.target.value)}
                />
                <input
                  aria-label="Normalization range x1"
                  placeholder={`x1 (${xUnitLabel}) optional`}
                  value={normRangeX1}
                  onChange={(e) => setNormRangeX1(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Baseline correction</label>
              <select
                aria-label="Baseline correction"
                value={baselineMode}
                onChange={(e) => setBaselineMode(e.target.value as BaselineMode)}
                style={{ width: '100%' }}
              >
                <option value="none">None</option>
                <option value="poly">Polynomial baseline</option>
              </select>

              {baselineMode === 'poly' ? (
                <>
                  <input
                    aria-label="Baseline polynomial order"
                    placeholder="order (e.g. 1)"
                    value={baselineOrder}
                    onChange={(e) => setBaselineOrder(e.target.value)}
                    style={{ width: '100%', marginTop: '0.5rem' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={includeBaselineTrace}
                      onChange={(e) => setIncludeBaselineTrace(e.target.checked)}
                    />
                    Include baseline trace
                  </label>
                </>
              ) : null}
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Smoothing (optional)</label>
              <select
                aria-label="Smoothing"
                value={smoothingMode}
                onChange={(e) => setSmoothingMode(e.target.value as SmoothingMode)}
                style={{ width: '100%' }}
              >
                <option value="none">Off</option>
                <option value="savgol">Savitzky-Golay</option>
              </select>

              {smoothingMode === 'savgol' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input
                    aria-label="Savitzky-Golay window length"
                    placeholder="window (odd)"
                    value={savgolWindow}
                    onChange={(e) => setSavgolWindow(e.target.value)}
                  />
                  <input
                    aria-label="Savitzky-Golay polyorder"
                    placeholder="polyorder"
                    value={savgolPolyorder}
                    onChange={(e) => setSavgolPolyorder(e.target.value)}
                  />
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={onApplyTransforms} disabled={!selectedTransformDatasetIds.length} style={{ cursor: 'pointer' }}>
                Apply
              </button>
              <button type="button" onClick={clearLastDerived} disabled={!derivedTraces.length} style={{ cursor: 'pointer' }}>
                Clear last derived
              </button>
              <button type="button" onClick={clearAllDerived} disabled={!derivedTraces.length} style={{ cursor: 'pointer' }}>
                Clear all derived
              </button>
              <button type="button" onClick={onSaveDerivedToLibrary} disabled={!derivedTraces.length} style={{ cursor: 'pointer' }}>
                Save derived to Library
              </button>
            </div>

            <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Differential (CAP-06)</div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Trace A</label>
                  <select
                    aria-label="Trace A"
                    value={diffA}
                    onChange={(e) => !diffLockA && setDiffA(e.target.value)}
                    disabled={diffLockA}
                    style={{ width: '100%' }}
                  >
                    <option value="">(select)</option>
                    {differentialOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                    <input type="checkbox" checked={diffLockA} onChange={(e) => setDiffLockA(e.target.checked)} />
                    Lock A
                  </label>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Trace B</label>
                  <select
                    aria-label="Trace B"
                    value={diffB}
                    onChange={(e) => !diffLockB && setDiffB(e.target.value)}
                    disabled={diffLockB}
                    style={{ width: '100%' }}
                  >
                    <option value="">(select)</option>
                    {differentialOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                    <input type="checkbox" checked={diffLockB} onChange={(e) => setDiffLockB(e.target.checked)} />
                    Lock B
                  </label>
                </div>

                <button type="button" onClick={onSwapDiff} style={{ cursor: 'pointer' }}>
                  Swap A ↔ B
                </button>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Operation</label>
                  <select aria-label="Differential operation" value={diffOp} onChange={(e) => setDiffOp(e.target.value as DifferentialOp)} style={{ width: '100%' }}>
                    <option value="A-B">A−B</option>
                    <option value="A/B">A/B</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <input
                      type="checkbox"
                      checked={diffAlignmentEnabled}
                      onChange={(e) => setDiffAlignmentEnabled(e.target.checked)}
                    />
                    Enable alignment (interpolation)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <select
                      aria-label="Alignment method"
                      value={diffAlignmentMethod}
                      onChange={(e) => setDiffAlignmentMethod(e.target.value as AlignmentMethod)}
                      disabled={!diffAlignmentEnabled}
                    >
                      <option value="nearest">Nearest</option>
                      <option value="linear">Linear</option>
                      <option value="pchip">PCHIP</option>
                    </select>
                    <select
                      aria-label="Target grid"
                      value={diffTargetGrid}
                      onChange={(e) => setDiffTargetGrid(e.target.value as 'A' | 'B')}
                      disabled={!diffAlignmentEnabled}
                    >
                      <option value="A">Use A grid</option>
                      <option value="B">Use B grid</option>
                    </select>
                  </div>
                </div>

                {diffOp === 'A/B' ? (
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Ratio handling</label>
                    <select
                      aria-label="Ratio handling"
                      value={diffRatioHandling}
                      onChange={(e) => setDiffRatioHandling(e.target.value as RatioHandling)}
                      style={{ width: '100%' }}
                    >
                      <option value="mask">Mask near-zero denominator</option>
                    </select>
                    <input
                      aria-label="Denominator threshold"
                      placeholder="τ (optional)"
                      value={diffTau}
                      onChange={(e) => setDiffTau(e.target.value)}
                      style={{ width: '100%', marginTop: '0.5rem' }}
                    />
                  </div>
                ) : null}

                <div style={{ fontSize: '0.9rem' }}>
                  <div>
                    A: <strong>{diffA ? displayTraceName(diffA) : '(none)'}</strong>
                  </div>
                  <div>
                    B: <strong>{diffB ? displayTraceName(diffB) : '(none)'}</strong>
                  </div>
                </div>

                <button type="button" onClick={onComputeDifferential} disabled={!diffA || !diffB} style={{ cursor: 'pointer' }}>
                  Compute
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Feature Finder (CAP-09)</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
              Runs on the selected trace(s) exactly as displayed (mode: {featureMode}, x unit: {xUnitLabel}).
            </div>

            {featureError ? (
              <div style={{ border: '1px solid #e5e7eb', padding: '0.5rem', marginTop: '0.5rem' }}>
                <p style={{ color: 'crimson', margin: 0 }}>{featureError}</p>
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Trace(s)</label>
                <select
                  aria-label="Feature traces"
                  multiple
                  value={featureTraceKeys}
                  onChange={(e) =>
                    setFeatureTraceKeys(Array.from(e.target.selectedOptions).map((o) => (o as HTMLOptionElement).value))
                  }
                  style={{ width: '100%', minHeight: 72 }}
                  disabled={!featureTraceOptions.length}
                >
                  {featureTraceOptions.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Mode</label>
                <select
                  aria-label="Feature mode"
                  value={featureMode}
                  onChange={(e) => setFeatureMode(e.target.value as FeatureMode)}
                  style={{ width: '100%' }}
                >
                  <option value="peaks">Peaks (maxima)</option>
                  <option value="dips">Dips (minima)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Prominence ≥</label>
                  <input
                    aria-label="Feature prominence"
                    placeholder="(optional)"
                    value={featureProminence}
                    onChange={(e) => setFeatureProminence(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Min separation</label>
                  <input
                    aria-label="Feature min separation"
                    placeholder={`(${xUnitLabel})`}
                    value={featureMinSeparation}
                    onChange={(e) => setFeatureMinSeparation(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={onRunFeatureFinder} disabled={featureBusy || !featureTraceKeys.length} style={{ cursor: 'pointer' }}>
                  {featureBusy ? 'Finding…' : 'Run'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFeatureResults([])
                    setSelectedFeatureIds([])
                    setFeatureError(null)
                    setHighlightedFeatureRowId(null)
                    setMatchResults([])
                    setMatchError(null)
                  }}
                  disabled={featureBusy || (!featureResults.length && !featureError)}
                  style={{ cursor: 'pointer' }}
                >
                  Clear
                </button>
              </div>

              {featureResults.length ? (
                <div style={{ marginTop: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700 }}>Results ({featureResults.length})</div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedFeatureIds(featureResults.map((f) => `${f.trace_key}:${f.feature_id}`))}
                        style={{ cursor: 'pointer' }}
                      >
                        Select all
                      </button>
                      <button type="button" onClick={() => setSelectedFeatureIds([])} style={{ cursor: 'pointer' }}>
                        Select none
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.25rem', maxHeight: 180, overflow: 'auto', border: '1px solid #e5e7eb' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>Use</th>
                          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>x</th>
                          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>prom</th>
                          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>trace</th>
                        </tr>
                      </thead>
                      <tbody>
                        {featureResults.map((f) => {
                          const id = `${f.trace_key}:${f.feature_id}`
                          const checked = selectedFeatureIds.includes(id)
                          const highlighted = highlightedFeatureRowId === id
                          return (
                            <tr
                              key={id}
                              onClick={() => setHighlightedFeatureRowId((prev) => (prev === id ? null : id))}
                              style={{ cursor: 'pointer', background: highlighted ? '#f3f4f6' : undefined }}
                            >
                              <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                <input
                                  type="checkbox"
                                  onClick={(e) => e.stopPropagation()}
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                    setSelectedFeatureIds((prev) =>
                                      next ? [...prev, id] : prev.filter((x) => x !== id),
                                    )
                                  }}
                                />
                              </td>
                              <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                {Number.isFinite(f.center_x) ? f.center_x.toFixed(6) : ''}
                              </td>
                              <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                {typeof f.prominence === 'number' ? f.prominence.toFixed(3) : ''}
                              </td>
                              <td title={f.trace_name} style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                {f.trace_kind === 'derived' ? 'derived' : 'original'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={onConvertSelectedFeaturesToAnnotations}
                    disabled={!selectedFeatureIds.length}
                    style={{ marginTop: '0.5rem', cursor: 'pointer' }}
                  >
                    Convert selected to annotations
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Match (CAP-09)</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
              Matches features to a reference: line lists (tolerance window) or band/range intervals.
            </div>

            {matchError ? (
              <div style={{ border: '1px solid #e5e7eb', padding: '0.5rem', marginTop: '0.5rem' }}>
                <p style={{ color: 'crimson', margin: 0 }}>{matchError}</p>
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Reference type</label>
                <select
                  aria-label="Match reference type"
                  value={matchReferenceType}
                  onChange={(e) => {
                    const next = e.target.value as 'line-list' | 'band-ranges'
                    setMatchReferenceType(next)
                    setMatchResults([])
                    setMatchError(null)
                    setMatchReferenceDatasetId('')
                    setMatchReferenceInfo(null)
                  }}
                  style={{ width: '100%' }}
                >
                  <option value="line-list">Line list</option>
                  <option value="band-ranges">Band/range (from range annotations)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Reference dataset</label>
                <select
                  aria-label="Match reference dataset"
                  value={matchReferenceDatasetId}
                  onChange={(e) => {
                    setMatchReferenceDatasetId(e.target.value)
                    setMatchReferenceInfo(null)
                    setMatchResults([])
                    setMatchError(null)
                  }}
                  style={{ width: '100%' }}
                  disabled={matchReferenceType === 'line-list' ? !matchReferenceOptions.length : !matchBandRangeOptions.length}
                >
                  <option value="">(select a reference)</option>
                  {(matchReferenceType === 'line-list' ? matchReferenceOptions : matchBandRangeOptions).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {matchReferenceType === 'line-list' ? (
                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>Tolerance (±)</label>
                  <input
                    aria-label="Match tolerance"
                    placeholder={`(${xUnitLabel})`}
                    value={matchTolerance}
                    onChange={(e) => setMatchTolerance(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={onRunMatch}
                  disabled={matchBusy || !matchReferenceDatasetId || !featureResults.length || (matchReferenceType === 'line-list' && !matchTolerance.trim())}
                  style={{ cursor: 'pointer' }}
                >
                  {matchBusy ? 'Matching…' : 'Run match'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMatchResults([])
                    setMatchError(null)
                  }}
                  disabled={matchBusy || (!matchResults.length && !matchError)}
                  style={{ cursor: 'pointer' }}
                >
                  Clear
                </button>
              </div>

              {matchResults.length ? (
                <div style={{ marginTop: '0.25rem' }}>
                  <div style={{ fontWeight: 700 }}>Results ({matchResults.length})</div>
                  <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                    Using {selectedFeatureIds.length ? 'selected features' : 'all detected features'};{' '}
                    {matchReferenceType === 'line-list'
                      ? 'window = [x−Δx, x+Δx].'
                      : 'match = feature center inside a reference interval.'}
                  </div>

                  {matchReferenceInfo ? (
                    <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', opacity: 0.9 }}>
                      <div>
                        Reference: <strong>{matchReferenceInfo.source_name ?? 'Unknown'}</strong>
                        {matchReferenceInfo.data_type ? ` (${matchReferenceInfo.data_type})` : ''}
                      </div>
                      {matchReferenceInfo.source_url ? (
                        <div>
                          URL:{' '}
                          <a href={matchReferenceInfo.source_url} target="_blank" rel="noreferrer">
                            {matchReferenceInfo.source_url}
                          </a>
                        </div>
                      ) : null}
                      {matchReferenceInfo.retrieved_at ? <div>Retrieved: {matchReferenceInfo.retrieved_at}</div> : null}
                      {matchReferenceInfo.citation_text ? <div>Citation: {matchReferenceInfo.citation_text}</div> : null}
                    </div>
                  ) : null}

                  <div style={{ marginTop: '0.25rem', maxHeight: 200, overflow: 'auto', border: '1px solid #e5e7eb' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>x</th>
                          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>top candidate</th>
                          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>score</th>
                          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>cands</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matchResults.map((m) => {
                          const top = m.candidates[0]
                          const second = m.candidates[1]
                          const ambiguous =
                            !!top &&
                            !!second &&
                            Number.isFinite(top.score) &&
                            Number.isFinite(second.score) &&
                            Math.abs(top.score - second.score) <= 0.02
                          const highlighted = highlightedFeatureRowId === m.feature_row_id
                          return (
                            <tr
                              key={m.feature_row_id}
                              onClick={() => setHighlightedFeatureRowId((prev) => (prev === m.feature_row_id ? null : m.feature_row_id))}
                              style={{ cursor: 'pointer', background: highlighted ? '#f3f4f6' : undefined }}
                            >
                              <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                {Number.isFinite(m.feature_center_x_display) ? m.feature_center_x_display.toFixed(6) : ''}
                              </td>
                              <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                {top ? `${top.label}${ambiguous ? ' (ambiguous)' : ''}` : '(none)'}
                              </td>
                              <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                {top ? top.score.toFixed(3) : ''}
                              </td>
                              <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                                {m.candidates.length}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {selectedMatchResult ? (
                    <div style={{ marginTop: '0.5rem', border: '1px solid #e5e7eb', padding: '0.5rem' }}>
                      {(() => {
                        const top = selectedMatchResult.candidates[0]
                        const second = selectedMatchResult.candidates[1]
                        const ambiguous =
                          !!top &&
                          !!second &&
                          Number.isFinite(top.score) &&
                          Number.isFinite(second.score) &&
                          Math.abs(top.score - second.score) <= 0.02
                        return (
                          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                            Scoring breakdown{ambiguous ? ' (ambiguous)' : ''}
                          </div>
                        )
                      })()}
                      <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                        Feature x: <strong>{selectedMatchResult.feature_center_x_display.toFixed(6)}</strong> {xUnitLabel}
                      </div>

                      {matchReferenceType === 'line-list' ? (
                        <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '0.25rem' }}>
                          Score: <code>1 − |Δ|/Δx</code> (clamped to [0,1])
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '0.25rem' }}>
                          Score: closeness to interval midpoint (normalized by half-width)
                        </div>
                      )}

                      <div style={{ marginTop: '0.5rem', maxHeight: 220, overflow: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                          <thead>
                            {matchReferenceType === 'line-list' ? (
                              <tr>
                                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>candidate</th>
                                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>x_ref</th>
                                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>Δ</th>
                                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>score</th>
                                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>strength</th>
                              </tr>
                            ) : (
                              <tr>
                                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>band</th>
                                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>range</th>
                                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>score</th>
                              </tr>
                            )}
                          </thead>
                          <tbody>
                            {selectedMatchResult.candidates.slice(0, 5).map((c, idx) => {
                              if (matchReferenceType === 'line-list') {
                                const xRef = typeof c.x_ref_display === 'number' ? c.x_ref_display.toFixed(6) : ''
                                const dx = typeof c.delta_display === 'number' ? c.delta_display.toFixed(6) : ''
                                const strength = typeof c.strength === 'number' ? c.strength.toFixed(3) : ''
                                return (
                                  <tr key={idx}>
                                    <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>{c.label}</td>
                                    <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>{xRef}</td>
                                    <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>{dx}</td>
                                    <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>{c.score.toFixed(3)}</td>
                                    <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>{strength}</td>
                                  </tr>
                                )
                              }

                              const lo =
                                typeof c.range_x0_display === 'number' && typeof c.range_x1_display === 'number'
                                  ? `${c.range_x0_display.toFixed(6)}–${c.range_x1_display.toFixed(6)} ${xUnitLabel}`
                                  : ''
                              return (
                                <tr key={idx}>
                                  <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>{c.label}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>{lo}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>{c.score.toFixed(3)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={onApplyTopMatchesToAnnotations}
                    disabled={!matchResults.length}
                    style={{ marginTop: '0.5rem', cursor: 'pointer' }}
                  >
                    Apply top match labels to annotations
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ fontWeight: 700 }}>Annotations</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <input
                  type="checkbox"
                  aria-label="Show annotations"
                  checked={showAnnotations}
                  onChange={(e) => setShowAnnotations(e.target.checked)}
                />
                Show
              </label>
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>
                Add annotation to
              </label>
              <select
                value={newAnnotationDatasetId}
                onChange={(e) => setNewAnnotationDatasetId(e.target.value)}
                disabled={visibleDatasetIds.length === 0}
                style={{ width: '100%' }}
              >
                <option value="">(select a visible trace)</option>
                {visibleDatasetIds.map((id) => (
                  <option key={id} value={id}>
                    {datasetsById.get(id)?.name ?? id}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Point note</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input
                  aria-label="New point x"
                  placeholder="x"
                  value={newPointX}
                  onChange={(e) => setNewPointX(e.target.value)}
                />
                <input
                  aria-label="New point y"
                  placeholder="y (optional)"
                  value={newPointY}
                  onChange={(e) => setNewPointY(e.target.value)}
                />
              </div>
              <input
                aria-label="New point text"
                placeholder="note text"
                value={newPointText}
                onChange={(e) => setNewPointText(e.target.value)}
                style={{ width: '100%', marginTop: '0.5rem' }}
              />
              <button
                type="button"
                onClick={onAddPoint}
                style={{ marginTop: '0.5rem', cursor: 'pointer' }}
                disabled={!newAnnotationDatasetId}
              >
                Add point note
              </button>
            </div>

            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>X-range highlight</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input
                  aria-label="New range x0"
                  placeholder="x0"
                  value={newRangeX0}
                  onChange={(e) => setNewRangeX0(e.target.value)}
                />
                <input
                  aria-label="New range x1"
                  placeholder="x1"
                  value={newRangeX1}
                  onChange={(e) => setNewRangeX1(e.target.value)}
                />
              </div>
              <input
                aria-label="New range text"
                placeholder="label"
                value={newRangeText}
                onChange={(e) => setNewRangeText(e.target.value)}
                style={{ width: '100%', marginTop: '0.5rem' }}
              />
              <button
                type="button"
                onClick={onAddRange}
                style={{ marginTop: '0.5rem', cursor: 'pointer' }}
                disabled={!newAnnotationDatasetId}
              >
                Add range highlight
              </button>
            </div>

            {showAnnotations ? (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Visible annotations</div>
                {visibleAnnotations.length ? (
                  <div style={{ display: 'grid', gap: '0.25rem' }}>
                    {visibleAnnotations.map(({ datasetId, datasetName, ann }) => (
                      <div
                        key={ann.annotation_id}
                        style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'center' }}
                      >
                        <div title={datasetName} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <strong>{ann.type}</strong> — {ann.text}
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteAnnotation(datasetId, ann.annotation_id)}
                          style={{ cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ marginTop: '0.25rem' }}>No annotations on visible traces.</p>
                )}
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Status</div>
            <div>Overlay count: {visibleDatasetIds.length}</div>
            <div>
              Axes: x ({xUnitLabel}), y ({formatUnit(unitHints.y)})
            </div>
            <div>Derived count: {derivedTraces.length}</div>
          </div>

          <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Export (CAP-11)</div>
            <button
              type="button"
              onClick={onExportWhatISee}
              disabled={
                exportBusy ||
                (visibleDatasetIds.length === 0 && !derivedTraces.some((t) => t.visible))
              }
              style={{ cursor: 'pointer' }}
            >
              {exportBusy ? 'Exporting…' : 'Export what I see (.zip)'}
            </button>
            {exportError ? <p style={{ color: 'crimson', marginTop: '0.5rem' }}>{exportError}</p> : null}
          </div>
        </aside>

        <div>
          {visibleDatasetIds.length === 0 ? (
            <div style={{ border: '1px solid #e5e7eb', padding: '1rem' }}>
              <p style={{ margin: 0 }}>Select one or more traces to plot.</p>
            </div>
          ) : (
            <div style={{ border: '1px solid #e5e7eb' }}>
              <Plot
                data={plotData}
                layout={plotLayout}
                config={{ displaylogo: false, responsive: true }}
                style={{ width: '100%', height: '520px' }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
