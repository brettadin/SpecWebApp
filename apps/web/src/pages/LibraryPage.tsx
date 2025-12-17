import { useState } from 'react'
import { Link } from 'react-router-dom'

type IngestPreviewResponse = {
  file_name: string
  file_size_bytes: number
  encoding: string
  parser: string
  delimiter: string
  has_header: boolean
  hdu_index: number | null
  fits_hdu_candidates: Array<{ hdu_index: number; hdu_name: string; columns: string[] }> | null
  x_unit_hint: string | null
  y_unit_hint: string | null
  columns: Array<{ index: number; name: string; is_numeric: boolean; non_numeric_count: number }>
  preview_rows: string[][]
  suggested_x_index: number | null
  suggested_y_index: number | null
  warnings: string[]
}

type DatasetSummary = {
  id: string
  name: string
  created_at: string
  source_file_name: string
  sha256: string
  reference?: {
    data_type?: string | null
    source_name?: string | null
    source_url?: string | null
    retrieved_at?: string | null
    trust_tier?: string | null
    citation_present?: boolean | null
    license_redistribution_allowed?: string | null
    sharing_visibility?: string | null
  } | null
}

type IngestCommitResponse = {
  dataset: {
    id: string
    name: string
    created_at: string
    source_file_name: string
    sha256: string
    x_unit: string | null
    y_unit: string | null
    x_count: number
    warnings: string[]
  }
}

type MastInvokeResponse = {
  status: string
  msg?: string
  data?: unknown
}

type MastNameLookupRow = {
  resolved_ra?: number
  resolved_dec?: number
  ra?: number
  dec?: number
}

type MastCaomRow = {
  obsid?: number | string
  obs_collection?: string
  target_name?: string
  dataproduct_type?: string
}

type MastProductRow = {
  obsid?: number | string
  productFilename?: string
  dataURI?: string
  calib_level?: number
  productType?: string
  recommended?: boolean
}

type TelescopeFITSPreviewCandidate = {
  hdu_index: number
  hdu_name: string
  columns: string[]
  suggested_x_index: number | null
  suggested_y_index: number | null
}

type TelescopeFITSPreviewResponse = {
  file_name: string
  file_size_bytes: number
  sha256: string
  fits_hdu_candidates: TelescopeFITSPreviewCandidate[]
  warnings: string[]
  cache?: {
    cache_hit?: boolean
    refresh?: boolean
    latest?: {
      downloaded_at?: string
      sha256?: string
      bytes?: number
    } | null
    versions?: Array<{
      downloaded_at?: string
      sha256?: string
      bytes?: number
    }>
  } | null
}

export function LibraryPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refBusy, setRefBusy] = useState(false)
  const [refError, setRefError] = useState<string | null>(null)
  const [preview, setPreview] = useState<IngestPreviewResponse | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [xIndex, setXIndex] = useState<number | ''>('')
  const [yIndex, setYIndex] = useState<number | ''>('')
  const [xUnit, setXUnit] = useState('')
  const [yUnit, setYUnit] = useState('')
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [commitResult, setCommitResult] = useState<IngestCommitResponse | null>(null)

  const [refUrl, setRefUrl] = useState('')
  const [refTitle, setRefTitle] = useState('')
  const [refSourceName, setRefSourceName] = useState('NIST Chemistry WebBook')
  const [refCitation, setRefCitation] = useState('')
  const [refRedistributionAllowed, setRefRedistributionAllowed] = useState<'unknown' | 'yes' | 'no'>('unknown')

  const [lineUrl, setLineUrl] = useState('')
  const [lineTitle, setLineTitle] = useState('')
  const [lineSourceName, setLineSourceName] = useState('NIST ASD')
  const [lineCitation, setLineCitation] = useState('')
  const [lineXUnit, setLineXUnit] = useState('nm')
  const [lineDelimiter, setLineDelimiter] = useState(',')

  const [mastBusy, setMastBusy] = useState(false)
  const [mastError, setMastError] = useState<string | null>(null)

  const [mastTarget, setMastTarget] = useState('')
  const [mastRadius, setMastRadius] = useState('0.1')
  const [mastMission, setMastMission] = useState<'JWST' | 'HST' | 'HLSP' | ''>('JWST')
  const [mastDataType, setMastDataType] = useState<'spectrum' | 'cube' | ''>('spectrum')

  const [mastCitation, setMastCitation] = useState('')
  const [mastRefresh, setMastRefresh] = useState(false)

  const [mastResolved, setMastResolved] = useState<{ ra: number; dec: number } | null>(null)
  const [mastCaomRows, setMastCaomRows] = useState<MastCaomRow[]>([])
  const [mastSelectedObsId, setMastSelectedObsId] = useState<number | string | null>(null)
  const [mastProducts, setMastProducts] = useState<MastProductRow[]>([])
  const [mastSelectedDataURI, setMastSelectedDataURI] = useState<string>('')
  const [mastSelectedFilename, setMastSelectedFilename] = useState<string>('')

  const [mastPreview, setMastPreview] = useState<TelescopeFITSPreviewResponse | null>(null)
  const [mastHduIndex, setMastHduIndex] = useState<number | ''>('')
  const [mastXIndex, setMastXIndex] = useState<number | ''>('')
  const [mastYIndex, setMastYIndex] = useState<number | ''>('')
  const [mastXUnit, setMastXUnit] = useState('')
  const [mastYUnit, setMastYUnit] = useState('')
  const [mastTitle, setMastTitle] = useState('')

  const [mastImported, setMastImported] = useState<
    | {
        id: string
        name: string
        created_at: string
        source_file_name: string
        sha256: string
      }
    | null
  >(null)

  async function refreshDatasets() {
    const res = await fetch('http://localhost:8000/datasets')
    if (!res.ok) return
    const json = (await res.json()) as DatasetSummary[]
    setDatasets(json)
  }

  async function fetchPreview(file: File, hduIndex: number | null) {
    const form = new FormData()
    form.append('file', file)

    const hduQuery = hduIndex != null ? `&hdu_index=${encodeURIComponent(String(hduIndex))}` : ''
    const res = await fetch(`http://localhost:8000/ingest/preview?max_rows=25${hduQuery}`, {
      method: 'POST',
      body: form,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `HTTP ${res.status}`)
    }
    return (await res.json()) as IngestPreviewResponse
  }

  async function onPickFile(file: File | null) {
    setError(null)
    setPreview(null)
    setCommitResult(null)
    setSelectedFile(file)
    if (!file) return

    setBusy(true)
    try {
      const json = await fetchPreview(file, null)
      setPreview(json)

      setXIndex(json.suggested_x_index ?? '')
      setYIndex(json.suggested_y_index ?? '')
      setXUnit((prev) => prev || json.x_unit_hint || '')
      setYUnit((prev) => prev || json.y_unit_hint || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onChangeFitsHdu(hduIndex: number) {
    if (!selectedFile) return
    setError(null)
    setCommitResult(null)
    setBusy(true)
    try {
      const json = await fetchPreview(selectedFile, hduIndex)
      setPreview(json)
      setXIndex(json.suggested_x_index ?? '')
      setYIndex(json.suggested_y_index ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onCommit() {
    setError(null)
    setCommitResult(null)
    if (!selectedFile || xIndex === '' || yIndex === '') return

    if (preview?.parser === 'fits' && preview.hdu_index == null) {
      setError('FITS preview did not select an HDU; cannot import.')
      return
    }

    const form = new FormData()
    form.append('file', selectedFile)
    form.append('x_index', String(xIndex))
    form.append('y_index', String(yIndex))
    form.append('x_unit', xUnit)
    form.append('y_unit', yUnit)
    form.append('name', selectedFile.name)
    if (preview?.parser === 'fits' && preview.hdu_index != null) {
      form.append('hdu_index', String(preview.hdu_index))
    }

    setBusy(true)
    try {
      const res = await fetch(`http://localhost:8000/ingest/commit`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as IngestCommitResponse
      setCommitResult(json)
      await refreshDatasets()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onImportReference() {
    setRefError(null)

    const url = refUrl.trim()
    if (!url) return
    if (!refTitle.trim()) {
      setRefError('Title is required for reference imports.')
      return
    }
    if (!refCitation.trim()) {
      setRefError('Citation text is required (CAP-07 citation-first).')
      return
    }

    setRefBusy(true)
    try {
      const res = await fetch('http://localhost:8000/references/import/jcamp-dx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: refTitle.trim(),
          source_name: refSourceName.trim() || 'Unknown',
          source_url: url,
          citation_text: refCitation.trim(),
          trust_tier: 'Primary/Authoritative',
          license: { redistribution_allowed: refRedistributionAllowed },
          query: { entered_url: url },
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      await refreshDatasets()
      setRefUrl('')
      setRefTitle('')
      setRefCitation('')
    } catch (e) {
      setRefError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefBusy(false)
    }
  }

  async function onImportLineList() {
    setRefError(null)

    const url = lineUrl.trim()
    if (!url) return
    if (!lineTitle.trim()) {
      setRefError('Title is required for line list imports.')
      return
    }
    if (!lineCitation.trim()) {
      setRefError('Citation text is required (CAP-07 citation-first).')
      return
    }

    setRefBusy(true)
    try {
      const res = await fetch('http://localhost:8000/references/import/line-list-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: lineTitle.trim(),
          source_name: lineSourceName.trim() || 'Unknown',
          source_url: url,
          citation_text: lineCitation.trim(),
          trust_tier: 'Primary/Authoritative',
          x_unit: lineXUnit.trim() || null,
          delimiter: lineDelimiter,
          has_header: true,
          x_index: 0,
          strength_index: 1,
          license: { redistribution_allowed: refRedistributionAllowed },
          query: { entered_url: url },
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      await refreshDatasets()
      setLineUrl('')
      setLineTitle('')
      setLineCitation('')
    } catch (e) {
      setRefError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefBusy(false)
    }
  }

  async function onMastSearch() {
    setMastError(null)
    setMastImported(null)
    setMastPreview(null)
    setMastResolved(null)
    setMastCaomRows([])
    setMastSelectedObsId(null)
    setMastProducts([])
    setMastSelectedDataURI('')
    setMastSelectedFilename('')
    setMastHduIndex('')
    setMastXIndex('')
    setMastYIndex('')

    const target = mastTarget.trim()
    if (!target) return

    const radius = Number(mastRadius)
    if (!Number.isFinite(radius) || radius <= 0) {
      setMastError('Radius must be a positive number (degrees).')
      return
    }

    setMastBusy(true)
    try {
      const lookupRes = await fetch('http://localhost:8000/telescope/mast/name-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: target }),
      })
      if (!lookupRes.ok) throw new Error((await lookupRes.text()) || `HTTP ${lookupRes.status}`)
      const lookupJson = (await lookupRes.json()) as MastInvokeResponse
      if (lookupJson.status !== 'COMPLETE') throw new Error(lookupJson.msg || 'MAST name lookup failed')

      const first = Array.isArray(lookupJson.data) ? (lookupJson.data[0] as MastNameLookupRow | undefined) : undefined
      const ra = first?.resolved_ra ?? first?.ra
      const dec = first?.resolved_dec ?? first?.dec
      if (typeof ra !== 'number' || typeof dec !== 'number') {
        throw new Error('MAST name lookup returned no resolved coordinates')
      }
      setMastResolved({ ra, dec })

      const missions = mastMission ? [mastMission] : undefined
      const dataproduct_types = mastDataType ? [mastDataType] : undefined

      const searchRes = await fetch('http://localhost:8000/telescope/mast/caom-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ra,
          dec,
          radius,
          missions,
          dataproduct_types,
          pagesize: 50,
          page: 1,
        }),
      })
      if (!searchRes.ok) throw new Error((await searchRes.text()) || `HTTP ${searchRes.status}`)
      const searchJson = (await searchRes.json()) as MastInvokeResponse
      if (searchJson.status !== 'COMPLETE') throw new Error(searchJson.msg || 'MAST search failed')

      const rows = Array.isArray(searchJson.data) ? (searchJson.data as MastCaomRow[]) : []
      setMastCaomRows(rows)
    } catch (e) {
      setMastError(e instanceof Error ? e.message : String(e))
    } finally {
      setMastBusy(false)
    }
  }

  async function onMastSelectObservation(obsid: number | string | null | undefined) {
    setMastError(null)
    setMastImported(null)
    setMastPreview(null)
    setMastProducts([])
    setMastSelectedObsId(obsid ?? null)
    setMastSelectedDataURI('')
    setMastSelectedFilename('')
    setMastHduIndex('')
    setMastXIndex('')
    setMastYIndex('')

    if (obsid == null) return
    setMastBusy(true)
    try {
      const res = await fetch('http://localhost:8000/telescope/mast/caom-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obsid, pagesize: 200, page: 1 }),
      })
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
      const json = (await res.json()) as MastInvokeResponse
      if (json.status !== 'COMPLETE') throw new Error(json.msg || 'MAST products failed')
      const productsRaw = Array.isArray(json.data) ? (json.data as MastProductRow[]) : []
      const products = [...productsRaw].sort((a, b) => {
        const ar = a.recommended ? 1 : 0
        const br = b.recommended ? 1 : 0
        if (ar !== br) return br - ar
        const ac = typeof a.calib_level === 'number' ? a.calib_level : -1
        const bc = typeof b.calib_level === 'number' ? b.calib_level : -1
        if (ac !== bc) return bc - ac
        const an = (a.productFilename ?? '').toLowerCase()
        const bn = (b.productFilename ?? '').toLowerCase()
        return an.localeCompare(bn)
      })

      setMastProducts(products)

      // Default-select a recommended product when available.
      const first =
        products.find((p) => p.recommended && typeof p.dataURI === 'string' && p.dataURI.trim()) ??
        products.find((p) => typeof p.dataURI === 'string' && p.dataURI.trim())
      if (first?.dataURI) {
        setMastSelectedDataURI(first.dataURI)
        setMastSelectedFilename(first.productFilename ?? '')
        setMastTitle(first.productFilename ?? '')
      }
    } catch (e) {
      setMastError(e instanceof Error ? e.message : String(e))
    } finally {
      setMastBusy(false)
    }
  }

  async function onMastPreview() {
    setMastError(null)
    setMastImported(null)
    setMastPreview(null)
    setMastHduIndex('')
    setMastXIndex('')
    setMastYIndex('')

    if (!mastSelectedDataURI.trim()) return
    if (!mastCitation.trim()) {
      setMastError('Citation text is required (CAP-08 citation-first).')
      return
    }

    setMastBusy(true)
    try {
      const selectedProduct = mastProducts.find((p) => (p.dataURI ?? '').trim() === mastSelectedDataURI.trim())
      const res = await fetch('http://localhost:8000/telescope/mast/preview/fits-by-data-uri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_uri: mastSelectedDataURI.trim(),
          product_filename: mastSelectedFilename.trim() || null,
          refresh: mastRefresh,
          mission: mastMission || 'Other',
          source_name: 'MAST',
          citation_text: mastCitation.trim(),
          query: {
            target: mastTarget.trim(),
            resolved: mastResolved,
            obsid: mastSelectedObsId,
            data_uri: mastSelectedDataURI.trim(),
            product_filename: mastSelectedFilename.trim() || null,
            calib_level: typeof selectedProduct?.calib_level === 'number' ? selectedProduct.calib_level : null,
            product_type: selectedProduct?.productType ?? null,
            recommended: selectedProduct?.recommended ?? null,
          },
        }),
      })
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
      const json = (await res.json()) as TelescopeFITSPreviewResponse
      setMastPreview(json)

      const first = json.fits_hdu_candidates[0]
      if (first) {
        setMastHduIndex(first.hdu_index)
        setMastXIndex(first.suggested_x_index ?? '')
        setMastYIndex(first.suggested_y_index ?? '')
      }
      setMastTitle((prev) => prev.trim() || mastSelectedFilename.trim() || json.file_name)
    } catch (e) {
      setMastError(e instanceof Error ? e.message : String(e))
    } finally {
      setMastBusy(false)
    }
  }

  async function onMastImport() {
    setMastError(null)
    setMastImported(null)
    if (!mastPreview || mastHduIndex === '' || mastXIndex === '' || mastYIndex === '') return
    if (!mastSelectedDataURI.trim()) return
    if (!mastCitation.trim()) {
      setMastError('Citation text is required (CAP-08 citation-first).')
      return
    }
    if (!mastTitle.trim()) {
      setMastError('Title is required for telescope imports.')
      return
    }

    setMastBusy(true)
    try {
      const selectedProduct = mastProducts.find((p) => (p.dataURI ?? '').trim() === mastSelectedDataURI.trim())
      const res = await fetch('http://localhost:8000/telescope/mast/import/fits-by-data-uri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: mastTitle.trim(),
          data_uri: mastSelectedDataURI.trim(),
          product_filename: mastSelectedFilename.trim() || null,
          refresh: mastRefresh,
          mission: mastMission || 'Other',
          source_name: 'MAST',
          citation_text: mastCitation.trim(),
          query: {
            target: mastTarget.trim(),
            resolved: mastResolved,
            obsid: mastSelectedObsId,
            product_filename: mastSelectedFilename.trim() || null,
            data_uri: mastSelectedDataURI.trim(),
            calib_level: typeof selectedProduct?.calib_level === 'number' ? selectedProduct.calib_level : null,
            product_type: selectedProduct?.productType ?? null,
            recommended: selectedProduct?.recommended ?? null,
          },
          hdu_index: Number(mastHduIndex),
          x_index: Number(mastXIndex),
          y_index: Number(mastYIndex),
          x_unit: mastXUnit.trim() || null,
          y_unit: mastYUnit.trim() || null,
        }),
      })
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
      const json = (await res.json()) as { id: string; name: string; created_at: string; source_file_name: string; sha256: string }
      setMastImported(json)
      await refreshDatasets()
    } catch (e) {
      setMastError(e instanceof Error ? e.message : String(e))
    } finally {
      setMastBusy(false)
    }
  }

  return (
    <section>
      <h1>Library</h1>
      <p>Start with a local file import preview (CAP-01). No transforms happen here.</p>

      <label>
        <div style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
          Choose a file (CSV/TXT/FITS/JCAMP-DX):
        </div>
        <input
          type="file"
          accept=".csv,.txt,.fits,.fit,.jdx,.dx,.jcamp,text/csv,text/plain,application/fits"
          disabled={busy}
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {busy ? <p>Previewing…</p> : null}
      {error ? (
        <div style={{ border: '1px solid #e5e7eb', padding: '0.5rem', marginTop: '0.5rem' }}>
          <p style={{ color: 'crimson', margin: 0 }}>{error}</p>
          <p style={{ marginTop: '0.25rem', marginBottom: 0 }}>
            <Link to="/docs?doc=cap-01&q=messy%20csv">Learn more: common import/preview issues</Link>
          </p>
        </div>
      ) : null}

      {preview ? (
        <div style={{ marginTop: '1rem' }}>
          <h2 style={{ fontSize: '1rem' }}>Preview</h2>
          <p style={{ marginTop: '0.25rem', marginBottom: '0.25rem' }}>
            Parser: <strong>{preview.parser}</strong>
          </p>
          {preview.parser === 'fits' && preview.fits_hdu_candidates?.length ? (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
              <label>
                FITS HDU:{' '}
                <select
                  value={preview.hdu_index ?? ''}
                  onChange={(e) => onChangeFitsHdu(Number(e.target.value))}
                  disabled={busy}
                >
                  {preview.fits_hdu_candidates.map((c) => (
                    <option key={c.hdu_index} value={c.hdu_index}>
                      {c.hdu_index}: {c.hdu_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {preview.warnings.length ? (
            <ul>
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label>
                X column:{' '}
                <select
                  value={xIndex}
                  onChange={(e) => setXIndex(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">(select)</option>
                  {preview.columns.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.index}: {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Y column:{' '}
                <select
                  value={yIndex}
                  onChange={(e) => setYIndex(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">(select)</option>
                  {preview.columns.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.index}: {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label>
                X unit:{' '}
                <input value={xUnit} onChange={(e) => setXUnit(e.target.value)} placeholder="e.g., nm" />
              </label>
              <label>
                Y unit:{' '}
                <input value={yUnit} onChange={(e) => setYUnit(e.target.value)} placeholder="e.g., flux" />
              </label>
              <button disabled={busy || !selectedFile || xIndex === '' || yIndex === ''} onClick={onCommit}>
                Import
              </button>
              <button disabled={busy} onClick={refreshDatasets}>
                Refresh list
              </button>
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', overflow: 'auto', border: '1px solid #e5e7eb' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {preview.columns.map((c) => (
                    <th
                      key={c.index}
                      style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}
                    >
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!preview.preview_rows.length ? (
                  <tr>
                    <td style={{ padding: '0.25rem 0.5rem' }} colSpan={Math.max(1, preview.columns.length)}>
                      (No inline preview rows for this file type.)
                    </td>
                  </tr>
                ) : null}
                {preview.preview_rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Add reference data (CAP-07)</h2>
        <p style={{ marginTop: '0.25rem' }}>
          Import a reference spectrum by URL (server fetch + parse). Citation text is required.
        </p>

        {refError ? (
          <div style={{ border: '1px solid #e5e7eb', padding: '0.5rem', marginTop: '0.5rem' }}>
            <p style={{ color: 'crimson', margin: 0 }}>{refError}</p>
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: '0.5rem', maxWidth: 720 }}>
          <label>
            <div style={{ marginBottom: '0.25rem' }}>JCAMP-DX URL</div>
            <input
              aria-label="Reference URL"
              value={refUrl}
              onChange={(e) => setRefUrl(e.target.value)}
              placeholder="https://.../spectrum.jdx"
              style={{ width: '100%' }}
              disabled={refBusy}
            />
          </label>

          <label>
            <div style={{ marginBottom: '0.25rem' }}>Title</div>
            <input
              aria-label="Reference title"
              value={refTitle}
              onChange={(e) => setRefTitle(e.target.value)}
              placeholder="e.g., NIST WebBook IR: CO2"
              style={{ width: '100%' }}
              disabled={refBusy}
            />
          </label>

          <label>
            <div style={{ marginBottom: '0.25rem' }}>Source name</div>
            <input
              aria-label="Reference source name"
              value={refSourceName}
              onChange={(e) => setRefSourceName(e.target.value)}
              placeholder="e.g., NIST Chemistry WebBook"
              style={{ width: '100%' }}
              disabled={refBusy}
            />
          </label>

          <label>
            <div style={{ marginBottom: '0.25rem' }}>Citation text</div>
            <input
              aria-label="Reference citation"
              value={refCitation}
              onChange={(e) => setRefCitation(e.target.value)}
              placeholder="Required (CAP-07): human-readable citation"
              style={{ width: '100%' }}
              disabled={refBusy}
            />
          </label>

          <label>
            <div style={{ marginBottom: '0.25rem' }}>Redistribution allowed</div>
            <select
              aria-label="Reference redistribution"
              value={refRedistributionAllowed}
              onChange={(e) => setRefRedistributionAllowed(e.target.value as 'unknown' | 'yes' | 'no')}
              disabled={refBusy}
            >
              <option value="unknown">Unknown (default restrictive)</option>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={onImportReference} disabled={refBusy}>
              {refBusy ? 'Importing…' : 'Import reference'}
            </button>
            <button type="button" onClick={refreshDatasets} disabled={refBusy}>
              Refresh list
            </button>
          </div>

          <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Line list (CSV URL)</div>

            <label>
              <div style={{ marginBottom: '0.25rem' }}>CSV URL</div>
              <input
                aria-label="Line list URL"
                value={lineUrl}
                onChange={(e) => setLineUrl(e.target.value)}
                placeholder="https://.../lines.csv"
                style={{ width: '100%' }}
                disabled={refBusy}
              />
            </label>

            <label>
              <div style={{ marginBottom: '0.25rem' }}>Title</div>
              <input
                aria-label="Line list title"
                value={lineTitle}
                onChange={(e) => setLineTitle(e.target.value)}
                placeholder="e.g., NIST ASD Lines: Fe II"
                style={{ width: '100%' }}
                disabled={refBusy}
              />
            </label>

            <label>
              <div style={{ marginBottom: '0.25rem' }}>Source name</div>
              <input
                aria-label="Line list source name"
                value={lineSourceName}
                onChange={(e) => setLineSourceName(e.target.value)}
                style={{ width: '100%' }}
                disabled={refBusy}
              />
            </label>

            <label>
              <div style={{ marginBottom: '0.25rem' }}>Citation text</div>
              <input
                aria-label="Line list citation"
                value={lineCitation}
                onChange={(e) => setLineCitation(e.target.value)}
                placeholder="Required (CAP-07): human-readable citation"
                style={{ width: '100%' }}
                disabled={refBusy}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <label>
                <div style={{ marginBottom: '0.25rem' }}>X unit</div>
                <input
                  aria-label="Line list x unit"
                  value={lineXUnit}
                  onChange={(e) => setLineXUnit(e.target.value)}
                  style={{ width: '100%' }}
                  disabled={refBusy}
                />
              </label>
              <label>
                <div style={{ marginBottom: '0.25rem' }}>Delimiter</div>
                <select
                  aria-label="Line list delimiter"
                  value={lineDelimiter}
                  onChange={(e) => setLineDelimiter(e.target.value)}
                  disabled={refBusy}
                >
                  <option value=",">Comma</option>
                  <option value="\t">Tab</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <button type="button" onClick={onImportLineList} disabled={refBusy}>
                {refBusy ? 'Importing…' : 'Import line list'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Add telescope data (CAP-08, MAST)</h2>
        <p style={{ marginTop: '0.25rem' }}>
          Search MAST by target name, choose an observation + product, preview extraction candidates, then import with
          citation-first provenance.
        </p>

        {mastError ? (
          <div style={{ border: '1px solid #e5e7eb', padding: '0.5rem', marginTop: '0.5rem' }}>
            <p style={{ color: 'crimson', margin: 0 }}>{mastError}</p>
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: '0.5rem', maxWidth: 900 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.5rem' }}>
            <label>
              <div style={{ marginBottom: '0.25rem' }}>Target name</div>
              <input
                aria-label="MAST target"
                value={mastTarget}
                onChange={(e) => setMastTarget(e.target.value)}
                placeholder="e.g., M101"
                disabled={mastBusy}
                style={{ width: '100%' }}
              />
            </label>
            <label>
              <div style={{ marginBottom: '0.25rem' }}>Radius (deg)</div>
              <input
                aria-label="MAST radius"
                value={mastRadius}
                onChange={(e) => setMastRadius(e.target.value)}
                placeholder="0.1"
                disabled={mastBusy}
                style={{ width: '100%' }}
              />
            </label>
            <label>
              <div style={{ marginBottom: '0.25rem' }}>Mission</div>
              <select
                aria-label="MAST mission"
                value={mastMission}
                onChange={(e) => setMastMission(e.target.value as 'JWST' | 'HST' | 'HLSP' | '')}
                disabled={mastBusy}
                style={{ width: '100%' }}
              >
                <option value="">(any)</option>
                <option value="JWST">JWST</option>
                <option value="HST">HST</option>
                <option value="HLSP">HLSP</option>
              </select>
            </label>
            <label>
              <div style={{ marginBottom: '0.25rem' }}>Data type</div>
              <select
                aria-label="MAST data type"
                value={mastDataType}
                onChange={(e) => setMastDataType(e.target.value as 'spectrum' | 'cube' | '')}
                disabled={mastBusy}
                style={{ width: '100%' }}
              >
                <option value="">(any)</option>
                <option value="spectrum">spectrum</option>
                <option value="cube">cube</option>
              </select>
            </label>
          </div>

          <label>
            <div style={{ marginBottom: '0.25rem' }}>Citation text</div>
            <input
              aria-label="MAST citation"
              value={mastCitation}
              onChange={(e) => setMastCitation(e.target.value)}
              placeholder="Required (CAP-08): human-readable citation"
              disabled={mastBusy}
              style={{ width: '100%' }}
            />
          </label>

          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={mastRefresh}
              onChange={(e) => setMastRefresh(e.target.checked)}
              disabled={mastBusy}
            />
            Refresh (re-download; otherwise uses cached product if available)
          </label>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={onMastSearch} disabled={mastBusy}>
              {mastBusy ? 'Searching…' : 'Search'}
            </button>
            <button type="button" onClick={refreshDatasets} disabled={mastBusy}>
              Refresh list
            </button>
          </div>

          {mastResolved ? (
            <div style={{ fontSize: '0.875rem', opacity: 0.85 }}>
              Resolved: RA {mastResolved.ra.toFixed(6)}, Dec {mastResolved.dec.toFixed(6)}
            </div>
          ) : null}

          {mastCaomRows.length ? (
            <div style={{ border: '1px solid #e5e7eb', overflow: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                      Select
                    </th>
                    <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                      obsid
                    </th>
                    <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                      mission
                    </th>
                    <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                      target
                    </th>
                    <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                      type
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mastCaomRows.slice(0, 25).map((r, idx) => (
                    <tr key={String(r.obsid ?? idx)}>
                      <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                        <button
                          type="button"
                          onClick={() => onMastSelectObservation(r.obsid ?? null)}
                          disabled={mastBusy || r.obsid == null}
                        >
                          {mastSelectedObsId === r.obsid ? 'Selected' : 'Choose'}
                        </button>
                      </td>
                      <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                        {r.obsid != null ? String(r.obsid) : ''}
                      </td>
                      <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                        {r.obs_collection ?? ''}
                      </td>
                      <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                        {r.target_name ?? ''}
                      </td>
                      <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                        {r.dataproduct_type ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {mastProducts.length ? (
            <div>
              <div style={{ fontWeight: 700, marginTop: '0.5rem' }}>Products</div>
              <div style={{ border: '1px solid #e5e7eb', overflow: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                        Select
                      </th>
                      <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                        recommended
                      </th>
                      <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                        filename
                      </th>
                      <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                        calib
                      </th>
                      <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                        type
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mastProducts.slice(0, 50).map((p, idx) => {
                      const uri = typeof p.dataURI === 'string' ? p.dataURI : ''
                      const filename = p.productFilename ?? ''
                      const selected = uri && uri === mastSelectedDataURI
                      return (
                        <tr key={uri || `${idx}`}> 
                          <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                            <input
                              type="radio"
                              name="mast-product"
                              checked={selected}
                              disabled={mastBusy || !uri}
                              onChange={() => {
                                setMastSelectedDataURI(uri)
                                setMastSelectedFilename(filename)
                                setMastTitle((prev) => prev.trim() || filename)
                                setMastPreview(null)
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                            {p.recommended ? 'yes' : ''}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>{filename}</td>
                          <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                            {typeof p.calib_level === 'number' ? String(p.calib_level) : ''}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #f3f4f6' }}>{p.productType ?? ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                <button type="button" onClick={onMastPreview} disabled={mastBusy || !mastSelectedDataURI.trim()}>
                  {mastBusy ? 'Loading…' : 'Preview extraction'}
                </button>
              </div>
            </div>
          ) : null}

          {mastPreview ? (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ fontWeight: 700 }}>Preview</div>
              {mastPreview.warnings.length ? (
                <ul>
                  {mastPreview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}

              {mastPreview.cache ? (
                <div
                  style={{
                    marginTop: '0.5rem',
                    border: '1px solid #e5e7eb',
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    background: '#f9fafb',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Cache</div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                    <div>
                      Hit:{' '}
                      {typeof mastPreview.cache.cache_hit === 'boolean'
                        ? mastPreview.cache.cache_hit
                          ? 'yes'
                          : 'no'
                        : 'unknown'}
                      {typeof mastPreview.cache.refresh === 'boolean'
                        ? ` (refresh: ${mastPreview.cache.refresh ? 'yes' : 'no'})`
                        : ''}
                    </div>
                    {mastPreview.cache.latest ? (
                      <div>
                        Latest:{' '}
                        {mastPreview.cache.latest.downloaded_at ? mastPreview.cache.latest.downloaded_at : '(unknown time)'}
                        {mastPreview.cache.latest.sha256
                          ? ` — ${mastPreview.cache.latest.sha256.slice(0, 12)}…`
                          : ''}
                        {typeof mastPreview.cache.latest.bytes === 'number' ? ` (${mastPreview.cache.latest.bytes} bytes)` : ''}
                      </div>
                    ) : null}
                    {mastPreview.cache.versions?.length ? (
                      <div style={{ marginTop: '0.25rem' }}>
                        Versions: {mastPreview.cache.versions.length}
                        <ul style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                          {mastPreview.cache.versions.slice(0, 10).map((v, idx) => (
                            <li key={(v.sha256 ?? '') + idx}>
                              {v.downloaded_at ? v.downloaded_at : '(unknown time)'}
                              {v.sha256 ? ` — ${v.sha256.slice(0, 12)}…` : ''}
                              {typeof v.bytes === 'number' ? ` (${v.bytes} bytes)` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
                <label>
                  <div style={{ marginBottom: '0.25rem' }}>Title</div>
                  <input
                    aria-label="MAST title"
                    value={mastTitle}
                    onChange={(e) => setMastTitle(e.target.value)}
                    disabled={mastBusy}
                    style={{ width: '100%' }}
                  />
                </label>

                <label>
                  <div style={{ marginBottom: '0.25rem' }}>FITS HDU</div>
                  <select
                    aria-label="MAST HDU"
                    value={mastHduIndex}
                    onChange={(e) => {
                      const next = e.target.value === '' ? '' : Number(e.target.value)
                      setMastHduIndex(next)
                      const cand = mastPreview.fits_hdu_candidates.find((c) => c.hdu_index === next)
                      if (cand) {
                        setMastXIndex(cand.suggested_x_index ?? '')
                        setMastYIndex(cand.suggested_y_index ?? '')
                      }
                    }}
                    disabled={mastBusy}
                    style={{ width: '100%' }}
                  >
                    <option value="">(select)</option>
                    {mastPreview.fits_hdu_candidates.map((c) => (
                      <option key={c.hdu_index} value={c.hdu_index}>
                        {c.hdu_index}: {c.hdu_name}
                      </option>
                    ))}
                  </select>
                </label>

                {mastHduIndex !== '' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <label>
                      <div style={{ marginBottom: '0.25rem' }}>X column</div>
                      <select
                        aria-label="MAST X column"
                        value={mastXIndex}
                        onChange={(e) => setMastXIndex(e.target.value === '' ? '' : Number(e.target.value))}
                        disabled={mastBusy}
                        style={{ width: '100%' }}
                      >
                        <option value="">(select)</option>
                        {mastPreview.fits_hdu_candidates
                          .find((c) => c.hdu_index === mastHduIndex)
                          ?.columns.map((name, idx) => (
                            <option key={name + idx} value={idx}>
                              {idx}: {name}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label>
                      <div style={{ marginBottom: '0.25rem' }}>Y column</div>
                      <select
                        aria-label="MAST Y column"
                        value={mastYIndex}
                        onChange={(e) => setMastYIndex(e.target.value === '' ? '' : Number(e.target.value))}
                        disabled={mastBusy}
                        style={{ width: '100%' }}
                      >
                        <option value="">(select)</option>
                        {mastPreview.fits_hdu_candidates
                          .find((c) => c.hdu_index === mastHduIndex)
                          ?.columns.map((name, idx) => (
                            <option key={name + idx} value={idx}>
                              {idx}: {name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <label>
                    <div style={{ marginBottom: '0.25rem' }}>X unit</div>
                    <input
                      aria-label="MAST X unit"
                      value={mastXUnit}
                      onChange={(e) => setMastXUnit(e.target.value)}
                      placeholder="e.g., um"
                      disabled={mastBusy}
                      style={{ width: '100%' }}
                    />
                  </label>
                  <label>
                    <div style={{ marginBottom: '0.25rem' }}>Y unit</div>
                    <input
                      aria-label="MAST Y unit"
                      value={mastYUnit}
                      onChange={(e) => setMastYUnit(e.target.value)}
                      placeholder="e.g., Jy"
                      disabled={mastBusy}
                      style={{ width: '100%' }}
                    />
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={onMastImport}
                    disabled={
                      mastBusy ||
                      !mastSelectedDataURI.trim() ||
                      mastHduIndex === '' ||
                      mastXIndex === '' ||
                      mastYIndex === '' ||
                      !mastTitle.trim()
                    }
                  >
                    {mastBusy ? 'Importing…' : 'Import telescope dataset'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {mastImported ? (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ fontWeight: 700 }}>Imported</div>
              <pre
                style={{
                  background: '#f3f4f6',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(mastImported, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </div>

      {commitResult ? (
        <div style={{ marginTop: '1rem' }}>
          <h2 style={{ fontSize: '1rem' }}>Imported</h2>
          <pre style={{ background: '#f3f4f6', padding: '0.75rem', borderRadius: '0.5rem', overflow: 'auto' }}>
            {JSON.stringify(commitResult.dataset, null, 2)}
          </pre>
        </div>
      ) : null}

      {datasets.length ? (
        <div style={{ marginTop: '1rem' }}>
          <h2 style={{ fontSize: '1rem' }}>Datasets</h2>
          <ul>
            {datasets.map((d) => (
              <li key={d.id}>
                <div>
                  {d.name} ({d.id})
                </div>
                {d.reference ? (
                  <div style={{ fontSize: '0.875rem', opacity: 0.85 }}>
                    Reference{d.reference.data_type ? `: ${d.reference.data_type}` : ''}
                    {d.reference.source_name ? ` — ${d.reference.source_name}` : ''}
                    {typeof d.reference.citation_present === 'boolean'
                      ? ` (citation: ${d.reference.citation_present ? 'yes' : 'no'})`
                      : ''}
                    {d.reference.license_redistribution_allowed
                      ? ` (redistribution: ${d.reference.license_redistribution_allowed})`
                      : ''}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
