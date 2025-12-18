import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getActiveSessionId, setActiveSessionId } from '../lib/sessionLogging'

type SessionSummary = {
  id: string
  title: string
  created_at: string
  event_count: number
  last_event_at?: string | null
}

type SessionEvent = {
  id: string
  created_at: string
  type: string
  message?: string | null
  payload?: Record<string, unknown> | null
}

type SessionDetail = SessionSummary & {
  events: SessionEvent[]
}

function formatTimestamp(iso: string | undefined | null) {
  const raw = (iso ?? '').trim()
  if (!raw) return ''
  try {
    return new Date(raw).toLocaleString()
  } catch {
    return raw
  }
}

export function NotebookPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<SessionDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(() => getActiveSessionId())

  const hasPlotSnapshotDraft = (() => {
    try {
      const raw = localStorage.getItem('session.plotSnapshotDraft.v1')
      return !!(raw && raw.trim())
    } catch {
      return false
    }
  })()

  const selectedTitle = useMemo(() => {
    if (selected) return selected.title
    const s = sessions.find((x) => x.id === selectedId)
    return s?.title ?? ''
  }, [selected, selectedId, sessions])

  async function refreshSessions() {
    const res = await fetch('http://localhost:8000/sessions')
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
    const json = (await res.json()) as SessionSummary[]
    setSessions(json)
    if (!selectedId && json[0]?.id) {
      setSelectedId(json[0].id)
    }
  }

  async function loadSelected(sessionId: string) {
    const res = await fetch(`http://localhost:8000/sessions/${encodeURIComponent(sessionId)}`)
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
    const json = (await res.json()) as SessionDetail
    setSelected(json)
  }

  useEffect(() => {
    let cancelled = false
    setError(null)
    setBusy(true)

    refreshSessions()
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (cancelled) return
        setBusy(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      return
    }
    let cancelled = false
    setError(null)
    setBusy(true)
    loadSelected(selectedId)
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (cancelled) return
        setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  async function onNewSession() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('http://localhost:8000/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      })
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
      const json = (await res.json()) as SessionDetail
      await refreshSessions()
      setSelectedId(json.id)
      setSelected(json)
      setNoteText('')

      // Default new sessions to active to reduce friction.
      setActiveSessionId(json.id)
      setActiveSessionIdState(json.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function onSetActive() {
    if (!selectedId) return
    setActiveSessionId(selectedId)
    setActiveSessionIdState(selectedId)
  }

  function onClearActive() {
    setActiveSessionId(null)
    setActiveSessionIdState(null)
  }

  async function onAddNote() {
    if (!selectedId) return
    const message = noteText.trim()
    if (!message) return

    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`http://localhost:8000/sessions/${encodeURIComponent(selectedId)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'note', message }),
      })
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
      setNoteText('')
      await refreshSessions()
      await loadSelected(selectedId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onSavePlotSnapshot() {
    if (!selectedId) return

    setError(null)
    setBusy(true)
    try {
      // Ask PlotPage to capture and persist a draft, then save it as a session event.
      const requestId = String(Date.now())
      const detail = { sessionId: selectedId, requestId }

      const saved = await new Promise<boolean>((resolve) => {
        let settled = false
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          resolve(false)
        }, 1500)

        function onAck(e: Event) {
          const ev = e as CustomEvent<{ requestId?: string; ok?: boolean; error?: string }>
          if (ev.detail?.requestId !== requestId) return
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve(Boolean(ev.detail?.ok))
        }

        window.addEventListener('spectra:plot-snapshot-saved', onAck)
        window.dispatchEvent(new CustomEvent('spectra:save-plot-snapshot', { detail }))

        // cleanup
        setTimeout(() => window.removeEventListener('spectra:plot-snapshot-saved', onAck), 2000)
      })

      if (!saved) {
        throw new Error('Could not save snapshot. Make sure the Plot page is open and try again.')
      }

      await refreshSessions()
      await loadSelected(selectedId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function onRestoreSnapshot(eventId: string) {
    if (!selectedId) return
    navigate(`/plot?restoreSession=${encodeURIComponent(selectedId)}&restoreEvent=${encodeURIComponent(eventId)}`)
  }

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Notebook</h2>
      <p style={{ marginTop: 0 }}>Session notebook and history (CAP-10 MVP).</p>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <button
          type="button"
          onClick={onNewSession}
          disabled={busy}
          style={{
            padding: '0.25rem 0.5rem',
            border: '1px solid #e5e7eb',
            background: 'transparent',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          New session
        </button>

        <button
          type="button"
          onClick={onSetActive}
          disabled={busy || !selectedId}
          style={{
            padding: '0.25rem 0.5rem',
            border: '1px solid #e5e7eb',
            background: 'transparent',
            cursor: busy || !selectedId ? 'not-allowed' : 'pointer',
          }}
          title="Mark the selected session as active for auto-logging"
        >
          Set active
        </button>

        <button
          type="button"
          onClick={onClearActive}
          disabled={busy || !activeSessionId}
          style={{
            padding: '0.25rem 0.5rem',
            border: '1px solid #e5e7eb',
            background: 'transparent',
            cursor: busy || !activeSessionId ? 'not-allowed' : 'pointer',
          }}
          title="Disable auto-logging"
        >
          Clear active
        </button>

        {busy ? <span style={{ opacity: 0.7 }}>Working…</span> : null}
        {activeSessionId ? <span style={{ opacity: 0.8 }}>Active: {activeSessionId.slice(0, 8)}…</span> : null}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <button
          type="button"
          onClick={onSavePlotSnapshot}
          disabled={busy || !selectedId}
          style={{
            padding: '0.25rem 0.5rem',
            border: '1px solid #e5e7eb',
            background: 'transparent',
            cursor: busy || !selectedId ? 'not-allowed' : 'pointer',
          }}
          title="Save the current Plot state into the selected session as a snapshot event"
        >
          Save plot snapshot
        </button>
        {!hasPlotSnapshotDraft ? <span style={{ opacity: 0.75 }}>Open Plot to enable snapshots.</span> : null}
      </div>

      {error ? (
        <div style={{ border: '1px solid #ef4444', padding: '0.5rem', marginBottom: '0.75rem' }}>{error}</div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Sessions</div>
          {sessions.length === 0 ? <div style={{ opacity: 0.8 }}>No sessions yet.</div> : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {sessions.map((s) => {
              const active = s.id === selectedId
              const isSessionActive = s.id === activeSessionId
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  disabled={busy}
                  style={{
                    textAlign: 'left',
                    padding: '0.25rem 0.5rem',
                    border: '1px solid #e5e7eb',
                    background: 'transparent',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    fontWeight: active ? 700 : 400,
                  }}
                  title={formatTimestamp(s.last_event_at || s.created_at)}
                >
                  {s.title} ({s.event_count}){isSessionActive ? ' • active' : ''}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Current session</div>
          {!selectedId ? <div style={{ opacity: 0.8 }}>Select a session.</div> : null}
          {selected ? (
            <div style={{ border: '1px solid #e5e7eb', padding: '0.5rem' }}>
              <div style={{ fontWeight: 700 }}>{selectedTitle}</div>
              <div style={{ opacity: 0.8, marginBottom: '0.5rem' }}>Created: {formatTimestamp(selected.created_at)}</div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note…"
                  style={{ flex: 1, padding: '0.25rem 0.5rem', border: '1px solid #e5e7eb' }}
                />
                <button
                  type="button"
                  onClick={onAddNote}
                  disabled={busy || !noteText.trim()}
                  style={{
                    padding: '0.25rem 0.5rem',
                    border: '1px solid #e5e7eb',
                    background: 'transparent',
                    cursor: busy || !noteText.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  Add
                </button>
              </div>

              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Timeline</div>
              {selected.events.length === 0 ? (
                <div style={{ opacity: 0.8 }}>No events yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selected.events
                    .slice()
                    .reverse()
                    .map((e) => (
                      <div
                        key={e.id}
                        style={{
                          border: '1px solid #e5e7eb',
                          padding: '0.5rem',
                          borderRadius: '0.5rem',
                          background: '#f9fafb',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <div style={{ fontWeight: 700 }}>{e.type}</div>
                          <div style={{ opacity: 0.8, fontSize: '0.85rem' }}>{formatTimestamp(e.created_at)}</div>
                        </div>
                        {e.message ? <div style={{ marginTop: '0.25rem' }}>{e.message}</div> : null}
                        {e.type === 'snapshot' ? (
                          <div style={{ marginTop: '0.5rem' }}>
                            <button type="button" onClick={() => onRestoreSnapshot(e.id)} style={{ cursor: 'pointer' }}>
                              Restore in Plot
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
