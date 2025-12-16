import { useCallback, useEffect, useMemo, useState } from 'react'
import Plot, { type PlotParams } from 'react-plotly.js'

import {
  baselineCorrectPolynomial,
  convertXFromCanonical,
  convertXScalarFromCanonical,
  normalizeXUnit,
  normalizeY,
  savitzkyGolaySmooth,
  type BaselineMode,
  type DisplayXUnit,
  type NormalizationMode,
  type RangeSelection,
  type SmoothingMode,
} from '../lib/transforms'

type DatasetSummary = {
  id: string
  name: string
  created_at: string
  source_file_name: string
  sha256: string
}

type DatasetSeries = {
  id: string
  x: number[]
  y: number[]
  x_unit: string | null
  y_unit: string | null
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
  transform_type: 'normalize' | 'baseline' | 'smooth' | 'unit_display'
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

  const [newAnnotationDatasetId, setNewAnnotationDatasetId] = useState<string>('')
  const [newPointX, setNewPointX] = useState('')
  const [newPointY, setNewPointY] = useState('')
  const [newPointText, setNewPointText] = useState('')
  const [newRangeX0, setNewRangeX0] = useState('')
  const [newRangeX1, setNewRangeX1] = useState('')
  const [newRangeText, setNewRangeText] = useState('')

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

  async function ensureSeriesLoaded(datasetId: string) {
    if (seriesById[datasetId]) return

    const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(datasetId)}/data`)
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
    const json = (await res.json()) as DatasetSeries
    setSeriesById((prev) => ({ ...prev, [datasetId]: json }))
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
        return {
          type: 'scatter',
          mode: 'lines',
          name: t.name,
          x: t.x,
          y: t.y,
          line: { dash },
          hovertemplate: `${t.name}<br>x=%{x} ${xUnit}<br>y=%{y} ${formatUnit(t.y_unit)}<extra></extra>`,
        }
      })

    if (!showAnnotations) return [...traces, ...derived]

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

    return [...traces, ...derived, ...noteTraces]
  }, [activeSeries, annotationsByDatasetId, derivedTraces, displayXUnit, showAnnotations, unitHints.x, unitHints.y, xUnitLabel])

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
      for (const datasetId of selectedTransformDatasetIds) {
        await ensureSeriesLoaded(datasetId)
      }

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
        const s = seriesById[datasetId]
        if (!s) continue
        const meta = datasetsById.get(datasetId)
        const baseName = meta?.name ?? datasetId

        let x = s.x
        let y = s.y
        const provenanceSteps: Array<
          | { type: 'baseline'; parameters: Record<string, unknown>; baseline?: number[] }
          | { type: 'normalize'; parameters: Record<string, unknown> }
          | { type: 'smooth'; parameters: Record<string, unknown> }
        > = []

        // View-level unit conversion is handled at render-time from canonical for Originals.
        // For Derived traces, we stamp the display X array at creation time.
        x = convertXFromCanonical(s.x, s.x_unit, displayXUnit).x

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
