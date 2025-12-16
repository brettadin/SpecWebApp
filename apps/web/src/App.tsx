import { NavLink, Navigate, Route, Routes } from 'react-router-dom'

import { DocsPage } from './pages/DocsPage'
import { LibraryPage } from './pages/LibraryPage'
import { NotebookPage } from './pages/NotebookPage'
import { PlotPage } from './pages/PlotPage'

const navStyle = ({ isActive }: { isActive: boolean }) => ({
  fontWeight: isActive ? 700 : 400,
  textDecoration: 'none',
  padding: '0.25rem 0.5rem',
})

function App() {
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100vh' }}>
      <header style={{ borderBottom: '1px solid #e5e7eb', padding: '0.75rem 1rem' }}>
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          <NavLink to="/library" data-testid="nav-library" style={navStyle}>
            Library
          </NavLink>
          <NavLink to="/plot" data-testid="nav-plot" style={navStyle}>
            Plot
          </NavLink>
          <NavLink to="/notebook" data-testid="nav-notebook" style={navStyle}>
            Notebook
          </NavLink>
          <NavLink to="/docs" data-testid="nav-docs" style={navStyle}>
            Docs
          </NavLink>
        </nav>
      </header>

      <main style={{ padding: '1rem' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/plot" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/plot" element={<PlotPage />} />
          <Route path="/notebook" element={<NotebookPage />} />
          <Route path="/docs" element={<DocsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
