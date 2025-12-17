import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'

import architectureOverview from '../../../../docs/ARCHITECTURE_OVERVIEW.md?raw'
import docsIndex from '../../../../docs/index.md?raw'
import qualityGates from '../../../../docs/QUALITY_GATES.md?raw'
import readmeForAgents from '../../../../docs/README_FOR_AGENTS.md?raw'
import runbook from '../../../../docs/RUNBOOK.md?raw'
import troubleshooting from '../../../../docs/TROUBLESHOOTING.md?raw'
import uiContract from '../../../../docs/UI_CONTRACT.md?raw'
import capProgressInventory from '../../../../docs/CAP_PROGRESS_INVENTORY.md?raw'
import glossary from '../../../../docs/reference/glossary.md?raw'
import referenceLinks from '../../../../docs/references/REFERENCE_LINKS.md?raw'
import referencesRaw from '../../../../docs/library/REFERENCES.md?raw'

type DocEntry = {
  id: string
  title: string
  category: string
  content: string
}

const capDocs = import.meta.glob('../../../../docs/CAPS/CAP-*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function filenameToTitle(filename: string) {
  return filename.replace(/\.md$/i, '').replace(/_/g, ' ')
}

function filenameToDocId(filename: string) {
  const match = filename.match(/CAP-(\d\d)/i)
  if (match) return `cap-${match[1]}`
  return filename.replace(/\.md$/i, '').toLowerCase()
}

export function DocsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const docs = useMemo<DocEntry[]>(() => {
    const baseDocs: DocEntry[] = [
      { id: 'start-index', title: 'Start here', category: 'Start here', content: docsIndex },
      { id: 'cap-progress', title: 'CAP progress inventory', category: 'Start here', content: capProgressInventory },
      { id: 'agents-readme', title: 'README for agents', category: 'Agents', content: readmeForAgents },
      { id: 'agents-architecture', title: 'Architecture overview', category: 'Agents', content: architectureOverview },
      { id: 'agents-runbook', title: 'Runbook', category: 'Agents', content: runbook },
      { id: 'agents-troubleshooting', title: 'Troubleshooting', category: 'Agents', content: troubleshooting },
      { id: 'quality-gates', title: 'Quality gates', category: 'Agents', content: qualityGates },
      { id: 'ui-contract', title: 'UI contract', category: 'Agents', content: uiContract },
      { id: 'glossary', title: 'Glossary', category: 'Reference', content: glossary },
      { id: 'reference-links', title: 'Reference hub', category: 'Reference', content: referenceLinks },
      { id: 'references-raw', title: 'Reference links (raw)', category: 'Reference', content: referencesRaw },
    ]

    const capEntries = Object.entries(capDocs)
      .map(([path, content]) => {
        const filename = path.split(/[\\/]/).pop() ?? path
        return {
          id: filenameToDocId(filename),
          title: filenameToTitle(filename),
          category: 'CAP specs',
          content,
        } satisfies DocEntry
      })
      .sort((a, b) => a.title.localeCompare(b.title))

    return [...baseDocs, ...capEntries]
  }, [])

  const categories = useMemo(() => {
    const unique = new Set(docs.map((d) => d.category))
    return ['All', ...Array.from(unique)]
  }, [docs])

  const [category, setCategory] = useState(() => searchParams.get('cat') ?? 'All')
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [selectedDocId, setSelectedDocId] = useState(() => searchParams.get('doc') ?? 'start-index')

  useEffect(() => {
    // Ensure selected doc exists; fall back to Start.
    if (!docs.some((d) => d.id === selectedDocId)) {
      setSelectedDocId('start-index')
    }
  }, [docs, selectedDocId])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (category === 'All') next.delete('cat')
    else next.set('cat', category)

    if (query.trim() === '') next.delete('q')
    else next.set('q', query)

    if (selectedDocId === 'start-index') next.delete('doc')
    else next.set('doc', selectedDocId)

    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, query, selectedDocId])

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return docs
      .filter((d) => (category === 'All' ? true : d.category === category))
      .filter((d) => {
        if (!q) return true
        return d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)
      })
  }, [docs, category, query])

  const selectedDoc = useMemo(() => {
    return docs.find((d) => d.id === selectedDocId) ?? docs[0]
  }, [docs, selectedDocId])

  return (
    <section>
      <h1>Docs</h1>
      <p style={{ marginTop: '0.25rem', marginBottom: '0.75rem' }}>
        Local-first docs hub (CAP-14). Search is title + content; external links open in your browser.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem', minHeight: 0 }}>
        <aside style={{ borderRight: '1px solid #e5e7eb', paddingRight: '1rem', minHeight: 0 }}>
          <div>
            <label htmlFor="docs-search" style={{ display: 'block', fontWeight: 700, marginBottom: '0.25rem' }}>
              Search
            </label>
            <input
              id="docs-search"
              aria-label="Search docs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try: FITS, A/B, messy CSV, export"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Category</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    border: '1px solid #e5e7eb',
                    background: c === category ? '#e5e7eb' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', minHeight: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Pages</div>
            <div style={{ display: 'grid', gap: '0.25rem' }}>
              {filteredDocs.length ? (
                filteredDocs.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDocId(d.id)}
                    style={{
                      textAlign: 'left',
                      padding: '0.25rem 0.5rem',
                      border: '1px solid #e5e7eb',
                      background: d.id === selectedDocId ? '#e5e7eb' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {d.title}
                  </button>
                ))
              ) : (
                <p style={{ marginTop: '0.25rem' }}>No matches.</p>
              )}
            </div>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Quick answers</div>
            <div style={{ display: 'grid', gap: '0.25rem' }}>
              {[
                { label: 'Messy CSV', q: 'messy CSV' },
                { label: 'FITS', q: 'FITS' },
                { label: 'A/B', q: 'A/B' },
                { label: 'Normalization', q: 'normalization' },
                { label: 'Export bundles', q: 'export' },
                { label: 'MAST', q: 'MAST' },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setQuery(item.q)}
                  style={{
                    textAlign: 'left',
                    padding: '0.25rem 0.5rem',
                    border: '1px solid #e5e7eb',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>{selectedDoc?.title}</h2>
          <div style={{ border: '1px solid #e5e7eb', padding: '0.75rem', overflow: 'auto', maxHeight: '70vh' }}>
            <ReactMarkdown>{selectedDoc?.content ?? ''}</ReactMarkdown>
          </div>
        </main>
      </div>
    </section>
  )
}
