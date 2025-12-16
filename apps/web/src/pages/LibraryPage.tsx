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

export function LibraryPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<IngestPreviewResponse | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [xIndex, setXIndex] = useState<number | ''>('')
  const [yIndex, setYIndex] = useState<number | ''>('')
  const [xUnit, setXUnit] = useState('')
  const [yUnit, setYUnit] = useState('')
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [commitResult, setCommitResult] = useState<IngestCommitResponse | null>(null)

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
                {d.name} ({d.id})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
