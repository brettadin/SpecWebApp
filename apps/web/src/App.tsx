import { useCallback, useState } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { PanelSlotsProvider } from './layout/PanelSlots'
import { DocsPage } from './pages/DocsPage'
import { LibraryPage } from './pages/LibraryPage'
import { NotebookPage } from './pages/NotebookPage'
import { PlotPage } from './pages/PlotPage'

const navStyle = ({ isActive }: { isActive: boolean }) => ({
  fontWeight: isActive ? 700 : 400,
  textDecoration: 'none',
  padding: '0.25rem 0.5rem',
})

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
  const [leftCollapsed, setLeftCollapsed] = useState(() => readStoredBool('ui.leftCollapsed', false))
  const [rightCollapsed, setRightCollapsed] = useState(() => readStoredBool('ui.rightCollapsed', true))
  const [rightTab, setRightTab] = useState<'inspector' | 'notebook'>('inspector')
  const [rightSlot, setRightSlot] = useState<HTMLElement | null>(null)

  const onRightSlotRef = useCallback((el: HTMLDivElement | null) => {
    setRightSlot((prev) => (prev === el ? prev : el))
  }, [])

  const leftWidth = leftCollapsed ? '0px' : '420px'
  const rightWidth = rightCollapsed ? '0px' : '360px'

  return (
    <PanelSlotsProvider value={{ rightSlot }}>
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        height: '100vh',
        minHeight: 0,
      }}
    >
      <header style={{ borderBottom: '1px solid #e5e7eb', padding: '0.75rem 1rem' }}>
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
              padding: '0.25rem 0.5rem',
              border: '1px solid #e5e7eb',
              background: 'transparent',
              cursor: 'pointer',
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
              padding: '0.25rem 0.5rem',
              border: '1px solid #e5e7eb',
              background: 'transparent',
              cursor: 'pointer',
            }}
            title={rightCollapsed ? 'Show Inspector panel' : 'Hide Inspector panel'}
          >
            Inspector
          </button>

          <NavLink to="/docs" data-testid="nav-docs" style={navStyle}>
            Docs
          </NavLink>
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
            borderRight: leftCollapsed ? 'none' : '1px solid #e5e7eb',
            overflow: 'auto',
            padding: leftCollapsed ? 0 : '0.75rem',
            minHeight: 0,
            display: leftCollapsed ? 'none' : 'block',
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
            borderLeft: rightCollapsed ? 'none' : '1px solid #e5e7eb',
            overflow: 'auto',
            padding: rightCollapsed ? 0 : '0.75rem',
            minHeight: 0,
            display: rightCollapsed ? 'none' : 'block',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setRightTab('inspector')}
              style={{
                fontWeight: rightTab === 'inspector' ? 700 : 400,
                padding: '0.25rem 0.5rem',
                border: '1px solid #e5e7eb',
                background: 'transparent',
                cursor: 'pointer',
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
                border: '1px solid #e5e7eb',
                background: 'transparent',
                cursor: 'pointer',
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
