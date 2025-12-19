import { useCallback, useMemo, useState } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'

import { PanelSlotsProvider } from './layout/PanelSlots'
import { loadCachedDatasets } from './lib/datasetCache'
import { buildMastHandoffUrl, loadMastHandoffPrefs } from './lib/mastHandoff'
import { loadTargetResolutionCache, parseRaDecDegrees } from './lib/targetResolution'
import { DocsPage } from './pages/DocsPage'
import { LibraryPage } from './pages/LibraryPage'
import { NotebookPage } from './pages/NotebookPage'
import { PlotPage } from './pages/PlotPage'

const navStyle = ({ isActive }: { isActive: boolean }) => ({
  fontWeight: isActive ? 700 : 500,
  textDecoration: 'none',
  padding: '0.35rem 0.6rem',
  borderRadius: 'var(--radius-md)',
  border: `1px solid ${isActive ? 'rgb(from var(--border) r g b)' : 'transparent'}`,
  background: isActive ? 'rgb(from var(--muted) r g b)' : 'transparent',
  transition: 'background-color 160ms ease, border-color 160ms ease',
})

const borderColor = 'rgb(from var(--border) r g b)'
const popoverBg = 'rgb(from var(--popover) r g b)'
const inputBg = 'rgb(from var(--input) r g b)'
const textMuted = 'rgb(from var(--muted-foreground) r g b)'

function readStoredBool(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch {
    // ignore
  }
  return fallback
}

function writeStoredBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    // ignore
  }
}

function AppShell() {
  const navigate = useNavigate()
  const [leftCollapsed, setLeftCollapsed] = useState(() => readStoredBool('ui.leftCollapsed', false))
  const [rightCollapsed, setRightCollapsed] = useState(() => readStoredBool('ui.rightCollapsed', true))
  const [rightTab, setRightTab] = useState<'inspector' | 'notebook'>('inspector')
  const [rightSlot, setRightSlot] = useState<HTMLElement | null>(null)

  const [globalSearch, setGlobalSearch] = useState('')
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)

  const onRightSlotRef = useCallback((el: HTMLDivElement | null) => {
    setRightSlot((prev) => (prev === el ? prev : el))
  }, [])

  const leftWidth = leftCollapsed ? '0px' : '420px'
  const rightWidth = rightCollapsed ? '0px' : '360px'

  const globalSearchQuery = globalSearch.trim().toLowerCase()
  const cachedDatasets = loadCachedDatasets()
  const rawSearch = globalSearch.trim()
  const coords = rawSearch ? parseRaDecDegrees(rawSearch) : null
  const cachedTarget = rawSearch ? loadTargetResolutionCache(rawSearch) : null

  const datasetMatches = useMemo(() => {
    if (!globalSearchQuery) return []
    const out = cachedDatasets.filter((d) => {
      const name = (d.name || '').toLowerCase()
      const id = (d.id || '').toLowerCase()
      return name.includes(globalSearchQuery) || id.includes(globalSearchQuery)
    })
    return out.slice(0, 10)
  }, [cachedDatasets, globalSearchQuery])

  const showDropdown = globalSearchOpen && (globalSearchQuery.length > 0 || cachedDatasets.length > 0)

  function onGoToDataset(datasetId: string) {
    setGlobalSearchOpen(false)
    setGlobalSearch('')
    navigate(`/plot?dataset=${encodeURIComponent(datasetId)}`)
  }

  function onStartMastSearch(target: string) {
    setGlobalSearchOpen(false)
    setGlobalSearch('')
    const token = String(Date.now())
    const prefs = loadMastHandoffPrefs()
    navigate(buildMastHandoffUrl({ target, autoSearch: true, token, prefs }))
  }

  function onGoToPage(path: string) {
    setGlobalSearchOpen(false)
    setGlobalSearch('')
    navigate(path)
  }

  return (
    <PanelSlotsProvider value={{ rightSlot }}>
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        height: '100vh',
        minHeight: 0,
        background: 'rgb(from var(--background) r g b)',
        color: 'rgb(from var(--foreground) r g b)',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          borderBottom: `1px solid ${borderColor}`,
          padding: '0.75rem 1rem',
          background: 'rgb(from var(--card) r g b / 0.85)',
          backdropFilter: 'blur(8px)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <nav style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="nav-library"
            onClick={() => {
              setLeftCollapsed((prev) => {
                const next = !prev
                writeStoredBool('ui.leftCollapsed', next)
                return next
              })
            }}
            style={{
              fontWeight: leftCollapsed ? 400 : 700,
              padding: '0.35rem 0.6rem',
              border: `1px solid ${borderColor}`,
              background: leftCollapsed ? 'transparent' : 'rgb(from var(--muted) r g b)',
              cursor: 'pointer',
              borderRadius: 'var(--radius-md)',
              transition: 'background-color 160ms ease, border-color 160ms ease',
            }}
            title={leftCollapsed ? 'Show Library panel' : 'Hide Library panel'}
          >
            Library
          </button>

          <NavLink to="/plot" data-testid="nav-plot" style={navStyle}>
            Plot
          </NavLink>

          <button
            type="button"
            data-testid="nav-notebook"
            onClick={() => {
              setRightCollapsed((prev) => {
                const next = !prev
                writeStoredBool('ui.rightCollapsed', next)
                return next
              })
              setRightTab('inspector')
            }}
            style={{
              fontWeight: rightCollapsed ? 400 : 700,
              padding: '0.35rem 0.6rem',
              border: `1px solid ${borderColor}`,
              background: rightCollapsed ? 'transparent' : 'rgb(from var(--muted) r g b)',
              cursor: 'pointer',
              borderRadius: 'var(--radius-md)',
              transition: 'background-color 160ms ease, border-color 160ms ease',
            }}
            title={rightCollapsed ? 'Show Inspector panel' : 'Hide Inspector panel'}
          >
            Inspector
          </button>

          <NavLink to="/docs" data-testid="nav-docs" style={navStyle}>
            Docs
          </NavLink>

          <div style={{ marginLeft: 'auto', position: 'relative', minWidth: 260, flex: '1 1 260px', maxWidth: 520 }}>
            <input
              aria-label="Global search"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onFocus={() => setGlobalSearchOpen(true)}
              onBlur={() => setGlobalSearchOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setGlobalSearchOpen(false)
                  return
                }
                if (e.key === 'Enter') {
                  const first = datasetMatches[0]
                  if (first) {
                    e.preventDefault()
                    onGoToDataset(first.id)
                    return
                  }

                  // Only launch MAST on Enter when the intent is unambiguous.
                  if (coords && rawSearch) {
                    e.preventDefault()
                    onStartMastSearch(rawSearch)
                  }
                }
              }}
              placeholder="Search (datasets / pages)…"
              style={{
                width: '100%',
                padding: '0.45rem 0.6rem',
                border: `1px solid ${borderColor}`,
                borderRadius: 'var(--radius-md)',
                background: inputBg,
                color: 'rgb(from var(--foreground) r g b)',
                boxShadow: 'var(--shadow-xs)',
              }}
            />

            {showDropdown ? (
              <div
                role="listbox"
                aria-label="Global search results"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 0.25rem)',
                  left: 0,
                  right: 0,
                  border: `1px solid ${borderColor}`,
                  background: popoverBg,
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  zIndex: 50,
                  boxShadow: 'var(--shadow-md)',
                }}
                // prevent blur when clicking inside the dropdown
                onMouseDown={(e) => e.preventDefault()}
              >
                <div style={{ fontSize: '0.75rem', color: textMuted, marginBottom: '0.25rem' }}>Pages</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => onGoToPage('/plot')}
                    style={{
                      border: `1px solid ${borderColor}`,
                      background: 'rgb(from var(--card) r g b)',
                      cursor: 'pointer',
                      padding: '0.35rem 0.6rem',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    Plot
                  </button>
                  <button
                    type="button"
                    onClick={() => onGoToPage('/docs')}
                    style={{
                      border: `1px solid ${borderColor}`,
                      background: 'rgb(from var(--card) r g b)',
                      cursor: 'pointer',
                      padding: '0.35rem 0.6rem',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    Docs
                  </button>
                </div>

                <div style={{ fontSize: '0.75rem', color: textMuted, marginBottom: '0.25rem' }}>Datasets</div>
                {datasetMatches.length ? (
                  <div style={{ display: 'grid', gap: '0.25rem' }}>
                    {datasetMatches.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => onGoToDataset(d.id)}
                        style={{
                          textAlign: 'left',
                          border: `1px solid ${borderColor}`,
                          padding: '0.35rem 0.6rem',
                          background: 'rgb(from var(--card) r g b)',
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{d.name || d.id}</div>
                        <div style={{ fontSize: '0.75rem', color: textMuted }}>{d.id}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.875rem', color: textMuted }}>
                    {globalSearchQuery ? 'No matching cached datasets.' : 'Type to search cached datasets.'}
                  </div>
                )}

                <div style={{ fontSize: '0.75rem', color: textMuted, marginTop: '0.5rem' }}>
                  Uses cached dataset list (CAP-15); open Library to refresh.
                </div>

                {rawSearch ? (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: textMuted, marginBottom: '0.25rem' }}>Targets (CAP-15)</div>
                    <div style={{ display: 'grid', gap: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => onStartMastSearch(rawSearch)}
                        style={{
                          textAlign: 'left',
                          border: `1px solid ${borderColor}`,
                          padding: '0.35rem 0.6rem',
                          background: 'rgb(from var(--card) r g b)',
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {coords ? 'Search MAST using coordinates' : 'Search MAST for target'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: textMuted }}>{rawSearch}</div>
                      </button>

                      {cachedTarget?.candidates?.length ? (
                        <div style={{ fontSize: '0.75rem', color: textMuted, marginTop: '0.25rem' }}>
                          Cached target candidates: {cachedTarget.candidates.length}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </nav>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${leftWidth} minmax(0, 1fr) ${rightWidth}`,
          minHeight: 0,
        }}
      >
        <aside
          aria-label="Library panel"
          style={{
            borderRight: leftCollapsed ? 'none' : `1px solid ${borderColor}`,
            overflow: 'auto',
            padding: leftCollapsed ? 0 : '0.75rem',
            minHeight: 0,
            display: leftCollapsed ? 'none' : 'block',
            background: 'rgb(from var(--sidebar) r g b)',
            color: 'rgb(from var(--sidebar-foreground) r g b)',
            boxShadow: leftCollapsed ? 'none' : 'var(--shadow-sm)',
          }}
        >
          <LibraryPage />
        </aside>

        <main style={{ padding: '0.75rem', overflow: 'auto', minHeight: 0 }}>
          <Outlet />
        </main>

        <aside
          aria-label="Notebook panel"
          style={{
            borderLeft: rightCollapsed ? 'none' : `1px solid ${borderColor}`,
            overflow: 'auto',
            padding: rightCollapsed ? 0 : '0.75rem',
            minHeight: 0,
            display: rightCollapsed ? 'none' : 'block',
            background: 'rgb(from var(--sidebar) r g b)',
            color: 'rgb(from var(--sidebar-foreground) r g b)',
            boxShadow: rightCollapsed ? 'none' : 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setRightTab('inspector')}
              style={{
                fontWeight: rightTab === 'inspector' ? 700 : 400,
                padding: '0.25rem 0.5rem',
                border: `1px solid ${borderColor}`,
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Inspector
            </button>
            <button
              type="button"
              onClick={() => setRightTab('notebook')}
              style={{
                fontWeight: rightTab === 'notebook' ? 700 : 400,
                padding: '0.25rem 0.5rem',
                border: `1px solid ${borderColor}`,
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Notebook
            </button>
          </div>

          <div style={{ display: rightTab === 'inspector' ? 'block' : 'none' }}>
            <div ref={onRightSlotRef} />
          </div>

          <div style={{ display: rightTab === 'notebook' ? 'block' : 'none' }}>
            <NotebookPage />
          </div>
        </aside>
      </div>
    </div>
    </PanelSlotsProvider>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/plot" replace />} />
        <Route path="/plot" element={<PlotPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/library" element={<Navigate to="/plot" replace />} />
        <Route path="/notebook" element={<Navigate to="/plot" replace />} />
      </Route>
    </Routes>
  )
}

export default App
